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
      // 本地没找到订单 → 直接查虎皮椒（兜底：initiate 失败的情况）
      console.log('[verify] order not found locally, querying 虎皮椒 for:', order_no);
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
      console.log('[verify] 虎皮椒 query result:', JSON.stringify(xhData));
      if (xhData.status !== 'OD') {
        return NextResponse.json({
          status: 'pending',
          message: '订单未找到，支付状态：' + (xhData.errmsg || xhData.status || '未知'),
        });
      }
      // 虎皮椒已支付，但本地无记录 → 从 order_title 解析金币数量重建订单
      const coinMatch = String(xhData.order_title || '').match(/(\d+)/);
      const coins = coinMatch ? parseInt(coinMatch[1]) : 100;
      const amount = parseFloat(xhData.total_fee) || coins / 10;
      // 从 session 解析的用户身份查用户 ID
      const { data: targetUser, error: userErr } = await supabase
        .from('users').select('id, balance').eq(userField, destination).single();
      if (userErr || !targetUser) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }
      const newBalance = (targetUser.balance || 0) + coins;
      await supabase.from('users').update({ balance: newBalance }).eq('id', targetUser.id);
      await supabase.from('topup_orders').insert({
        user_id: targetUser.id,
        order_no,
        amount,
        coins,
        status: 'completed',
        transaction_id: xhData.transaction_id || '',
        completed_at: new Date().toISOString(),
      });
      await supabase.from('transactions').insert({
        user_id: targetUser.id,
        type: 'recharge',
        amount: coins,
        description: `充值 ${coins} 金币（虎皮椒验证）`,
      });
      console.log('[verify] 本地无记录但虎皮椒已支付，已重建订单加金币:', coins);
      return NextResponse.json({
        success: true,
        status: 'completed',
        message: `支付成功！${coins} 金币已到账`,
        coins,
        balance: newBalance,
      });
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
