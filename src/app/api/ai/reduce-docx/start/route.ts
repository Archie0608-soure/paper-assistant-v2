// /api/ai/reduce-docx/start - Step 2: 从内存取出文件，上传到 SpeedAI，启动处理，扣减金币
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 复用 cost/route.ts 的 fileStore（通过全局变量）
// 注意：Next.js 会保持这个在内存中
declare global {
  var __fileStore: Map<string, { buffer: Buffer; fileName: string; lang: string; platform: string; mode: string; cost: number; createdAt: number }> | undefined;
}
if (!global.__fileStore) global.__fileStore = new Map();

const SPEEDAI_API_KEY = process.env.SPEEDAI_API_KEY || 'sk-pPYJHnLpQq51mjzHrmSKJ43q';
const SPEEDAI_HOST = 'api3.speedai.chat';
const FILE_TTL_MS = 10 * 60 * 1000;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, val] of global.__fileStore!.entries()) {
    if (now - val.createdAt > FILE_TTL_MS) global.__fileStore!.delete(key);
  }
}

// 登录验证 + 获取用户信息
async function verifyAndGetUser(req: NextRequest) {
  const session = req.cookies.get('pa_session');
  if (!session?.value) return null;
  const raw = Buffer.from(session.value, 'base64url').toString();
  const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
  const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
  const type = raw.startsWith('email:') ? 'email' : 'phone';
  const destination = dest || beforeLast;
  const userField = type === 'email' ? 'email' : 'phone';
  const supabase = getSupabase();
  const { data: users } = await supabase.from('users').select('id, balance').eq(userField, destination).limit(1).maybeSingle();
  return users;
}

// 登录验证
function verifySession(req: NextRequest): boolean {
  const session = req.cookies.get('pa_session');
  return !!session?.value;
}

// 内存限流
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 10;

function checkRateLimit(req: NextRequest): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
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

export async function POST(req: NextRequest) {
  if (checkRateLimit(req)) {
    return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  try {
    const { sessionId, lang, platform, mode } = await req.json();

    if (!sessionId) return NextResponse.json({ error: '缺少 sessionId' }, { status: 400 });

    cleanupExpired();

    const stored = global.__fileStore!.get(sessionId);
    if (!stored) {
      return NextResponse.json({ error: '文件已过期，请重新上传' }, { status: 400 });
    }

    const { buffer, fileName, lang: storedLang, platform: storedPlatform, mode: storedMode, cost: estimatedCost } = stored;
    const effectiveLang = lang || storedLang;
    const effectivePlatform = platform || storedPlatform;
    const effectiveMode = mode || storedMode;

    // ===== 扣金币（乐观锁） =====
    const supabase = getSupabase();
    const users = await verifyAndGetUser(req);
    if (!users) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const balance = users.balance ?? 0;
    if (balance < estimatedCost) {
      return NextResponse.json({ error: `金币不足，当前余额${balance}金币，需要${estimatedCost}金币` }, { status: 402 });
    }
    const deductResult = await supabase.from('users').update({ balance: balance - estimatedCost }).eq('id', users.id).eq('balance', balance);
    console.log('[/reduce-docx/start] 扣款结果:', JSON.stringify(deductResult), '原余额:', balance, '应扣:', estimatedCost, 'sessionId:', sessionId);
    if (!deductResult.error && deductResult.count === 0) {
      const { data: fresh } = await supabase.from('users').select('balance').eq('id', users.id).maybeSingle();
      const currentBalance = fresh?.balance ?? 0;
      console.log('[/reduce-docx/start] 并发冲突，当前余额:', currentBalance, 'sessionId:', sessionId);
      if (currentBalance < estimatedCost) {
        return NextResponse.json({ error: `金币不足（当前余额${currentBalance}，需要${estimatedCost}）` }, { status: 402 });
      }
      await supabase.from('users').update({ balance: currentBalance - estimatedCost }).eq('id', users.id).eq('balance', currentBalance);
    }
    // 记录交易
    await supabase.from('transactions').insert({
      user_id: users.id,
      type: 'expense',
      amount: -estimatedCost,
      description: '论文双降（DOCX）',
    });
    console.log('[/reduce-docx/start] 扣款完成，sessionId:', sessionId);
    // ===== 扣金币结束 =====

    // 用文件调 SpeedAI /v1/cost（拿真正的 doc_id）
    const fd = new FormData();
    fd.append('file', new Blob([buffer as unknown as BlobPart]), fileName);
    fd.append('FileName', fileName);
    fd.append('username', SPEEDAI_API_KEY);
    // 映射我们的模式到 SpeedAI 的 mode/type_
    // plagiarism->rewrite, ai->deai, both->deai+rewrite_前缀
    const speedaiMode = effectiveMode === 'plagiarism' ? 'rewrite'
      : effectiveMode === 'ai' ? 'deai'
      : 'deai'; // both 也用 deai
    const speedaiType = effectiveMode === 'both'
      ? 'rewrite_' + effectivePlatform
      : effectivePlatform;
    fd.append('mode', speedaiMode);
    fd.append('type_', speedaiType);
    fd.append('changed_only', String(false));
    fd.append('skip_english', effectiveLang === 'chinese' ? String(true) : String(false));

    console.log(`[/reduce-docx/start] 上传文件到 SpeedAI cost, sessionId=${sessionId}`);

    const costRes = await fetch(`https://${SPEEDAI_HOST}/v1/cost`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(60000),
    } as any);

    const costData = await costRes.json();
    console.log('[/reduce-docx/start] SpeedAI cost返回:', JSON.stringify(costData).slice(0, 200));

    if (costData.status !== 'success') {
      return NextResponse.json(
        { error: costData.error || '文件上传SpeedAI失败: ' + JSON.stringify(costData) },
        { status: 500 }
      );
    }

    const docId = costData.doc_id as string;

    // 启动处理（与 cost 接口保持一致）
    const startFd = new FormData();
    startFd.append('doc_id', docId);
    startFd.append('FileName', fileName);
    startFd.append('username', SPEEDAI_API_KEY);
    startFd.append('mode', speedaiMode);
    startFd.append('type_', speedaiType);
    startFd.append('changed_only', String(false));
    startFd.append('skip_english', effectiveLang === 'chinese' ? String(true) : String(false));

    const startRes = await fetch(`https://${SPEEDAI_HOST}/v1/docx/start`, {
      method: 'POST',
      body: startFd,
      signal: AbortSignal.timeout(60000),
    } as any);

    const startData = await startRes.json();
    console.log('[/reduce-docx/start] SpeedAI start返回:', JSON.stringify(startData).slice(0, 200));

    if (startData.status !== 'processing') {
      return NextResponse.json(
        { error: startData.error || '启动处理失败: ' + JSON.stringify(startData) },
        { status: 500 }
      );
    }

    // 清理已使用的文件
    global.__fileStore!.delete(sessionId);

    return NextResponse.json({ docId, status: 'processing' });

  } catch (err: any) {
    console.error('[/reduce-docx/start] ERROR:', err.message);
    return NextResponse.json({ error: err.message || '启动失败' }, { status: 500 });
  }
}
