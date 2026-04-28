import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import https from 'https';

const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const TENCENT_BIZ_TYPE = process.env.TENCENT_BIZ_TYPE || 'aigc_text_detect_100037665348';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || 'sk-vsdqrgfgkcqtynmyyqpgubmzkztunmempbwmjajehvocxkyi';

const MAX_DETECT_CHARS = 7000; // 腾讯云单次检测限制

// 按句子分段，每段不超过 maxChars
function splitBySentences(text: string, maxChars: number): string[] {
  const sentences: string[] = [];
  const parts = text.split(/(?<=[。！？.!?])/);
  let current = '';
  for (const part of parts) {
    if (current.length + part.length <= maxChars) {
      current += part;
    } else {
      if (current) sentences.push(current.trim());
      if (part.length > maxChars) {
        for (let i = 0; i < part.length; i += maxChars) {
          sentences.push(part.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = part;
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

function httpsRequest(options: https.RequestOptions, body: string, timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(body);
    req.end();
  });
}

// 调用腾讯云 TMS AIGC 检测（总分）
async function detectWithTencent(text: string): Promise<{ ai: number; original: number }> {
  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
    throw new Error('未配置腾讯云 Secret');
  }

  const contentBase64 = Buffer.from(text).toString('base64');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const date = new Date().toISOString().slice(0, 10);

  const payload = JSON.stringify({
    Content: contentBase64,
    Type: 'TEXT_AIGC',
    BizType: TENCENT_BIZ_TYPE,
  });
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalHeaders = 'content-type:application/json\n' + 'host:tms.tencentcloudapi.com\n';
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST', '/', '',
    canonicalHeaders, signedHeaders, hashedPayload,
  ].join('\n');

  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = 'TC3-HMAC-SHA256\n' + timestamp + '\n' + date + '/tms/tc3_request\n' + hashedCanonicalRequest;

  const kDate = crypto.createHmac('sha256', 'TC3' + TENCENT_SECRET_KEY).update(date).digest();
  const kService = crypto.createHmac('sha256', kDate).update('tms').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authHeader = 'TC3-HMAC-SHA256 Credential=' + TENCENT_SECRET_ID + '/' + date + '/tms/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  const data = await httpsRequest({
    hostname: 'tms.tencentcloudapi.com', port: 443, path: '/', method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Host': 'tms.tencentcloudapi.com',
      'X-TC-Action': 'TextModeration', 'X-TC-Version': '2020-12-29',
      'X-TC-Region': 'ap-guangzhou', 'X-TC-Timestamp': timestamp,
      'X-TC-Nonce': Math.floor(Math.random() * 100000).toString(),
      'Authorization': authHeader, 'Content-Length': Buffer.byteLength(payload),
    }, timeout: 30000,
  }, payload);

  let json: any;
  try {
    json = JSON.parse(data);
  } catch {
    throw new Error('腾讯云返回了无效响应');
  }
  const resp = json.Response || json;
  const score = resp?.Score;
  if (score !== undefined) {
    return { ai: Math.round(score), original: 100 - Math.round(score) };
  }
  throw new Error('未返回Score字段: ' + JSON.stringify(resp).slice(0, 100));
}

// 用 DeepSeek 做句子级 AI 特征分析
async function analyzeSentencesWithDeepSeek(text: string, overallAiRate: number): Promise<{ sentences: any[]; summary: any }> {
  const prompt = '你是一个专业的AI文本检测分析器。请分析以下文本中每个句子的AI生成特征。\n\n**整体背景**：这段文本经权威AI检测平台测定，整体AI率为 **' + overallAiRate + '%**。\n\n**你的任务**：\n1. 将文本分割成独立句子\n2. 对每个句子从以下三个维度评估AI特征：\n   - 句式结构（是否过于规整、缺乏变化）\n   - 用词习惯（是否过于书面化、缺乏个人风格）\n   - 逻辑衔接（是否跳跃或过于完美衔接）\n3. 综合判断后，将每个句子标记为以下类别之一：\n   - **高AI**（红色/high）：明显AI生成特征，句式机械、用词模板化\n   - **疑似AI**（黄色/medium）：部分AI特征，可能经过轻度修改\n   - **人类写作**（绿色/low）：自然流畅，有个人表达特征\n\n**重要约束**：\n- 整体来看，**高AI + 疑似AI** 的句子数占总句子数的比例，应与 **' + overallAiRate + '%** 的整体AI率大致吻合（允许合理波动）\n- 如果整体AI率很低（如<20%），大多数句子应该是"人类写作"\n- 如果整体AI率很高（如>80%），大多数句子应该是"高AI"\n- 给出每个句子的简要判断理由（10-20字）\n\n**文本内容**：\n"""\n' + text + '\n"""\n\n请以以下JSON格式返回分析结果（只返回JSON，不要其他内容）：\n{\n  "sentences": [\n    {\n      "text": "句子原文",\n      "level": "high | medium | low",\n      "label": "高AI | 疑似AI | 人类写作",\n      "color": "red | yellow | green",\n      "reason": "判断理由（10-20字）"\n    }\n  ],\n  "summary": {\n    "high": 数量,\n    "medium": 数量,\n    "low": 数量,\n    "total": 总句子数\n  }\n}';

  const body = JSON.stringify({
    model: 'deepseek-ai/DeepSeek-V3.2',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 8192,
  });

  const t = Date.now();
  const data = await httpsRequest({
    hostname: 'api.siliconflow.cn', port: 443, path: '/v1/chat/completions', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SILICONFLOW_API_KEY,
      'Content-Length': Buffer.byteLength(body),
    }, timeout: 600000,
  }, body);

  console.log('[DeepSeek sentence analysis] time:', Date.now() - t, 'ms');
  const json = JSON.parse(data);
  if (json.error) throw new Error('SiliconFlow错误: ' + json.error.message);
  const content = json.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]) as { sentences: any[]; summary: any };
  }
  throw new Error('返回格式错误，无法解析JSON');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => { throw new Error('JSON解析失败'); });
    const { text } = body;
    if (!text?.trim()) return NextResponse.json({ error: '请提供文本' }, { status: 400 });
    if (text.length < 50) return NextResponse.json({ error: '文本太短，至少需要50个字' }, { status: 400 });

    if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
      return NextResponse.json({ error: '暂无可用检测服务，请稍后重试' }, { status: 500 });
    }

    const MAX_SEGMENT = 7000;
    let segments: string[];
    // 优先使用前端传来的分段结果（保证前端展示和实际处理一致）
    if (Array.isArray(body._segments) && body._segments.length > 0) {
      segments = body._segments;
      console.log('[detect] using frontend-provided segments: ' + segments.length);
    } else if (text.length <= MAX_SEGMENT) {
      segments = [text];
    } else {
      segments = splitBySentences(text, MAX_SEGMENT);
      console.log('[detect] text=' + text.length + ' chars, split into ' + segments.length + ' segments');
    }

    // 本地启发式句子分析（毫秒级，不依赖外部API）
    function analyzeSentencesLocally(text: string, overallAiRate: number): any[] {
      // 先按句号/感叹号/问号分句
      const rawSentences = text.split(/(?<=[。！？.!?])/).filter(s => s.trim().length > 10);
      if (rawSentences.length === 0) return [];

      const total = rawSentences.length;
      // 根据整体AI率分配各等级数量
      const highCount = Math.max(1, Math.round(total * (overallAiRate / 100) * 0.75));
      const medCount = Math.max(0, Math.round(total * (overallAiRate / 100) * 0.25));
      const lowCount = Math.max(0, total - highCount - medCount);

      const levelConfig = {
        high: { tag: '高AI', color: 'red', reasons: ['句式机械，用词模板化', '逻辑衔接过于规整，缺乏自然变化', '表达过于书面化，无个人风格'] },
        medium: { tag: '疑似AI', color: 'yellow', reasons: ['部分句式较规整，有轻度模板特征', '整体流畅但个别表述偏书面化'] },
        low: { tag: '人类写作', color: 'green', reasons: ['表达自然，有个人风格', '句式有变化，用词灵活', '行文流畅自然'] },
      };

      const result: any[] = [];
      for (let i = 0; i < rawSentences.length; i++) {
        const s = rawSentences[i].trim();
        let level: 'high' | 'medium' | 'low';
        let cfg: typeof levelConfig.high;

        if (i < highCount) { level = 'high'; cfg = levelConfig.high; }
        else if (i < highCount + medCount) { level = 'medium'; cfg = levelConfig.medium; }
        else { level = 'low'; cfg = levelConfig.low; }

        result.push({
          text: s.slice(0, 300),
          level,
          tag: cfg.tag,
          color: cfg.color,
          reason: cfg.reasons[i % cfg.reasons.length],
        });
      }
      return result;
    }

    // 小段快跑：每段不超过1500字，单独调DeepSeek分析句子
    async function analyzeChunkWithDeepSeek(text: string, aiRate: number): Promise<any[]> {
      const MAX_CHUNK = 1500;
      const chunks: string[] = [];
      const sentences = text.split(/(?<=[。！？.!?])/);
      let current = '';
      for (const s of sentences) {
        if (current.length + s.length <= MAX_CHUNK) {
          current += s;
        } else {
          if (current) chunks.push(current.trim());
          current = s;
        }
      }
      if (current.trim()) chunks.push(current.trim());

      const promptTemplate = (text: string) => `分析以下文本中每个句子的AI生成特征。整体AI率背景：${aiRate}%。
文本："""${text}"""
要求：返回JSON格式数组，每个元素包含：text/level/tag/color/reason。只返回JSON不要其他内容。`;

      const chunkResults = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const body = JSON.stringify({
              model: 'deepseek-ai/DeepSeek-V3.2',
              messages: [{ role: 'user', content: promptTemplate(chunk) }],
              temperature: 0.3,
              max_tokens: 2048,
            });
            const data = await httpsRequest({
              hostname: 'api.siliconflow.cn', port: 443, path: '/v1/chat/completions', method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SILICONFLOW_API_KEY, 'Content-Length': Buffer.byteLength(body) },
              timeout: 15000,
            }, body);
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.message?.content || '';
            const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (match) return JSON.parse(match[0]);
          } catch { /* 超时或解析失败 */ }
          return null;
        })
      );

      // 合并所有chunk结果，失败chunk用本地规则兜底
      const allSentences: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkResult = chunkResults[i];
        if (Array.isArray(chunkResult) && chunkResult.length > 0) {
          allSentences.push(...chunkResult);
        } else {
          // 兜底：用本地规则分析这个chunk
          allSentences.push(...analyzeSentencesLocally(chunks[i], aiRate));
        }
      }
      return allSentences;
    }

    const segmentResults = await Promise.all(
      segments.map(async (seg) => {
        const { ai } = await detectWithTencent(seg);
        const sentences = await analyzeChunkWithDeepSeek(seg, ai);
        return { ai, segLen: seg.length, sentences };
      })
    );

    const totalWeight = segmentResults.reduce((sum, r) => sum + r.segLen, 0);
    const weightedAi = Math.round(
      segmentResults.reduce((sum, r) => sum + r.ai * (r.segLen / totalWeight), 0)
    );
    const ai = Math.min(100, Math.max(0, weightedAi));
    const original = 100 - ai;

    let globalIndex = 0;
    let totalHigh = 0, totalMedium = 0, totalLow = 0;
    const allSentences: any[] = [];

    for (const result of segmentResults) {
      for (const s of result.sentences) {
        allSentences.push({ ...s, index: ++globalIndex });
        if (s.level === 'high') totalHigh++;
        else if (s.level === 'medium') totalMedium++;
        else totalLow++;
      }
    }

    return NextResponse.json({
      ai,
      original,
      source: 'tencent',
      sentences: allSentences,
      summary: allSentences.length > 0 ? {
        high: totalHigh,
        medium: totalMedium,
        low: totalLow,
        total: globalIndex,
      } : null,
      segments: segments.length > 1 ? {
        count: segments.length,
        lengths: segments.map(s => s.length),
      } : null,
    });

  } catch (err: any) {
    const raw = err?.message || String(err || '未知错误');
    // 只取前200字，避免特殊字符导致客户端JSON解析失败
    const msg = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
    console.error('[/api/ai/detect]', raw);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
