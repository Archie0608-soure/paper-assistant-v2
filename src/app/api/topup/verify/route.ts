import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const APP_ID = process.env.XUNHU_APP_ID || '';
const APP_SECRET = process.env.XUNHU_APP_SECRET || '';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

function generateNonceStr(): string {
  return Math.random().toString(36).slice(2) + Date.now();
}

function buildXhHash(data: Record<string, string>, secret: string): string {
  const sorted = Object.keys(data).sort();
  const parts: string[] = [];
  for (const key of sorted) {
    if (key === 'hash' || data[key] === '' || data[key] === undefined) continue;
    parts.push(`${key}=${data[key]}`);
  }
  const signStr = parts.join('&') + secret;
  return crypto.createHash('md5').update(signStr).digest('hex');
}

// 用户点击"验证支付" → 我们直接查虎皮椒订单状态
export async function POST(req: NextRequest) {
  try {
    // 验证登录
    const session = req.cookies.get('pa_session');
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
    const userField = type === 'email' ? 'email' : 'phone';

    const { order_no } = await req.json();
    console.log('[verify] order_no:', order_no);
    if (!order_no) {
      return NextResponse.json({ error: '缺少订单号' }, { status: 400 });
    }

    const supabase = getSupabase();

    // 查找本地订单
    const { data: order, error: orderError } = await supabase
      .from('topup_orders')
      .select('*')
      .eq('order_no', order_no)
      .single();

    console.log('[verify] query order:', order_no);
    if (orderError || !order) {
      console.log('[verify] order not found, error:', orderError);
      return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    }
    console.log('[verify] order found:', order.id, 'status:', order.status);

    // 已经到账了直接返回
    if (order.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        message: '金币已到账',
        coins: order.coins,
      });
    }

    // 调用虎皮椒查询订单状态
    const time = Math.floor(Date.now() / 1000);
    const nonceStr = generateNonceStr();
    const signData: Record<string, string> = {
      appid: APP_ID,
      trade_order_id: order_no,
      time: String(time),
      nonce_str: nonceStr,
    };
    const hash = buildXhHash(signData, APP_SECRET);
    signData['hash'] = hash;

    const payParams = new URLSearchParams();
    Object.entries(signData).forEach(([k, v]) => payParams.append(k, v));

    const xhRes = await fetch('https://api.dpweixin.com/payment/query.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payParams.toString(),
    });

    const xhData = await xhRes.json();
    console.log('虎皮椒查询结果:', JSON.stringify(xhData));

    // 虎皮椒返回：只有 status === 'OD' 才算真正已支付，其他都是未付款
    const isPaid = xhData.status === 'OD';

    console.log('订单状态判断:', order_no, '| status:', xhData.status, '| isPaid:', isPaid);

    if (!isPaid) {
      return NextResponse.json({
        status: xhData.status || 'pending',
        message: '暂未检测到支付，请稍后再试，或联系客服',
      });
    }

    // 支付成功，给用户加金币（幂等：只处理 pending 订单）
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('id', order.user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const newBalance = (user.balance || 0) + order.coins;

    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', order.user_id);

    await supabase
      .from('topup_orders')
      .update({ status: 'completed' })
      .eq('order_no', order_no)
      .eq('status', 'pending'); // 确保只更新 pending 订单

    await supabase.from('transactions').insert({
      user_id: order.user_id,
      type: 'recharge',
      amount: order.coins,
      description: `充值 ${order.coins} 金币（用户验证）`,
    });

    return NextResponse.json({
      success: true,
      status: 'completed',
      message: `支付成功！${order.coins} 金币已到账`,
      coins: order.coins,
      balance: newBalance,
    });

  } catch (error: any) {
    console.error('Verify payment error:', error);
    return NextResponse.json({ error: error.message || '验证失败' }, { status: 500 });
  }
}
