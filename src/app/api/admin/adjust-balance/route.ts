import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_KEY = process.env.ADMIN_API_KEY;
const ADMIN_BACKEND_PASSWORD = process.env.ADMIN_BACKEND_PASSWORD;

// 管理员调整用户余额
export async function POST(req: NextRequest) {
  // 管理员密钥校验（双重认证）
  const adminKey = req.headers.get('X-Admin-Key');
  const body = await req.json();
  const { admin_password, user_email, amount, reason } = body;
  if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }
  if (!ADMIN_BACKEND_PASSWORD || admin_password !== ADMIN_BACKEND_PASSWORD) {
    return NextResponse.json({ error: '后台密码错误' }, { status: 403 });
  }

  try {

    if (!user_email || amount === undefined) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    if (amount === 0) {
      return NextResponse.json({ error: '调整金额不能为0' }, { status: 400 });
    }

    // 查找用户
    const { data: users, error: userError } = await supabase
      .from('users').select('id, email, balance').eq('email', user_email).limit(1);

    if (userError || !users?.length) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const user = users[0];
    const newBalance = user.balance + amount;

    if (newBalance < 0) {
      return NextResponse.json({ error: '余额不能为负' }, { status: 400 });
    }

    // 更新余额
    const { error: updateError } = await supabase
      .from('users').update({ balance: newBalance }).eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }

    // 记录交易
    const type = amount > 0 ? 'recharge' : 'expense';
    const absAmount = Math.abs(amount);
    const description = amount > 0
      ? `管理员加款: ${reason || '无原因'}`
      : `管理员扣款: ${reason || '无原因'}`;

    await supabase.from('transactions').insert({
      user_id: user.id,
      type,
      amount: amount > 0 ? absAmount : -absAmount,
      description,
    });

    return NextResponse.json({
      success: true,
      email: user.email,
      old_balance: user.balance,
      new_balance: newBalance,
      change: amount,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET: 检查 admin key + 后台密码是否有效
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get('X-Admin-Key');
  const { searchParams } = new URL(req.url);
  const admin_password = searchParams.get('admin_password') || '';
  if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }
  if (!ADMIN_BACKEND_PASSWORD || admin_password !== ADMIN_BACKEND_PASSWORD) {
    return NextResponse.json({ error: '后台密码错误' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, message: 'Admin auth valid' });
}
