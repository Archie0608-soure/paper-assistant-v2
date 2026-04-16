// /api/ai/reduce-docx/start - Step 2: 从内存取出文件，上传到 SpeedAI，启动处理
import { NextRequest, NextResponse } from 'next/server';

// 复用 cost/route.ts 的 fileStore（通过全局变量）
// 注意：Next.js 会保持这个在内存中
declare global {
  var __fileStore: Map<string, { buffer: Buffer; fileName: string; lang: string; platform: string; createdAt: number }> | undefined;
}
if (!global.__fileStore) global.__fileStore = new Map();

const SPEEDAI_API_KEY = process.env.SPEEDAI_API_KEY || 'sk-pPYJHnLpQq51mjzHrmSKJ43q';
const SPEEDAI_HOST = 'api3.speedai.chat';
const FILE_TTL_MS = 10 * 60 * 1000;

function cleanupExpired() {
  const now = Date.now();
  for (const [key, val] of global.__fileStore!.entries()) {
    if (now - val.createdAt > FILE_TTL_MS) global.__fileStore!.delete(key);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, lang, platform } = await req.json();

    if (!sessionId) return NextResponse.json({ error: '缺少 sessionId' }, { status: 400 });

    cleanupExpired();

    const stored = global.__fileStore!.get(sessionId);
    if (!stored) {
      return NextResponse.json({ error: '文件已过期，请重新上传' }, { status: 400 });
    }

    const { buffer, fileName, lang: storedLang, platform: storedPlatform } = stored;
    const effectiveLang = lang || storedLang;
    const effectivePlatform = platform || storedPlatform;

    // 用文件调 SpeedAI /v1/cost（拿真正的 doc_id）
    const fd = new FormData();
    fd.append('file', new Blob([buffer as unknown as BlobPart]), fileName);
    fd.append('FileName', fileName);
    fd.append('username', SPEEDAI_API_KEY);
    fd.append('mode', 'deai');
    fd.append('type_', effectivePlatform);
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

    // 启动处理
    const startFd = new FormData();
    startFd.append('doc_id', docId);
    startFd.append('FileName', fileName);
    startFd.append('username', SPEEDAI_API_KEY);
    startFd.append('mode', 'deai');
    startFd.append('type_', effectivePlatform);
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
