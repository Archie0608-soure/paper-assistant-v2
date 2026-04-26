// /api/ai/translate-docx - 保留格式的 docx 翻译接口
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import JSZip from 'jszip';

const APP_ID = process.env.BAIDU_TRANSLATE_APPID || '20260415002594605';
const SECRET_KEY = process.env.BAIDU_TRANSLATE_SECRETKEY || 'Xpw1Edo8BuKWLK1Xs2kV';

const LANG_MAP: Record<string, string> = {
  'zh': 'zh', 'en': 'en', 'ja': 'jp', 'ko': 'kor',
  'fr': 'fra', 'de': 'de', 'es': 'spa', 'ru': 'ru',
  'pt': 'pt', 'it': 'it', 'ar': 'ara', 'th': 'th', 'vi': 'vie',
};

const COINS_PER_K = 3;

function buildSignature(appid: string, text: string, salt: string, secretKey: string): string {
  return crypto.createHash('md5').update(appid + text + salt + secretKey).digest('hex');
}

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getUserIdFromSession(req: NextRequest): string | null {
  const session = req.cookies.get('pa_session');
  if (!session) return null;
  try {
    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    return beforeLast.slice(beforeLast.indexOf(':') + 1) || null;
  } catch { return null; }
}

// 解码 Word XML 中的 HTML 实体（如 &quot; &amp; &lt; &gt;）
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// 翻译一段文本
async function translateText(text: string, from: string, to: string): Promise<string> {
  if (!text.trim()) return text;
  const clean = text.replace(/\x00PARA\x00/g, '\n').trim();
  if (!clean) return clean;
  const salt = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  const sign = buildSignature(APP_ID, clean, salt, SECRET_KEY);
  const params = new URLSearchParams({
    q: clean, from: LANG_MAP[from] || from, to: LANG_MAP[to] || to,
    appid: APP_ID, salt, sign,
  });
  const res = await fetch('https://api.fanyi.baidu.com/api/trans/vip/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (data.error_code) throw new Error(`翻译API错误(${data.error_code}): ${data.error_msg}`);
  return (data.trans_result || []).map((t: any) => t.dst).join('');
}

// 按换行分段翻译，保持段落结构
async function translateByLine(text: string, from: string, to: string): Promise<string> {
  const lines = text.split('\n');
  const transLines = await Promise.all(
    lines.map(l => {
      if (!l.trim()) return Promise.resolve(l);
      return translateText(l, from, to);
    })
  );
  return transLines.join('\n');
}

// 把多个 <w:t> 合并翻译，分段保持结构
async function translateDocxText(
  runs: { xmlTag: string; text: string }[],
  from: string,
  to: string
): Promise<string[]> {
  const results: string[] = [];
  let i = 0;
  while (i < runs.length) {
    const run = runs[i];
    if (!run.text.trim()) {
      results.push(run.text);
      i++;
      continue;
    }
    // 尝试把连续短文本合并成一个 chunk（不超过 1500 字符）
    let chunkText = run.text;
    let chunkRuns = [run];
    while (i + chunkRuns.length < runs.length) {
      const next = runs[i + chunkRuns.length];
      if (!next.text.trim()) break;
      const test = chunkText + '\n' + next.text;
      if (test.length > 1500) break;
      chunkText = test;
      chunkRuns.push(next);
    }
    // 翻译这个 chunk
    const translated = await translateByLine(chunkText, from, to);
    const parts = translated.split('\n');
    for (let j = 0; j < chunkRuns.length; j++) {
      results.push(parts[j] ?? chunkRuns[j].text);
    }
    i += chunkRuns.length;
  }
  return results;
}

// 把译文替换回 XML（逐个 <w:t> 标签从后往前替换，避免索引偏移）
function replaceTextsInXml(
  xml: string,
  runs: { xmlTag: string; text: string; fullMatch: string }[],
  translatedTexts: string[]
): string {
  let result = xml;
  for (let i = runs.length - 1; i >= 0; i--) {
    const { fullMatch, text } = runs[i];
    const translated = (translatedTexts[i] ?? text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const newTag = fullMatch.replace(/>[^<]*</, '>' + translated + '<');
    const pos = result.lastIndexOf(fullMatch);
    if (pos !== -1) {
      result = result.slice(0, pos) + newTag + result.slice(pos + fullMatch.length);
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromSession(req);
    if (!userId) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const from = (formData.get('from') as string) || 'zh';
    const to = (formData.get('to') as string) || 'en';

    if (!file) return NextResponse.json({ error: '请上传文件' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return NextResponse.json({ error: '无效的 docx 文件' }, { status: 400 });

    // 提取所有 <w:t> 标签，并解码 XML 实体
    const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    const runs: { xmlTag: string; text: string; fullMatch: string }[] = [];
    let match;
    while ((match = wtRegex.exec(docXml)) !== null) {
      const decodedText = decodeHtmlEntities(match[1]);
      runs.push({ xmlTag: match[0], text: decodedText, fullMatch: match[0] });
    }

    const totalChars = runs.reduce((sum, r) => sum + r.text.length, 0);
    if (totalChars === 0) return NextResponse.json({ error: '文档中没有可翻译的文字' }, { status: 400 });

    const estimatedCoins = Math.ceil(totalChars / 1000) * COINS_PER_K;

    const supabase = getSupabase();
    const { data: users } = await supabase.from('users').select('id, balance').eq('email', userId).limit(1);
    if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const uid = users[0].id;
    const balance = users[0].balance ?? 0;
    if (balance < estimatedCoins) {
      return NextResponse.json({ error: `金币不足，需要${estimatedCoins}金币，当前${balance}金币` }, { status: 402 });
    }

    // 扣金币（乐观锁）
    const deductResult = await supabase.from('users').update({ balance: balance - estimatedCoins }).eq('id', uid).eq('balance', balance);
    if (deductResult.count !== 1) {
      const { data: fresh } = await supabase.from('users').select('balance').eq('id', uid).maybeSingle();
      const currentBalance = fresh?.balance ?? 0;
      if (currentBalance < estimatedCoins) {
        return NextResponse.json({ error: '金币不足' }, { status: 402 });
      }
      await supabase.from('users').update({ balance: currentBalance - estimatedCoins }).eq('id', uid).eq('balance', currentBalance);
    }

    try {
      const translatedTexts = await translateDocxText(runs, from, to);
      const newDocXml = replaceTextsInXml(docXml, runs, translatedTexts);

      const newZip = new JSZip();
      const promises = Object.entries(zip.files).map(async ([name, zf]) => {
        if (name === 'word/document.xml') {
          newZip.file(name, newDocXml);
        } else {
          newZip.file(name, await zf.async('nodebuffer'));
        }
      });
      await Promise.all(promises);
      const outputBuffer = await newZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      await supabase.from('transactions').insert({
        user_id: uid, type: 'expense', amount: -estimatedCoins,
        description: `翻译(docx格式保持)(${from}→${to})`,
      });

      const fileName = file.name.replace(/\.docx$/, '') + '_翻译.docx';
      return new NextResponse(new Uint8Array(outputBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });

    } catch (err: any) {
      await supabase.from('users').update({ balance: balance }).eq('id', uid);
      throw err;
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message || '翻译失败' }, { status: 500 });
  }
}