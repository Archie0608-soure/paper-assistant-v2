import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const SPEEDAI_API_KEY = process.env.SPEEDAI_API_KEY || 'sk-pPYJHnLpQq51mjzHrmSKJ43q';
const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || 'eef72e2c-3abe-4aeb-863f-4f172e6aeb62';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || 'sk-vsdqrgfgkcqtynmyyqpgubmzkztunmempbwmjajehvocxkyi';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

// 字符数计算：官方明确"所有输入，均以字符数计算"，包括空格、标点、数字等所有字符
function countWords(text: string): number {
  return text ? text.length : 0;
}

// 按模式收费（每千字符）：中文单降4金币/千字双降6金币/千字；英文单降2金币/千字双降3金币/千字
function calcCoins(text: string, mode: string, isEnglish = false): number {
  const rate = isEnglish
    ? (mode === 'both' ? 3 : 2)
    : (mode === 'both' ? 6 : 4);
  return Math.ceil(countWords(text) / 1000 * rate);
}

// 按段落/分隔符切分文本，每段控制在 300 字符内（SpeedAI官方建议分段长度）
function splitTextIntoChunks(text: string, maxChars = 300): string[] {
  if (!text || text.length <= maxChars) return text ? [text] : [];
  // 先尝试按双换行（段落）分割
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length <= maxChars) {
      current = current ? current + '\n\n' + p : p;
    } else {
      if (current) chunks.push(current);
      // 单段落超过 maxChars，再按单换行或句号切
      if (p.length > maxChars) {
        const sub = p.split(/\n/).reduce((acc: string[], line) => {
          if (!acc.length || (acc[acc.length - 1] + '\n' + line).length > maxChars) {
            acc.push(line);
          } else {
            acc[acc.length - 1] = acc[acc.length - 1] + '\n' + line;
          }
          return acc;
        }, [] as string[]);
        chunks.push(...sub);
        current = '';
      } else {
        current = p;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(c => c.trim().length > 0);
}

// 带重试的 speedaiPost（最多3次，每次间隔5秒）
function speedaiPost(path: string, body: any, timeoutMs = 600000): Promise<any> {
  const doRequest = (): Promise<any> => new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options: https.RequestOptions = {
      hostname: 'api3.speedai.chat', port: 443, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: timeoutMs,
    };
    const t = Date.now();
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log('[/speedai] ' + path + ' HTTP:' + res.statusCode + ' time:' + (Date.now()-t) + 'ms');
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('SpeedAI响应不是JSON: ' + data.slice(0,100))); }
      });
    });
    req.on('error', (e) => { reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(postData); req.end();
  });

  return new Promise((resolve, reject) => {
    const retries = [0, 5000, 10000];
    const attempt = (idx: number) => {
      doRequest()
        .then(resolve)
        .catch((err) => {
          if (idx < retries.length - 1) {
            console.log('[/speedai] 请求失败，第' + (idx + 2) + '次重试:', err.message);
            setTimeout(() => attempt(idx + 1), retries[idx + 1]);
          } else {
            reject(err);
          }
        });
    };
    attempt(0);
  });
}

// 本地启发式章节检测（毫秒级，优先使用）
function detectChaptersLocal(text: string, isZh: boolean): any[] {
  const lines = text.split('\n');
  const chapters: any[] = [];
  let currentCh: any = null;

  const zhPatterns = [
    /^第[一二三四五六七八九十百千零〇\d]+[章节篇部集卷项条]/,
    /^[一二三四五六七八九十百千〇\d）)、.\s]{1,20}$/,
    /^(附录|参考文献|致谢|目录|索引|后记|前言|摘要|Abstract)/i,
  ];
  const enPatterns = [
    /^(Chapter|Section|Part)\s+[\dIVXLC]+[.:]?[\s]/i,
    /^(Abstract|Introduction|Background|Literature|Methods?|Methodology|Results?|Discussion|Conclusion|References|Acknowledgments|Acknowledgements|Bibliography|Appendix)/i,
    /^\d+[.:]\s+[A-Z][A-Za-z\s]{0,50}$/,
  ];
  const refPatterns = [/^(参考文献|Reference|致谢|Acknowledg|附录|Appendix|目录|Table of contents)/i];
  const patterns = isZh ? zhPatterns : enPatterns;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2 || line.length > 60) {
      if (currentCh) currentCh.content += '\n' + line;
      continue;
    }
    const isTitle = patterns.some((p: RegExp) => p.test(line));
    const isRef = refPatterns.some((p: RegExp) => p.test(line));
    if (isRef) {
      if (currentCh) { currentCh.content = currentCh.content.trim(); chapters.push(currentCh); currentCh = null; }
      if (chapters.length > 0 && !(chapters[chapters.length - 1] as any).isReference) {
        (chapters[chapters.length - 1] as any).isReference = true;
      }
      continue;
    }
    if (isTitle) {
      if (currentCh) { currentCh.content = currentCh.content.trim(); chapters.push(currentCh); }
      currentCh = { title: line.slice(0, 25), level: 1, content: '', isReference: false };
    } else if (currentCh) {
      currentCh.content += '\n' + line;
    }
  }
  if (currentCh) { currentCh.content = currentCh.content.trim(); chapters.push(currentCh); }
  return chapters.filter((ch: any) => ch.content.replace(/\s/g, '').length >= 50);
}

// SiliconFlow DeepSeek-V3（章节切分用，快）
async function callSiliconFlowChapter(messages: any[]): Promise<string> {
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 SiliconFlow API Key');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-ai/DeepSeek-V3', messages, temperature: 0.3 }),
      signal: controller.signal as any,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error('SiliconFlow API error: ' + response.status);
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e: any) {
    clearTimeout(timeout);
    throw e;
  }
}





export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
    const userField = type === 'email' ? 'email' : 'phone';

    const body = await req.json().catch(() => { throw new Error('JSON解析失败'); });
    const { text, platform = 'zhiwang', mode = 'rewrite', language = 'chinese' } = body;
    if (!text?.trim()) return NextResponse.json({ error: '请提供文本' }, { status: 400 });

    const modeMap: Record<string, string> = { plagiarism: 'rewrite', ai: 'deai', both: 'both', parse_chapters: 'parse_chapters' };
    const resolvedMode = modeMap[mode] || 'rewrite';
    // 官方 type_ 值: zhiwang / weipu / gezida / daya / turnitin（vip->weipu, wanfang不支持）
    const typeMap: Record<string, string> = {
      zhiwang: 'zhiwang', vip: 'weipu', gezida: 'gezida', daya: 'daya', turnitin: 'turnitin',
    };
    const platformType = typeMap[platform] || 'zhiwang';
    const langForAPI = language === 'english' ? 'English' : 'Chinese';

    console.log('[/api/ai/reduce] mode=' + mode + '->' + resolvedMode + ' platform=' + platform + ' type=' + platformType + ' lang=' + langForAPI + ' textLen=' + text.length);

    // 章节切分模式（用 SiliconFlow DeepSeek-V3，快）
    if (resolvedMode === 'parse_chapters') {
      const isZh = language !== 'english';

      // 1. 本地启发式优先检测（毫秒级）
      const t0 = Date.now();
      const localChapters = detectChaptersLocal(text, isZh);
      console.log('[reduce] 本地章节检测:', localChapters.length, '个, 耗时:', Date.now() - t0, 'ms');

      // 本地检测到3个及以上章节，直接返回（最快路径）
      if (localChapters.length >= 3) {
        return NextResponse.json({ result: JSON.stringify({ chapters: localChapters }), source: 'local' });
      }

      // 2. 不足3章则用AI解析（发送更多文本，最多1.5万字）
      const langInstruction = isZh ? '这是一篇中文论文，请用中文回复。' : '这是一篇英文论文，请用英文回复。';
      const prompt = `${langInstruction}
请将以下论文内容按原文的章节结构进行切分，返回严格JSON格式（不要有任何其他内容）：
{
  "chapters": [
    {"title": "章节标题", "level": 1, "content": "该章节的完整正文内容（至少100字，如果原文不足则保留全部内容）"}
  ]
}
要求：
- 严格按照原文已有的章节编号（如1.1、2.1、2.2、3.1等）和标题进行切分，不要重新分组或合并章节
- 每个章节的level用1表示一级章节（如"一、"或"1"），用2表示二级章节（如"1.1"），用3表示三级章节（如"1.1.1"）
- 每个章节的content要包含该章节的完整正文
- 只返回JSON，不要markdown代码块包裹，不要其他任何文字说明
- title只保留简短标题（15字以内）
- 参考文献、致谢、目录、附录不要加入chapters数组，直接忽略

论文内容：
${text.slice(0, 15000)}`;

      try {
        const t1 = Date.now();
        const content = await callSiliconFlowChapter([{ role: 'user', content: prompt }]);
        console.log('[reduce] SiliconFlow章节解析成功, time:', Date.now() - t1, 'ms');
        return NextResponse.json({ result: content, source: 'ai' });
      } catch (aiErr: any) {
        // AbortError 也是正常超时，不算真正的服务异常
        const isAbort = aiErr.name === 'AbortError' || aiErr.message?.includes('aborted');
        console.error('[reduce] AI章节解析' + (isAbort ? '超时' : '失败') + ':', aiErr.message, '，使用本地fallback');
        if (localChapters.length > 0) {
          return NextResponse.json({ result: JSON.stringify({ chapters: localChapters }), source: 'local_fallback' });
        }
        // 没有本地结果，也不抛出去（避免用户看到技术错误），返回空章节让它继续
        return NextResponse.json({ result: JSON.stringify({ chapters: [] }), source: 'empty' });
      }
    }

    // === 扣金币逻辑（降重/降AI/双降） ===
    const supabase = getSupabase();
    const { data: users } = await supabase.from('users').select('id, balance').eq(userField, destination).limit(1);
    if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const userId = users[0].id;
    const balance = users[0].balance ?? 0;

    const estimatedCoins = calcCoins(text, resolvedMode, language === 'english');
    const modeLabel = resolvedMode === 'both' ? '降重+降AI' : resolvedMode === 'deai' ? '降AI' : '降重';
    console.log('[reduce] 扣费前 balance:', balance, 'estimatedCoins:', estimatedCoins, 'modeLabel:', modeLabel);

    if (balance < estimatedCoins) {
      console.log('[reduce] 金币不足! balance:', balance, 'needed:', estimatedCoins);
      return NextResponse.json({ error: `金币不足，${modeLabel}约需${estimatedCoins}金币（${countWords(text)}字），当前余额${balance}金币` }, { status: 402 });
    }

    // 扣金币（乐观锁检查）
    const deductResult = await supabase.from('users').update({ balance: balance - estimatedCoins }).eq('id', userId).eq('balance', balance);
    console.log('[reduce] 扣款结果:', JSON.stringify(deductResult), '原余额:', balance, '应扣:', estimatedCoins);
    if (deductResult.count !== 1) {
      // 余额已被并发修改，查询最新余额重新尝试
      const { data: fresh } = await supabase.from('users').select('balance').eq('id', userId).maybeSingle();
      const currentBalance = fresh?.balance ?? 0;
      console.log('[reduce] 并发冲突，当前余额:', currentBalance);
      if (currentBalance < estimatedCoins) {
        return NextResponse.json({ error: `金币不足（当前余额${currentBalance}，需要${estimatedCoins}）` }, { status: 402 });
      }
      await supabase.from('users').update({ balance: currentBalance - estimatedCoins }).eq('id', userId).eq('balance', currentBalance);
      console.log('[reduce] 并发扣款成功');
    }

    const results: Record<string, string> = {};
    let finalCoins = estimatedCoins;

    try {
      if (resolvedMode === 'rewrite' || resolvedMode === 'both') {
        const chunks = splitTextIntoChunks(text, 300);
        if (chunks.length === 1) {
          // 单段直接走，速度最快
          const data = await speedaiPost('/v1/rewrite', { username: SPEEDAI_API_KEY, info: text, lang: langForAPI, type: platformType });
          if (data.code !== 200) throw new Error('SpeedAI降重失败: ' + (data.message || data.code));
          results.reduced = data.rewrite || JSON.stringify(data);
        } else {
          // 多段拆分处理，逐个拼接
          console.log('[reduce] 降重拆分', chunks.length, '段');
          const reducedParts: string[] = [];
          for (let i = 0; i < chunks.length; i++) {
            const part = chunks[i];
            const data = await speedaiPost('/v1/rewrite', { username: SPEEDAI_API_KEY, info: part, lang: langForAPI, type: platformType });
            if (data.code !== 200) throw new Error('SpeedAI降重失败(第' + (i + 1) + '段): ' + (data.message || data.code));
            reducedParts.push(data.rewrite || part);
            console.log('[reduce] 降重完成第', i + 1, '/', chunks.length, '段');
          }
          results.reduced = reducedParts.join('\n\n');
        }
      }

      if (resolvedMode === 'deai' || resolvedMode === 'both') {
        const deaiText = resolvedMode === 'both' ? results.reduced : text;
        const chunks = splitTextIntoChunks(deaiText, 300);
        if (chunks.length === 1) {
          const data = await speedaiPost('/v1/deai', { username: SPEEDAI_API_KEY, info: deaiText, lang: langForAPI, type: platformType });
          if (data.code !== 200) throw new Error('SpeedAI降AI失败: ' + (data.message || data.code));
          // SpeedAI deai 返回的字段是 rewrite，不是 deai
          results.deaid = data.rewrite ?? JSON.stringify(data);
        } else {
          console.log('[reduce] 降AI拆分', chunks.length, '段');
          const deaidParts: string[] = [];
          for (let i = 0; i < chunks.length; i++) {
            const part = chunks[i];
            const data = await speedaiPost('/v1/deai', { username: SPEEDAI_API_KEY, info: part, lang: langForAPI, type: platformType });
            if (data.code !== 200) throw new Error('SpeedAI降AI失败(第' + (i + 1) + '段): ' + (data.message || data.code));
            // SpeedAI deai 返回的字段是 rewrite，不是 deai
            deaidParts.push(data.rewrite ?? part);
            console.log('[reduce] 降AI完成第', i + 1, '/', chunks.length, '段');
          }
          results.deaid = deaidParts.join('\n\n');
        }
      }

      // 按输入长度收费，而非输出长度（输出会被AI扩充，导致费用不可预期）
      const outputText = results.deaid || results.reduced || text;
      const actualCoins = calcCoins(text, resolvedMode, language === 'english');
      const diff = actualCoins - estimatedCoins;

      if (diff !== 0) {
        const sign = diff > 0 ? diff : -Math.abs(diff);
        const { data: row } = await supabase.from('users').select('balance').eq('id', userId).single();
        if (row) {
          await supabase.from('users').update({ balance: Math.max(0, row.balance + sign) }).eq('id', userId);
        }
        finalCoins = actualCoins;
      }

      console.log('[reduce] 扣费成功 finalCoins:', finalCoins, 'modeLabel:', modeLabel);

      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'expense',
        amount: -finalCoins,
        description: modeLabel,
      });

      return NextResponse.json({ ...results, coins: finalCoins });

    } catch (err: any) {
      await supabase.from('users').update({ balance: balance }).eq('id', userId);
      throw err;
    }

  } catch (err: any) {
    const msg = err?.message || String(err || '未知错误');
    console.error('[/api/ai/reduce] ERROR:', msg);
    // 超时/网络错误返回友好提示，不暴露技术细节
    const friendly = msg.includes('ETIMEDOUT') || msg.includes('TIMEOUT') || msg.includes('timeout') || msg.includes('aborted')
      ? '处理超时，请稍后重试或减少文本长度'
      : msg.includes('SpeedAI响应不是JSON')
      ? 'AI服务返回异常，请稍后重试'
      : msg;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
