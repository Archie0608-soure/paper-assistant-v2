import { NextRequest, NextResponse } from 'next/server';

const ADMIN_KEY = '801851e064a630a77e0cc810e3379955153f57659b76e53fc0cd039ab62ba2b6';
const ADMIN_BACKEND_PASSWORD = 'SJOMo7vIcv3Edbi1k0gxZN9e8Lmw2DV+';

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
      path: '/',
      sameSite: 'lax',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
