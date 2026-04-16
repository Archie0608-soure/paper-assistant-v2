import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const APP_SECRET = process.env.XUNHU_APP_SECRET || '';
const APP_ID = process.env.XUNHU_APP_ID || '';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    // 记录原始参数（用于调试）
    console.log('虎皮椒原始回调 params:', JSON.stringify(params));

    // 提取关键字段
    const {
      appid,
      trade_order_id,
      total_fee,
      status,
      hash,
      nonce_str,
      time,
    } = params;

    // 验证 appid
    if (appid !== APP_ID) {
      console.error('appid 不匹配:', appid, '!==', APP_ID);
      return NextResponse.json({ code: 'fail', msg: 'appid不匹配' });
    }

    // 虎皮椒签名验证
    const signParams: Record<string, string> = {};
    Object.keys(params).forEach(key => {
      if (key !== 'hash' && params[key] !== undefined && params[key] !== '') {
        signParams[key] = params[key];
      }
    });

    const sortedKeys = Object.keys(signParams).sort();
    const signStr = sortedKeys.map(k => `${k}=${signParams[k]}`).join('&') + APP_SECRET;
    const expectedHash = crypto.createHash('md5').update(signStr).digest('hex');

    console.log('计算签名:', signStr);
    console.log('收到hash:', hash, '| 计算hash:', expectedHash);

    if (hash !== expectedHash) {
      console.error('签名验证失败');
      return NextResponse.json({ code: 'fail', msg: '签名验证失败' });
    }

    console.log('签名验证通过，status:', status);

    if (status !== 'OD') {
      console.log('非支付状态:', status);
      return NextResponse.json({ code: 'success' });
    }

    // 查找订单
    const supabase = getSupabase();
    const { data: order, error: orderError } = await supabase
      .from('topup_orders')
      .select('*')
      .eq('order_no', trade_order_id)
      .eq('status', 'pending')
      .single();

    if (orderError || !order) {
      console.error('订单未找到:', trade_order_id, orderError);
      // 订单不存在也返回success，避免虎皮椒重复回调
      return NextResponse.json({ code: 'success' });
    }

    console.log('找到订单:', order.order_no, '给用户:', order.user_id, '加金币:', order.coins);

    // 更新订单
    await supabase
      .from('topup_orders')
      .update({
        status: 'completed',
        transaction_id: params.transaction_id || params.open_order_id || '',
        completed_at: new Date().toISOString(),
      })
      .eq('order_no', trade_order_id);

    // 增加金币
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', order.user_id)
      .single();

    if (userError) {
      console.error('用户查找失败:', userError);
      return NextResponse.json({ code: 'fail', msg: '用户不存在' });
    }

    const newBalance = (user.balance || 0) + order.coins;
    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', order.user_id);
    // 记录充值交易
    await supabase.from('transactions').insert({
      user_id: order.user_id,
      type: 'recharge',
      amount: order.coins,
      description: `充值 ${order.coins} 金币`,
    });

    console.log('金币到账成功! 新余额:', newBalance);

    return NextResponse.json({ code: 'success', msg: '处理成功' });

  } catch (error: any) {
    console.error('虎皮椒 webhook error:', error);
    return NextResponse.json({ code: 'fail', msg: error.message }, { status: 500 });
  }
}
