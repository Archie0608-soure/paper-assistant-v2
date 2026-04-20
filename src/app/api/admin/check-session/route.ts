import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pa_admin_session');
  if (token?.value === 'authenticated') {
    return NextResponse.json({ ok: true, message: '已登录' });
  }
  return NextResponse.json({ error: '未登录' }, { status: 401 });
}
