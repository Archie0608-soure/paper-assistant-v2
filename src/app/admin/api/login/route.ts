import { NextRequest, NextResponse } from 'next/server';

const ADMIN_KEY = process.env.ADMIN_API_KEY;
const ADMIN_BACKEND_PASSWORD = process.env.ADMIN_BACKEND_PASSWORD;

const ADMIN_SESSION_TOKEN = 'pa_admin_session';

export async function POST(req: NextRequest) {
  try {
    const { admin_key, admin_password } = await req.json();

    if (!admin_key || !admin_password) {
      return NextResponse.json({ error: '请填写所有字段' }, { status: 400 });
    }

    if (admin_key !== ADMIN_KEY) {
      return NextResponse.json({ error: '管理员密钥错误' }, { status: 403 });
    }

    if (admin_password !== ADMIN_BACKEND_PASSWORD) {
      return NextResponse.json({ error: '后台密码错误' }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_TOKEN, 'authenticated', {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7天
      path: '/admin',
      sameSite: 'lax',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
