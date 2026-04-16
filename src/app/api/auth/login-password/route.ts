import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

function hashPassword(password: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  return hashPassword(password, salt) === hash;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }

    const { data: user, error } = await getSupabase()
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1)
      .single() as any;

    if (error || !user) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
    }

    if (!user.password_hash || !user.salt) {
      return NextResponse.json({ error: '该账号未设置密码，请使用验证码登录' }, { status: 401 });
    }

    const valid = verifyPassword(password, user.password_hash, user.salt);
    if (!valid) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
    }

    const sessionToken = Buffer.from(`email:${email}:${Date.now()}`).toString('base64url');

    const response = NextResponse.json({ success: true, token: sessionToken });

    response.cookies.set('pa_session', sessionToken, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30天记住登录
      path: '/',
      sameSite: 'lax',
    });

    return response;

  } catch (error: any) {
    console.error('Password login error:', error);
    return NextResponse.json({ error: '登录失败' }, { status: 500 });
  }
}
