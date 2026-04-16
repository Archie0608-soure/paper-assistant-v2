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

export async function GET(req: NextRequest) {
  try {
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

    const { data: user, error } = await getSupabase()
      .from('users')
      .select('*')
      .eq(userField, destination)
      .limit(1)
      .single() as any as any;

    if (error || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      email: user.email,
      phone: user.phone,
      hasPassword: !!user.password_hash,
      balance: user.balance || 0,
      created_at: user.created_at,
    });

  } catch (error: any) {
    console.error('Account error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
