import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function middleware(req: NextRequest) {
  // 仅限制 POST 请求
  if (req.method !== 'POST') return NextResponse.next();

  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: '文件大小不能超过 10MB' },
      { status: 413 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/study/generate', '/api/ai/reduce-docx/cost'],
};
