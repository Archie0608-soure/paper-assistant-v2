import { NextRequest, NextResponse } from 'next/server';

/**
 * 从请求的 cookie 中验证 pa_session 是否存在
 * 用于保护需要登录的 API 接口
 */
export function verifySession(req: NextRequest): { ok: true; userId: string } | { ok: false; response: NextResponse } {
  const session = req.cookies.get('pa_session');
  if (!session?.value) {
    return {
      ok: false,
      response: NextResponse.json({ error: '请先登录' }, { status: 401 }),
    };
  }
  // session 格式: base64(type:destination:timestamp:signature)
  try {
    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const userId = beforeLast.slice(beforeLast.indexOf(':') + 1);
    return { ok: true, userId };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: '无效的会话' }, { status: 401 }),
    };
  }
}

/**
 * 简单内存限流（按 IP）
 */
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 60 * 1000; // 1分钟
const RATE_MAX = 20; // 每分钟最多20次

export function checkRateLimit(req: NextRequest): boolean {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const now = Date.now();
  const record = rateMap.get(ip);

  if (!record || now > record.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  if (record.count >= RATE_MAX) return true;
  record.count++;
  return false;
}
