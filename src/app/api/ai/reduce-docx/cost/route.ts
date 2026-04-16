// Step 1: 计算费用（不上传到 SpeedAI，本地统计字符数并暂存文件）
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

const RATE_PER_K = (lang: string) => lang === 'english' ? 20 : 40; // 英文20/千字，中文40/千字
const FILE_TTL_MS = 10 * 60 * 1000; // 10分钟过期

// 复用 start/route.ts 的全局 fileStore
declare global {
  var __fileStore: Map<string, { buffer: Buffer; fileName: string; lang: string; platform: string; createdAt: number }> | undefined;
}
if (!global.__fileStore) global.__fileStore = new Map();
const fileStore = global.__fileStore;

function calcCoins(charCount: number, lang: string): number {
  return Math.ceil(charCount / 1000 * RATE_PER_K(lang));
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, val] of fileStore.entries()) {
    if (now - val.createdAt > FILE_TTL_MS) fileStore.delete(key);
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const lang = (formData.get('lang') as string) || 'chinese';
    const platform = (formData.get('platform') as string) || 'zhiwang';
    const sessionId = (formData.get('sessionId') as string) || String(Date.now());

    if (!file) return NextResponse.json({ error: '请上传文件' }, { status: 400 });

    cleanupExpired();

    // 读取并暂存文件（不上传到 SpeedAI）
    const buffer = Buffer.from(await file.arrayBuffer());
    const charCount = await countChars(buffer);

    fileStore.set(sessionId, {
      buffer,
      fileName: file.name,
      lang,
      platform,
      createdAt: Date.now(),
    });

    const ourCoins = calcCoins(charCount || 1000, lang);
    console.log(`[/reduce-docx/cost] 字符数=${charCount}，金币=${ourCoins}，sessionId=${sessionId}`);

    return NextResponse.json({
      sessionId,
      cost: ourCoins,
      charCount,
    });

  } catch (err: any) {
    console.error('[/reduce-docx/cost] ERROR:', err.message);
    return NextResponse.json({ error: err.message || '提交失败' }, { status: 500 });
  }
}

async function countChars(buffer: Buffer): Promise<number> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docEntry = zip.file('word/document.xml');
    if (docEntry) {
      const xml = await docEntry.async('string');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text.length;
    }
  } catch {}
  return 0;
}
