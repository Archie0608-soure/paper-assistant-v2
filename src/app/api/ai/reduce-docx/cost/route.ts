// Step 1: 计算费用（不上传到 SpeedAI，本地统计字符数并暂存文件）
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

const RATE_PER_K: Record<string, Record<string, number>> = {
  plagiarism: { chinese: 40, english: 20 },
  ai:         { chinese: 40, english: 20 },
  both:       { chinese: 60, english: 30 },
};
const FILE_TTL_MS = 10 * 60 * 1000; // 10分钟过期

// 复用 start/route.ts 的全局 fileStore
declare global {
  var __fileStore: Map<string, { buffer: Buffer; fileName: string; lang: string; platform: string; mode: string; createdAt: number }> | undefined;
}
if (!global.__fileStore) global.__fileStore = new Map();
const fileStore = global.__fileStore;

function calcCoins(charCount: number, lang: string, mode: string): number {
  const rate = RATE_PER_K[mode]?.[lang] ?? RATE_PER_K['both'][lang];
  return Math.ceil(charCount / 1000 * rate);
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
    const mode = (formData.get('mode') as string) || 'both';
    const sessionId = (formData.get('sessionId') as string) || String(Date.now());

    if (!file) return NextResponse.json({ error: '请上传文件' }, { status: 400 });

    cleanupExpired();

    // 读取并暂存文件（不上传到 SpeedAI）
    const buffer = Buffer.from(await file.arrayBuffer());
    const { charCount, detectedLang } = await countChars(buffer);

    // 首次上传（lang=chinese默认值）时用检测到的语言；后续重选语言时用用户指定的
    const effectiveLang = lang === 'chinese' || lang === 'english' ? lang : detectedLang;

    fileStore.set(sessionId, {
      buffer,
      fileName: file.name,
      lang: effectiveLang,
      platform,
      mode,
      createdAt: Date.now(),
    });

    const ourCoins = calcCoins(charCount || 1000, effectiveLang, mode);
    console.log(`[/reduce-docx/cost] 字符数=${charCount}，金币=${ourCoins}，mode=${mode}，lang=${effectiveLang}(检测:${detectedLang})，sessionId=${sessionId}`);

    return NextResponse.json({
      sessionId,
      cost: ourCoins,
      charCount,
      detectedLang: effectiveLang,
    });

  } catch (err: any) {
    console.error('[/reduce-docx/cost] ERROR:', err.message);
    return NextResponse.json({ error: err.message || '提交失败' }, { status: 500 });
  }
}

async function countChars(buffer: Buffer): Promise<{ charCount: number; detectedLang: string }> {
  let text = '';
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docEntry = zip.file('word/document.xml');
    if (docEntry) {
      const xml = await docEntry.async('string');
      text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch {}

  // 语言检测：统计中文字符数 vs 英文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const detectedLang = chineseChars >= englishChars ? 'chinese' : 'english';

  return { charCount: text.length, detectedLang };
}
