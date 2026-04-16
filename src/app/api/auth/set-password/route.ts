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

const TOKEN_SECRET = process.env.TOKEN_SECRET || process.env.EMAIL_USER || 'default-secret';

function hashPassword(password: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function verifyCodeCookie(token: string | undefined, email: string, code: string): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;
    const [e, c, exp, sig] = parts;
    if (e !== email || c !== code) return false;
    if (Date.now() > parseInt(exp)) return false;
    const data = `${e}:${c}:${exp}`;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
    return sig === expectedSig;
  } catch {
    return false;
  }
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
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
    const userField = type === 'email' ? 'email' : 'phone';

    const { password, code, email } = await req.json();

    if (!password || password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }

    // 如果提供了验证码才验证（已登录用户设置密码时可能需要）
    if (email && code) {
      const codeToken = req.cookies.get('pwcode')?.value;
      if (!verifyCodeCookie(codeToken, email, code)) {
        return NextResponse.json({ error: '验证码错误或已过期' }, { status: 400 });
      }
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    const client = getSupabase();
    const { error } = await (client.from('users') as any).update({ password_hash: hash, salt }).eq(userField, destination);

    if (error) throw error;

    // Clear the code cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('pwcode', '', { maxAge: 0, path: '/' });
    return response;

  } catch (error: any) {
    console.error('Set password error:', error);
    return NextResponse.json({ error: '设置失败' }, { status: 500 });
  }
}
