import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('pa_admin_session', '', { maxAge: 0, path: '/admin' });
  return response;
}
