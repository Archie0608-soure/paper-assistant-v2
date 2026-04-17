import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const APP_ID = process.env.XUNHU_APP_ID || '';
const APP_SECRET = process.env.XUNHU_APP_SECRET || '';
const NOTIFY_URL = process.env.XUNHU_NOTIFY_URL; // 必须设置，不能有默认值

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

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : raw.startsWith('phone:') ? 'phone' : 'email';
    const destination = dest || beforeLast;
    const userField = type === 'email' ? 'email' : 'phone';

    const { coins } = await req.json();
    if (!coins) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    if (!NOTIFY_URL) {
      return NextResponse.json({ error: '服务器未配置支付回调地址，请联系管理员' }, { status: 500 });
    }

    const pkgMap: Record<number, number> = {
      100: 10, 600: 60, 1200: 120, 3000: 300, 6000: 600,
    };
    const amount = pkgMap[coins];
    if (!amount) {
      return NextResponse.json({ error: '无效的金币数量' }, { status: 400 });
    }

    const { data: user, error: userError } = await getSupabase()
      .from('users')
      .select('id, email, phone')
      .eq(userField, destination)
      .limit(1)
      .single() as any;

    if (userError || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const orderNo = `P${Date.now()}${user.id.slice(0, 6)}`;
    const title = `Pepper论文助手充值${coins}金币`;
    const nonceStr = generateNonceStr();
    const time = Math.floor(Date.now() / 1000);

    // 虎皮椒签名参数
    const signData: Record<string, string> = {
      version: '1.1',
      appid: APP_ID,
      trade_order_id: orderNo,
      total_fee: String(amount),
      title,
      time: String(time),
      notify_url: NOTIFY_URL,
      return_url: `https://pepperai.com.cn/topup/success?order=${orderNo}`,
      nonce_str: nonceStr,
    };

    const hash = buildXhHash(signData, APP_SECRET);
    signData['hash'] = hash;

    // 直接 POST 到虎皮椒获取二维码
    const payParams = new URLSearchParams();
    Object.entries(signData).forEach(([k, v]) => payParams.append(k, v));

    const xhRes = await fetch('https://api.dpweixin.com/payment/do.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payParams.toString(),
    });

    const xhData = await xhRes.json();

    if (xhData.errcode !== 0) {
      return NextResponse.json({ error: xhData.errmsg || '支付发起失败' }, { status: 400 });
    }

    // 保存订单
    await getSupabase()
      .from('topup_orders')
      .insert({
        user_id: user.id,
        order_no: orderNo,
        amount,
        coins,
        status: 'pending',
        method: 'wechat',
        email: user.email || null,
        phone: user.phone || null,
      });

    return NextResponse.json({
      success: true,
      orderNo,
      url_qrcode: xhData.url_qrcode,
      url: xhData.url,
      amount,
      coins,
    });

  } catch (error: any) {
    console.error('Topup error:', error);
    return NextResponse.json({ error: error.message || '发起充值失败' }, { status: 500 });
  }
}
