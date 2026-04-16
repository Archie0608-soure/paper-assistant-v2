import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || 'sk-vsdqrgfgkcqtynmyyqpgubmzkztunmempbwmjajehvocxkyi';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

function countWords(text: string): number {
  return text ? text.replace(/\s/g, '').length : 0;
}

async function callSiliconFlow(prompt: string, temperature = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: 4096,
    });
    const options: https.RequestOptions = {
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
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log('[siliconflow] time:', Date.now() - t, 'ms');
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error('SiliconFlow错误: ' + json.error.message));
          else resolve(json.choices?.[0]?.message?.content || '');
        } catch { reject(new Error('响应解析失败')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API超时')); });
    req.write(body);
    req.end();
  });
}

// 生成复习资料
async function generateStudyMaterials(courseName: string, text: string): Promise<string> {
  const wordCount = countWords(text);
  const truncated = text.slice(0, 6000);

  const prompt = `你是一位大学课程助教，擅长从课程资料中提取关键信息并生成高质量复习资料。

请根据以下课程资料，为课程「${courseName}」生成结构化的复习材料。

要求生成的复习资料包含以下部分：
1. **课程概述** - 用3-5句话概括这门课的核心内容和学习目标
2. **核心知识点列表** - 列出10-20个最重要知识点，每个知识点用一句话解释
3. **名词解释** - 列出8-15个核心术语，给出简明定义（50字以内）
4. **重点简答题** - 生成5-8道典型简答题，并给出参考答案
5. **填空题** - 生成5-8道填空题，答案用括号标出
6. **知识框架图** - 用Markdown格式画出本课程的知识结构（用ASCII/Unicode图表）

格式要求：
- 所有内容用中文回复
- 使用Markdown格式输出
- 重点术语用**加粗**
- 简答题标注【简答题】、填空题标注【填空题】

课程资料内容：
${truncated}`;

  return await callSiliconFlow(prompt, 0.7);
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
    const { text, courseName } = body;
    if (!text?.trim()) return NextResponse.json({ error: '请提供课程资料' }, { status: 400 });
    if (!courseName?.trim()) return NextResponse.json({ error: '请输入课程名称' }, { status: 400 });

    const wordCount = countWords(text);
    const ESTIMATED_COINS = 40; // 复习资料固定40金币
    const supabase = getSupabase();

    const { data: users } = await supabase.from('users').select('id, balance').eq(userField, destination).limit(1).maybeSingle();
    if (!users) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const balance = users.balance ?? 0;
    if (balance < ESTIMATED_COINS) {
      return NextResponse.json({ error: `金币不足，生成复习资料需要${ESTIMATED_COINS}金币，当前余额${balance}金币` }, { status: 402 });
    }

    // 预扣
    await supabase.from('users').update({ balance: balance - ESTIMATED_COINS }).eq('id', users.id).eq('balance', balance);

    try {
      const result = await generateStudyMaterials(courseName, text);

      // 记录交易
      await supabase.from('transactions').insert({
        user_id: users.id,
        type: 'expense',
        amount: -ESTIMATED_COINS,
        description: '生成复习资料',
      });

      return NextResponse.json({ result, coins: ESTIMATED_COINS });
    } catch (err: any) {
      // 失败退款
      await supabase.from('users').update({ balance: balance }).eq('id', users.id);
      throw err;
    }

  } catch (err: any) {
    const msg = err?.message || String(err || '未知错误');
    console.error('[/api/study/generate]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
