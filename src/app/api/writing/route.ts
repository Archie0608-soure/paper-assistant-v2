import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CoinAction = 'outline' | 'chapter' | 'polish' | 'expand';

// 计算金币
function calcCoins(action: CoinAction, textLength: number): number {
  if (action === 'chapter') {
    // AI生成全文：每1000字60金币
    return Math.ceil(textLength / 1000) * 60;
  }
  if (action === 'polish') {
    // AI润色：每100字4金币
    return Math.ceil(textLength / 100) * 4;
  }
  if (action === 'expand') {
    // AI扩写：每50字3金币
    return Math.ceil(textLength / 50) * 3;
  }
  return 0; // outline 免费
}

// 扣费
async function deductCoins(destination: string, action: CoinAction, textLength: number): Promise<number> {
  const coins = calcCoins(action, textLength);
  if (coins === 0) return 0;

  const supabase = supabaseClient();
  const userField = destination.includes('@') ? 'email' : 'phone';
  const { data: user } = await supabase
    .from('users')
    .select('id, balance')
    .eq(userField, destination)
    .single();

  if (!user) throw new Error('用户不存在');
  if (user.balance < coins) {
    throw new Error(`余额不足，需要${coins}金币，当前${user.balance}金币`);
  }

  await supabase
    .from('users')
    .update({ balance: user.balance - coins })
    .eq(userField, destination);

  return coins;
}

function getUserFromSession(req: NextRequest): string | null {
  const session = req.cookies.get('pa_session');
  if (!session) return null;
  try {
    const sessionData = Buffer.from(session.value, 'base64url').toString();
    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    return dest || beforeLast;
  } catch {
    return null;
  }
}

async function callAI(prompt: string): Promise<string> {
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 API Key');

  const usingSiliconFlow = !!process.env.SILICONFLOW_API_KEY;
  const apiUrl = usingSiliconFlow
    ? 'https://api.siliconflow.cn/v1/chat/completions'
    : 'https://api.deepseek.com/v1/chat/completions';
  const model = usingSiliconFlow ? 'deepseek-ai/DeepSeek-V3.2' : 'deepseek-chat';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 }),
  });

  if (!response.ok) throw new Error(`AI API error: ${response.status}`);
  return (await response.json()).choices[0].message.content;
}

export async function POST(req: NextRequest) {
  try {
    const userDest = getUserFromSession(req);
    if (!userDest) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // 生成大纲（免费）
    if (action === 'generate-outline' || (!action && body.major && body.topic && !body.chapterTitle)) {
      const { major, topic } = body;
      const topicStr = typeof topic === 'string' ? topic : (topic?.title || JSON.stringify(topic));
      const prompt = `你是一位资深的学术论文指导教师。请为${major}专业的本科学生，针对以下论文主题，生成一份完整的毕业论文大纲。

论文主题：${topicStr}

要求：
1. 符合本科毕业论文的学术规范和篇幅要求
2. 章节结构合理，包括：摘要、关键词、绪论、理论基础、研究方法、结果分析、结论、参考文献
3. 每个章节简要说明内容要点（约20-50字）
4. 语言简洁、学术

请用JSON格式输出：
{
  "title": "${topicStr}",
  "chapters": [
    {"number": 1, "title": "章节标题", "content": "章节内容要点"}
  ]
}
只输出JSON，不要其他内容。`;

      const result = await callAI(prompt);
      let outline;
      try {
        const match = result.match(/\{[\s\S]*\}/);
        outline = match ? JSON.parse(match[0]) : { title: topic, chapters: [] };
      } catch {
        outline = { title: topic, chapters: [] };
      }
      return NextResponse.json({ outline, deducted: 0 });
    }

    // 生成章节内容
    if (action === 'generate-chapter' || body.chapterTitle) {
      const { topic, chapterTitle, chapterContent, previousChapterSummary } = body;
      // 扣费：按输入长度（章节要求字数）计算
      const inputLength = (chapterTitle + chapterContent + (previousChapterSummary || '')).length;
      const deductAmount = await deductCoins(userDest, 'chapter', inputLength);

      const prompt = `你是一位在帮导师干活的研究生，导师让你帮本科生看看论文草稿。你需要"假装"帮这个本科生写一段章节内容，但实际上这段内容会被拿去检测AI率，所以必须看起来完全像人写的。

上一章已经写了：${previousChapterSummary || '无'}
现在要写的章节：${chapterTitle}
章节要求：${chapterContent}

脑子里想着：
- 一个真实的大四学生在赶ddl，凌晨两点在宿舍里敲键盘
- 边想边写，会有一些重复的废话
- 专业术语会用对，但不会每句话都滴水不漏
- 偶尔会有口语化的转折

要求：
1. 字数在600-1200字左右
2. 句子长短不一
3. 可以有重复啰嗦的表达
4. 结尾可以有点仓促
5. 不要每句话都那么"完美"

直接写内容，不要加任何标记。`;

      const result = await callAI(prompt);
      return NextResponse.json({ content: result, deducted: deductAmount });
    }

    // 润色
    if (action === 'polish') {
      const { text } = body;
      const deductAmount = await deductCoins(userDest, 'polish', text.length);

      const prompt = `你需要把下面这段学术论文内容"毁容式改写"——让它看起来完全不像是AI写的，而是像一个赶deadline的本科生随手敲的。

改写规则：
1. 把"首先/其次/最后"换成"然后"、"接着"、"再说"
2. 把"因此/由此可见/综上所述"换成"所以说"、"这么看"
3. 把"此外/另外/与此同时"换成"还有"、"对了"
4. 每3句话里必须有1句是短句（5个字以内）
5. 加1-2句重复啰嗦的废话
6. 结尾要仓促
7. 专业术语保留，其他词可以口语化

原文：
${text}

直接输出改写内容，不要加任何说明。`;

      const result = await callAI(prompt);
      return NextResponse.json({ polished: result, deducted: deductAmount });
    }

    // 扩写
    if (action === 'expand') {
      const { text, targetLength } = body;
      const deductAmount = await deductCoins(userDest, 'expand', text.length);

      const prompt = `请将以下学术论文内容进行扩写，使其更加详尽丰富。

要求：
1. 保持原文学术风格
2. 适当补充案例、说明和论证
3. 扩写后的字数约为原文的1.5-2倍
4. 不要改变原文的核心观点

原文：
${text}

扩写后（直接输出内容）：`;

      const result = await callAI(prompt);
      return NextResponse.json({ expanded: result, deducted: deductAmount });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    console.error('Writing API error:', error);
    return NextResponse.json({ error: error.message || '服务器错误' }, { status: 500 });
  }
}
