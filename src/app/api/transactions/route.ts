import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
}

async function getUserIdFromSession(supabase: any, cookie: { value: string } | undefined): Promise<string | null> {
  if (!cookie?.value) {
    console.error('[transactions] 无cookie');
    return null;
  }
  try {
    const raw = Buffer.from(cookie.value, 'base64url').toString();
    console.log('[transactions] cookie原始值:', JSON.stringify(cookie.value).slice(0, 80));
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
    const field = type === 'email' ? 'email' : 'phone';
    console.log('[transactions] 查找用户 field:', field, 'destination:', destination);
    const { data, error } = await supabase.from('users').select('id').eq(field, destination).limit(1).maybeSingle();
    if (error) {
      // PGRST116 = 多条记录，其他错误才报
      if (error.code !== 'PGRST116') {
        console.error('[transactions] 用户查询失败:', error.code, error.message);
      }
      return null;
    }
    console.log('[transactions] 用户ID:', data?.id);
    return data?.id || null;
  } catch (err: any) {
    console.error('[transactions] getUserIdFromSession异常:', err.message);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const userId = await getUserIdFromSession(supabase, req.cookies.get('pa_session'));
    if (!userId) {
      // 检查是否有cookie但解析失败
      const hasCookie = !!req.cookies.get('pa_session')?.value;
      const msg = hasCookie ? '会话无效，请重新登录' : '请先登录';
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: txData, count, error: txErr } = await supabase
      .from('transactions')
      .select('id, type, amount, description, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (txErr) throw txErr;

    return NextResponse.json({ transactions: txData || [], total: count || 0 });
  } catch (err: any) {
    console.error('[/api/transactions]', err);
    return NextResponse.json({ error: err.message || '获取交易记录失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, type, amount, description } = body;
    if (!user_id || !type || !amount) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }
    const supabase = getSupabase();
    const { error: insErr } = await supabase
      .from('transactions')
      .insert({ user_id, type, amount, description: description || '' })
      .select()
      .single();
    if (insErr) throw insErr;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/transactions POST]', err);
    return NextResponse.json({ error: err.message || '记录交易失败' }, { status: 500 });
  }
}
