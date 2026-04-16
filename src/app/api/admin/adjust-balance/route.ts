import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 管理员调整用户余额
export async function POST(req: NextRequest) {
  try {
    const { user_email, amount, reason } = await req.json();

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
