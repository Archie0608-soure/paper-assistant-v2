import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function callSiliconFlow(messages: any[], temperature = 0.7) {
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 API Key');
  const apiUrl = 'https://api.siliconflow.cn/v1/chat/completions';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'deepseek-ai/DeepSeek-V3.2', messages, temperature }),
  });
  if (!response.ok) throw new Error(`AI API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

function countWords(text: string): number {
  return text ? text.replace(/\s/g, '').length : 0;
}

// 润色: 每50词1金币
// 扩写: 每扩50词1金币（扩写增量=结果字数-输入字数，预估增量约30%，即输入*0.3/50）
function calcCoins(action: string, inputText: string, outputText?: string): number {
  const inputWords = countWords(inputText);
  if (action === 'polish') {
    return Math.ceil(inputWords / 50);
  } else {
    // 扩写预估：增量约为输入的30%
    const estimatedNew = Math.ceil(inputWords * 0.3);
    return Math.ceil(estimatedNew / 50);
  }
}

// POST: 润色 / 扩写
export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const { action, text, context, chapterTitle } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: '请提供文本' }, { status: 400 });
    if (!['polish', 'expand'].includes(action)) return NextResponse.json({ error: '无效操作' }, { status: 400 });

    // 解析session
    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
    const userField = type === 'email' ? 'email' : 'phone';

    const supabase = getSupabase();
    const { data: users } = await supabase.from('users').select('id, balance').eq(userField, destination).limit(1);
    if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const userId = users[0].id;
    const coins = calcCoins(action, text);
    const balance = users[0].balance ?? 0;

    if (balance < coins) {
      return NextResponse.json({ error: `金币不足，${action === 'polish' ? '润色' : '扩写'}约需${coins}金币（${countWords(text)}字），当前余额${balance}金币` }, { status: 402 });
    }

    // 扣金币
    await supabase.from('users').update({ balance: balance - coins }).eq('id', userId).eq('balance', balance);
    // 记录交易明细
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'expense',
      amount: -coins,
      description: action === 'polish' ? 'AI润色' : 'AI扩写',
    });

    const title = chapterTitle || '本章';
    let systemPrompt = '';
    let userPrompt = '';

    if (action === 'polish') {
      systemPrompt = `你是一个专业的学术论文润色助手。你的任务是改善用户提供的论文文本的表达方式，使其更加：
1. 学术规范（使用正式学术用语）
2. 表达清晰（逻辑连贯、论述有力）
3. 语言流畅（句式多样、行文简洁）
4. 客观准确（避免口语化、主观色彩）

润色原则：
- 保持原意不变，只改进表达
- 使用学术规范用语替换口语化表达
- 优化句式结构，增强逻辑性
- 修正可能的语病和用词不当
- 保持原有段落结构和字数规模`;

      userPrompt = `请润色以下论文文本（保持原意，只改进表达）：

${text}`;
    } else if (action === 'expand') {
      systemPrompt = `你是一个专业的学术论文写作助手。你的任务是对用户提供的论文文本进行合理扩写，基于上下文增加论述深度和细节。

扩写原则：
- 保持原有观点和核心论述不变
- 不添加新的核心论点
- 基于上下文理解论文主题和写作风格
- 扩写内容要与原文风格一致
- 增加的篇幅约为原文的30%
- 扩写内容要有学术价值，不能是简单的重复或废话
- 输出只包含扩写后的文本，不要说明`;

      const beforeCtx = context?.before ? `【前文】\n${context.before}\n\n` : '';
      const afterCtx = context?.after ? `\n\n【后文】\n${context.after}` : '';
      userPrompt = `请对以下论文文本进行扩写（基于上下文增加论述深度和细节）：

【待扩写文本】
${text}
${beforeCtx}${afterCtx}`;
    }

    const result = await callSiliconFlow([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], action === 'polish' ? 0.5 : 0.7);

    // 扩写实际扣费：按实际增量
    if (action === 'expand') {
      const actualNew = Math.max(0, countWords(result) - countWords(text));
      const actualCoins = Math.ceil(actualNew / 50);
      const diff = actualCoins - coins;
      if (diff !== 0) {
        const { data: row } = await supabase.from('users').select('balance').eq('id', userId).single();
        if (row) {
          await supabase.from('users').update({ balance: row.balance - diff }).eq('id', userId);
        }
      }
    }

    return NextResponse.json({ result, action, coins });

  } catch (error: any) {
    console.error('AI 处理失败:', error);
    return NextResponse.json({ error: error.message || 'AI处理失败，请重试' }, { status: 500 });
  }
}
