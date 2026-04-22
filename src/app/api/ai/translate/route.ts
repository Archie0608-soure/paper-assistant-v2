import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const APP_ID = process.env.BAIDU_TRANSLATE_APPID || '20260415002594605';
const SECRET_KEY = process.env.BAIDU_TRANSLATE_SECRETKEY || 'Xpw1Edo8BuKWLK1Xs2kV';

const LANG_MAP: Record<string, string> = {
  'zh': 'zh', 'en': 'en', 'ja': 'jp', 'ko': 'kor',
  'fr': 'fra', 'de': 'de', 'es': 'spa', 'ru': 'ru',
  'pt': 'pt', 'it': 'it', 'ar': 'ara', 'th': 'th', 'vi': 'vie',
};

const COINS_PER_K = 3; // 3金币/千字

function buildSignature(appid: string, text: string, salt: string, secretKey: string): string {
  // 必须用完整文本计算签名，不能截断（实测截断会导致长文本Invalid Sign）
  const str = appid + text + salt + secretKey;
  return crypto.createHash('md5').update(str).digest('hex');
}

function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

function calcCoins(text: string): number {
  return Math.ceil(countChars(text) / 1000) * COINS_PER_K;
}

// Split text into chunks under 1800 characters each
function splitText(text: string, maxChars: number = 1800): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = '';

  for (const para of paragraphs) {
    if (!para.trim()) { continue; }
    if (para.length >= maxChars) {
      if (current) { chunks.push(current); current = ''; }
      const sentences = para.match(/[^.!?。！？]+[.!?。！？]+/g) || [];
      let buf = '';
      for (const s of sentences) {
        if ((buf + s).length >= maxChars) {
          if (buf) chunks.push(buf.trim());
          buf = s;
        } else {
          buf += s;
        }
      }
      if (buf) current = buf;
    } else if ((current + '\n\n' + para).length >= maxChars) {
      if (current) chunks.push(current);
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateChunk(text: string, from: string, to: string): Promise<string> {
  // 过滤空文本和只含PARA_MARKER的非法chunk
  const cleanText = text.replace(/\x00PARA\x00/g, '').trim();
  if (!cleanText) { console.log('[translateChunk] chunk为空或仅含段落标记，跳过'); return ''; }
  const salt = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  const sign = buildSignature(APP_ID, cleanText, salt, SECRET_KEY);
  console.log('[translateChunk] 实际发送文本长度:', cleanText.length, '首50字:', JSON.stringify(cleanText.slice(0, 50)));

  const params = new URLSearchParams({
    q: cleanText,
    from: LANG_MAP[from] || from,
    to: LANG_MAP[to] || to,
    appid: APP_ID,
    salt,
    sign,
  });

  const res = await fetch('https://api.fanyi.baidu.com/api/trans/vip/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error_code) {
    throw new Error(`翻译API错误(${data.error_code}): ${data.error_msg}`);
  }
  return (data.trans_result || []).map((t: any) => t.dst).join('');
}

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getUserIdFromSession(req: NextRequest): string | null {
  const session = req.cookies.get('pa_session');
  if (!session) return null;
  try {
    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    return dest || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text, from, to } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: '文本不能为空' }, { status: 400 });

    const userId = getUserIdFromSession(req);
    if (!userId) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const supabase = getSupabase();
    const { data: users } = await supabase.from('users').select('id, balance').eq('email', userId).limit(1);
    if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const uid = users[0].id;
    const balance = users[0].balance ?? 0;
    const estimatedCoins = calcCoins(text);
    const charCount = countChars(text);

    if (balance < estimatedCoins) {
      return NextResponse.json({ error: `金币不足，翻译约需${estimatedCoins}金币（${charCount}字），当前余额${balance}金币` }, { status: 402 });
    }

    // 扣金币（乐观锁）：status 204 / count 0 / count null 都算失败需重试
    const deductResult = await supabase.from('users').update({ balance: balance - estimatedCoins }).eq('id', uid).eq('balance', balance);
    console.log('[translate] 扣款结果:', JSON.stringify(deductResult), '原余额:', balance, '应扣:', estimatedCoins);
    if (deductResult.count !== 1) {
      // 余额已被并发修改，查询最新余额重新尝试
      const { data: fresh } = await supabase.from('users').select('balance').eq('id', uid).maybeSingle();
      const currentBalance = fresh?.balance ?? 0;
      console.log('[translate] 并发冲突，当前余额:', currentBalance);
      if (currentBalance < estimatedCoins) {
        return NextResponse.json({ error: `金币不足（当前余额${currentBalance}，需要${estimatedCoins}）` }, { status: 402 });
      }
      const retry = await supabase.from('users').update({ balance: currentBalance - estimatedCoins }).eq('id', uid).eq('balance', currentBalance);
      console.log('[translate] 重试扣款结果:', JSON.stringify(retry));
    }

    try {
      // 用占位符保留段落结构，避免拼接时重复插入换行
      const PARA_MARKER = '\x00PARA\x00';
      const normalized = text.split(/\n{2,}/).map((p: string) => p.trim()).filter((p: string) => Boolean(p));
      if (normalized.length === 0) return NextResponse.json({ error: '没有可翻译的文本内容' }, { status: 400 });
      const chunks = splitText(normalized.join(PARA_MARKER + '\n\n' + PARA_MARKER), 1800).filter(c => c.trim().length > 0);
      console.log('[translate] 开始翻译，原始长度:', text.length, '，分段数:', chunks.length, '，首段:', JSON.stringify(text.slice(0, 50)));
      const translated = await Promise.all(chunks.map(c => translateChunk(c, from, to)));
      const rawResult = translated.join('\n\n');
      // 把占位符替换回双换行，还原段落结构
      const result = rawResult.replace(new RegExp(PARA_MARKER + '\s*' + PARA_MARKER, 'g'), '\n\n').replace(new RegExp(PARA_MARKER, 'g'), '\n\n').trim();

      // 按实际输出字数结算
      const actualCoins = calcCoins(result);
      if (actualCoins !== estimatedCoins) {
        const diff = actualCoins - estimatedCoins;
        const sign = diff > 0 ? diff : -Math.abs(diff);
        const { data: row } = await supabase.from('users').select('balance').eq('id', uid).single();
        if (row) {
          await supabase.from('users').update({ balance: Math.max(0, row.balance + sign) }).eq('id', uid);
        }
      }

      // 记录交易
      await supabase.from('transactions').insert({
        user_id: uid,
        type: 'expense',
        amount: -actualCoins,
        description: `论文翻译(${from}→${to})`,
      });

      return NextResponse.json({ result, coins: actualCoins });

    } catch (err: any) {
      // 翻译失败，退款
      await supabase.from('users').update({ balance: balance }).eq('id', uid).eq('balance', balance - estimatedCoins);
      throw err;
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message || '翻译失败' }, { status: 500 });
  }
}
