import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import https from 'https';

const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const TENCENT_BIZ_TYPE = process.env.TENCENT_BIZ_TYPE || 'aigc_text_detect_100037665348';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || 'sk-vsdqrgfgkcqtynmyyqpgubmzkztunmempbwmjajehvocxkyi';

// 调用腾讯云 TMS AIGC 检测（总分）
async function detectWithTencent(text: string): Promise<{ ai: number; original: number }> {
  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
    throw new Error('未配置腾讯云 Secret');
  }

  const contentBase64 = Buffer.from(text).toString('base64');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const date = new Date().toISOString().slice(0, 10);
  const host = 'tms.tencentcloudapi.com';
  const service = 'tms';
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${service}/tc3_request`;

  const payload = JSON.stringify({
    Content: contentBase64,
    Type: 'TEXT_AIGC',
    BizType: TENCENT_BIZ_TYPE,
  });
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST', canonicalUri, canonicalQueryString,
    canonicalHeaders, signedHeaders, hashedPayload,
  ].join('\n');

  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  const kDate = crypto.createHmac('sha256', `TC3${TENCENT_SECRET_KEY}`).update(date).digest();
  const kService = crypto.createHmac('sha256', kDate).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authHeader = `${algorithm} Credential=${TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: host, port: 443, path: '/', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Host': host,
        'X-TC-Action': 'TextModeration', 'X-TC-Version': '2020-12-29',
        'X-TC-Region': 'ap-guangzhou', 'X-TC-Timestamp': timestamp,
        'X-TC-Nonce': Math.floor(Math.random() * 100000).toString(),
        'Authorization': authHeader, 'Content-Length': Buffer.byteLength(payload),
      }, timeout: 30000,
    };

    const req = require('https').request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const resp = json.Response || json;
          const score = resp.Score;
          if (score !== undefined) {
            resolve({ ai: Math.round(score), original: 100 - Math.round(score) });
          } else {
            throw new Error('未返回Score字段: ' + JSON.stringify(resp).slice(0, 100));
          }
        } catch (e: any) { reject(new Error('解析失败: ' + data.slice(0, 200) + ' | ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(payload);
    req.end();
  });
}

// 用 DeepSeek 做句子级 AI 特征分析
async function analyzeSentencesWithDeepSeek(text: string, overallAiRate: number): Promise<{ sentences: any[]; summary: any }> {
  const aiPercent = overallAiRate;

  // 根据总分决定各级别的大致比例
  // 高AI(>70%): 占总数 * aiPercent，高疑似(40-70%): 另计，低疑似(20-40%): 另计
  const prompt = `你是一个专业的AI文本检测分析器。请分析以下文本中每个句子的AI生成特征。

**整体背景**：这段文本经权威AI检测平台测定，整体AI率为 **${aiPercent}%**。

**你的任务**：
1. 将文本分割成独立句子
2. 对每个句子从以下三个维度评估AI特征：
   - 句式结构（是否过于规整、缺乏变化）
   - 用词习惯（是否过于书面化、缺乏个人风格）
   - 逻辑衔接（是否跳跃或过于完美衔接）
3. 综合判断后，将每个句子标记为以下类别之一：
   - **高AI**（红色）：明显AI生成特征，句式机械、用词模板化
   - **疑似AI**（黄色）：部分AI特征，可能经过轻度修改
   - **人类写作**（绿色）：自然流畅，有个人表达特征

**重要约束**：
- 整体来看，**高AI + 疑似AI** 的句子数占总句子数的比例，应与 **${aiPercent}%** 的整体AI率大致吻合（允许合理波动）
- 如果整体AI率很低（如<20%），大多数句子应该是"人类写作"
- 如果整体AI率很高（如>80%），大多数句子应该是"高AI"
- 给出每个句子的简要判断理由（10-20字）

**文本内容**：
"""
${text}
"""

请以以下JSON格式返回分析结果（只返回JSON，不要其他内容）：
{
  "sentences": [
    {
      "text": "句子原文",
      "level": "high | medium | low",
      "label": "高AI | 疑似AI | 人类写作",
      "color": "red | yellow | green",
      "reason": "判断理由（10-20字）"
    }
  ],
  "summary": {
    "high": 数量,
    "medium": 数量,
    "low": 数量,
    "total": 总句子数
  }
}`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 8192,
    });
    const options = {
      hostname: 'api.siliconflow.cn',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SILICONFLOW_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120000,
    };

    const t = Date.now();
    const req = https.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        console.log('[DeepSeek sentence analysis] time:', Date.now() - t, 'ms');
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error('SiliconFlow错误: ' + json.error.message));
          const content = json.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]) as { sentences: any[]; summary: any });
          } else {
            reject(new Error('返回格式错误，无法解析JSON'));
          }
        } catch (e: any) { reject(new Error('解析失败: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API超时')); });
    req.write(body);
    req.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => { throw new Error('JSON解析失败'); });
    const { text } = body;
    if (!text?.trim()) return NextResponse.json({ error: '请提供文本' }, { status: 400 });
    if (text.length < 50) return NextResponse.json({ error: '文本太短，至少需要50个字' }, { status: 400 });
    if (text.length > 8000) return NextResponse.json({ error: '文本不能超过8000字，请分段检测' }, { status: 400 });

    if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
      return NextResponse.json({ error: '暂无可用检测服务，请稍后重试' }, { status: 500 });
    }

    // Step 1: 腾讯云获取整体AI率
    const { ai, original } = await detectWithTencent(text);

    // Step 2: DeepSeek句子级分析
    let sentenceAnalysis: { sentences: any[]; summary: any } | null = null;
    try {
      sentenceAnalysis = await analyzeSentencesWithDeepSeek(text, ai);
    } catch (e: any) {
      console.error('[sentence analysis failed]', e.message);
      // 句子分析失败不影响主流程
    }

    const result = {
      ai,
      original,
      source: 'tencent',
      sentences: sentenceAnalysis?.sentences || [],
      summary: sentenceAnalysis?.summary || null,
    };

    return NextResponse.json(result);

  } catch (err: any) {
    const msg = err?.message || String(err || '未知错误');
    console.error('[/api/ai/detect]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
