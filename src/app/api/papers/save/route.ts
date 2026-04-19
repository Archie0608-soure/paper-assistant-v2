import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _supabase: any | null = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 从 session cookie 里解析用户信息
    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;

    const body = await req.json();
    const { id, title, major, paperType, outline, chapters, selectedPapers } = body;

    // 查找或创建用户
    const userField = type === 'email' ? 'email' : 'phone';
    let { data: users } = await getSupabase().from('users')
      .select('id')
      .eq(userField, destination)
      .limit(1);

    let userId: string;

    if (!users || users.length === 0) {
      // 创建用户
      const { data: newUser, error } = await getSupabase().from('users')
        .insert({ [userField]: destination })
        .select('id')
        .single();
      if (error) throw error;
      userId = newUser.id;
    } else {
      userId = users[0].id;
    }

    const paperData = {
      user_id: userId,
      title,
      major,
      paper_type: paperType,
      outline,
      chapters,
      selected_papers: selectedPapers,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      // 更新已有论文 — 不扣积分
      const { data, error } = await getSupabase().from('papers')
        .update(paperData)
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    } else {
      // 新建论文 — 先扣积分再保存，保证原子性
      const supabase = getSupabase();

      // 1. 检查余额
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();
      if (userErr) throw userErr;
      if ((userRow.balance ?? 0) < 1) {
        return NextResponse.json({ error: '余额不足，请先充值' }, { status: 402 });
      }

      // 2. 原子扣减余额（乐观锁）
      const deductResult = await supabase
        .from('users')
        .update({ balance: userRow.balance - 1 })
        .eq('id', userId)
        .eq('balance', userRow.balance);
      if (deductResult.error) throw deductResult.error;
      if (deductResult.count !== 1) {
        // 并发冲突，查询最新余额
        const { data: fresh } = await supabase.from('users').select('balance').eq('id', userId).maybeSingle();
        if (!fresh || fresh.balance < 1) return NextResponse.json({ error: '金币不足，请先充值' }, { status: 402 });
        await supabase.from('users').update({ balance: fresh.balance - 1 }).eq('id', userId).eq('balance', fresh.balance);
      }
      // 记录交易
      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'expense',
        amount: -1,
        description: '论文保存',
      });

      // 3. 保存论文
      const { data, error } = await supabase.from('papers')
        .insert(paperData)
        .select('id')
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

  } catch (error: any) {
    console.error('Save paper error:', error);
    return NextResponse.json({ error: error.message || '保存失败' }, { status: 500 });
  }
}
