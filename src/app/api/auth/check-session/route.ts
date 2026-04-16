import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('pa_session');
  
  if (session?.value) {
    return NextResponse.json({ loggedIn: true });
  }
  
  return NextResponse.json({ loggedIn: false }, { status: 401 });
}
