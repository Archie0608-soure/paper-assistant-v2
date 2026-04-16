import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TOKEN_SECRET = process.env.TOKEN_SECRET || process.env.EMAIL_USER || 'default-secret';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function checkToken(token: string, email: string, code: string): boolean {
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
    const { type, destination, code } = await req.json();
    const rawToken = req.cookies.get('vcode')?.value;

    if (!type || !destination || !code) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    if (!rawToken) {
      return NextResponse.json({ error: '验证码已过期，请重新获取' }, { status: 400 });
    }

    const valid = checkToken(rawToken, destination, code);
    if (!valid) {
      return NextResponse.json({ error: '验证码已过期，请重新获取' }, { status: 400 });
    }

    // Check/create user in Supabase
    const userField = type === 'email' ? 'email' : 'phone';
    const supabase = getSupabase();

    const { data: existingUser, error: findError } = await (supabase
      .from('users') as any)
      .select('id, email, phone, password_hash')
      .eq(userField, destination)
      .limit(1)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is expected for new users
      console.error('Supabase find error:', findError);
    }

    const isNewUser = !existingUser;

    if (isNewUser) {
      // Insert new user with default balance
      const { data: newUser, error: insertError } = await (supabase
        .from('users') as any)
        .insert({ [userField]: destination, balance: 0 })
        .select('id, email, phone, password_hash')
        .limit(1)
        .single();

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        return NextResponse.json({ error: '创建用户失败' }, { status: 500 });
      }

      const sessionToken = Buffer.from(`${type}:${destination}:${Date.now()}`).toString('base64url');
      const response = NextResponse.json({
        success: true,
        token: sessionToken,
        isNewUser: true,
        user: { hasPassword: false },
      });

      response.cookies.set('vcode', '', { maxAge: 0, path: '/' });
      response.cookies.set('pa_session', sessionToken, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
        sameSite: 'lax',
      });

      return response;
    }

    // Existing user
    const sessionToken = Buffer.from(`${type}:${destination}:${Date.now()}`).toString('base64url');
    const response = NextResponse.json({
      success: true,
      token: sessionToken,
      isNewUser: false,
      user: { hasPassword: !!existingUser.password_hash },
    });

    response.cookies.set('vcode', '', { maxAge: 0, path: '/' });
    response.cookies.set('pa_session', sessionToken, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'lax',
    });

    return response;

  } catch (error: any) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: '验证失败' }, { status: 500 });
  }
}
