import { NextRequest, NextResponse } from 'next/server';

// DeepSeek 调用
async function callDeepSeek(prompt: string) {
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('未配置 DeepSeek API Key');
  }

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
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 智谱 GLM 调用（硅基流动）
async function callGLM(prompt: string) {
  // 优先使用硅基流动 API，其次智谱官网
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.ZHIPU_API_KEY;
  const usingSiliconFlow = !!process.env.SILICONFLOW_API_KEY;
  const apiUrl = usingSiliconFlow 
    ? 'https://api.siliconflow.cn/v1/chat/completions'
    : 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  // 硅基流动使用 Pro/zai-org/GLM-4.7，智谱官网使用 glm-4-flash
  const model = usingSiliconFlow ? 'deepseek-ai/DeepSeek-V3.2' : 'glm-4-flash';
  
  console.log('callGLM - 使用硅基流动:', usingSiliconFlow, 'URL:', apiUrl, 'Model:', model);
  
  if (!apiKey) {
    throw new Error('未配置 API Key');
  }

  console.log('callGLM - 开始请求...');
  
  // 带超时控制的 fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55秒超时
  
  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('callGLM - 请求超时');
      throw new Error('GLM 请求超时，请重试');
    }
    console.error('callGLM - 网络错误:', err.message);
    throw err;
  }
  
  clearTimeout(timeoutId);
  console.log('callGLM - 响应状态:', response.status);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`智谱 API error: ${response.status}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log('callGLM - 返回内容长度:', content.length, '前100字:', content.substring(0, 100));
  return content;
}

// 优先智谱，失败自动切换 DeepSeek
async function callAI(prompt: string) {
  const hasZhipuKey = !!process.env.ZHIPU_API_KEY;
  console.log('callAI - 智谱Key存在:', hasZhipuKey, 'Key前10位:', process.env.ZHIPU_API_KEY?.substring(0, 10));
  
  if (hasZhipuKey) {
    try {
      const result = await callGLM(prompt);
      console.log('智谱调用成功');
      return result;
    } catch (e: any) {
      console.log('智谱调用失败，切换DeepSeek:', e.message);
    }
  } else {
    console.log('未配置智谱Key，使用DeepSeek');
  }
  return await callDeepSeek(prompt);
}


// ===== 金币扣费逻辑 =====
function getUserFromSession(req: NextRequest): string | null {
  const session = req.cookies.get('pa_session');
  if (!session) return null;
  try {
    const sessionData = Buffer.from(session.value, 'base64url').toString();
    const parts = sessionData.split(':');
    return parts[1] || null;
  } catch { return null; }
}

function calcCoins(action: string, textLength: number): number {
  if (action === 'generate-chapter') {
    return Math.ceil(textLength / 1000) * 60;
  }
  if (action === 'polish') {
    return Math.ceil(textLength / 100) * 4;
  }
  if (action === 'expand') {
    return Math.ceil(textLength / 50) * 3;
  }
  return 0;
}

async function deductCoins(req: NextRequest, action: string, textLength: number): Promise<number> {
  const coins = calcCoins(action, textLength);
  if (coins === 0) return 0;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const userDest = getUserFromSession(req);
  if (!userDest) throw new Error('请先登录');

  const userField = userDest.includes('@') ? 'email' : 'phone';
  const { data: user } = await supabase
    .from('users').select('id, balance').eq(userField, userDest).single();

  if (!user) throw new Error('用户不存在');
  if (user.balance < coins) throw new Error('余额不足，需要' + coins + '金币，当前' + user.balance + '金币');

  await supabase.from('users').update({ balance: user.balance - coins }).eq(userField, userDest);
  return coins;
}

// 选题生成提示词
const TOPIC_GENERATION_PROMPT = (field: string, topic?: string, userTopic?: boolean, paperType?: string) => {
  const typeDesc = paperType === 'proposal' ? '开题报告' : paperType === 'paper' ? '课程论文' : '毕业论文';
  
  if (userTopic && topic) {
    return `
你是一位资深的学术论文指导教师。学生的${field}专业需要写一篇${typeDesc}，已经有了一个初步主题："${topic}"

请帮学生把这个主题细化和具体化，提供3个可行的具体研究方向。

要求：每个方向输出JSON，包含title（方向标题）、question（核心研究问题）、method（研究方法）。

请严格按以下JSON数组格式输出，不要输出其他内容：
[{"title":"方向1标题","question":"核心问题描述","method":"研究方法描述"},{"title":"方向2标题","question":"核心问题描述","method":"研究方法描述"},{"title":"方向3标题","question":"核心问题描述","method":"研究方法描述"}]`;
  }
  
  return `
你是一位资深的学术论文指导教师。请为${field}专业的本科学生，提供3个适合${typeDesc}的论文选题方向。

要求：每个选题输出JSON，包含title（选题标题）、question（核心研究问题）、method（研究方法）。

请严格按以下JSON数组格式输出，不要输出其他内容：
[{"title":"选题1标题","question":"核心问题描述","method":"研究方法描述"},{"title":"选题2标题","question":"核心问题描述","method":"研究方法描述"},{"title":"选题3标题","question":"核心问题描述","method":"研究方法描述"}]`;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 选题生成
    if (action === 'generate-topics' || (!action && body.field && (body.topic || body.interest))) {
      const { field, topic, userTopic, paperType, interest } = body;
      
      if (!field) {
        return NextResponse.json({ error: '请选择专业方向' }, { status: 400 });
      }

      if (!topic && !interest) {
        return NextResponse.json({ error: '请输入论文主题或研究方向' }, { status: 400 });
      }

      const prompt = TOPIC_GENERATION_PROMPT(field, topic, userTopic, paperType);
      const raw = await callAI(prompt);

      // 尝试解析 JSON 数组
      let topics;
      try {
        const jsonMatch = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch) {
          topics = JSON.parse(jsonMatch[0]);
        }
      } catch {
        topics = null;
      }

      // 如果解析失败，返回原始文本
      return NextResponse.json({ 
        topics: topics || raw,
        structured: !!topics 
      });
    }

    // 生成大纲
    if (action === 'generate-outline' || (body.major && body.topic && !body.chapterTitle)) {
      const { major, topic, paperType } = body;

      const prompt = `你是一位资深的学术论文指导教师。请为${major}专业的本科学生，针对以下论文主题，生成一份完整的毕业论文大纲。

论文主题：${topic}

要求：
1. 符合本科毕业论文的学术规范和篇幅要求
2. 章节结构合理，包括：摘要、关键词、绪论、理论基础、研究方法、结果分析、结论、参考文献
3. 每个章节简要说明内容要点（约20-50字）
4. 语言简洁、学术，避免过于口语化

请用JSON格式输出，格式如下：
{
  "title": "论文标题",
  "chapters": [
    {"number": 1, "title": "章节标题", "content": "章节内容要点"},
    {"number": 2, "title": "章节标题", "content": "章节内容要点"}
  ]
}

只输出JSON，不要其他内容：`;

      const result = await callAI(prompt);
      
      // 尝试解析JSON
      let outline;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          outline = JSON.parse(jsonMatch[0]);
        } else {
          outline = { title: topic, chapters: [] };
        }
      } catch {
        outline = { title: topic, chapters: [] };
      }
      
      return NextResponse.json({ outline });
    }

    // 生成章节内容
    if (action === 'generate-chapter' || body.chapterTitle) {
      const { topic, chapterTitle, chapterContent, previousChapterSummary, targetWordCount, keywordCount } = body;
      const wordTarget = targetWordCount || 1000;
      const kCount = keywordCount || 5;

      // 关键词章节特殊处理
      if (chapterTitle.toLowerCase().includes('关键词') || chapterTitle.toLowerCase().includes('keyword')) {
        const keywordPrompt = `你是一个学术论文助手。请为论文"${topic}"生成${kCount}个关键词。

要求：
1. 选择精准、学术化的关键词
2. 每个关键词2-4个字（或英文单词）
3. 用逗号分隔，直接输出关键词列表
4. 不要编号，不要其他说明

示例格式：人工智能，机器学习，数据挖掘，深度学习，神经网络

请输出${kCount}个关键词：`;
        const result = await callAI(keywordPrompt);
        return NextResponse.json({ content: result });
      }

      const prompt = `你是一位帮助本科生写论文的助教。用户正在写一篇关于"${topic}"的毕业论文。

上一章节概要：${previousChapterSummary || '无'}

当前需要撰写的章节：${chapterTitle}
章节要求：${chapterContent}

写作要求（请严格遵守，否则用户会被检测出AI写作）：
1. 字数严格控制在${wordTarget}字左右，不超过${wordTarget + 200}字
2. **句式必须有明显变化**：长短句交替，主动句和被动句交替，避免每句话都以相似结构开头
3. **必须使用以下表达增加真人写作感**：
   - 犹豫/不确定词："可能"、"大概"、"一般来说"、"某种程度上说"、"笔者认为"、"在查阅资料时注意到"
   - 引用/学术谨慎："有学者指出"、"部分研究认为"、"相关数据表明"
   - 转折/过渡："值得注意的是"、"在此基础上"、"与此同时"、"从这个角度看"
4. **禁止使用规律性过渡词**：避免连续使用"首先、其次、最后"结构，同一过渡词不能在300字内重复出现
5. **每200字内至少出现一处不完整句子、省略号、或口语化表达**
6. **在章节结尾适当承认局限性**：如"本研究存在一定局限"、"数据来源有限，结论需进一步验证"
7. 使用"笔者"、"本文"时要有变化，不要每段都重复
8. 禁止使用AI惯用的完美排比句

请直接输出章节内容，不要任何说明：`;

      const result = await callAI(prompt);

      if (!result || result.trim().length < 50) {
        throw new Error('生成内容过短或为空，请重试');
      }

      // 自动润色（降低AI率）
      const humanizePrompt = `你是一个文风改写专家。请将以下AI生成的学术论文内容彻底改写成真人写作风格：

必须执行：
1. 把所有"首先、其次、最后"结构改成自然的分散表达
2. 加入犹豫词："可能"、"大概"、"笔者认为"至少每100字出现1次
3. 加入口语："说实话"、"其实"、"不过"至少2次
4. 加入思考过程："查阅资料时注意到"、"进一步思考后发现"
5. 使用更短段落和句子，模拟真人写作的自然节奏
6. 加入轻微修正或矛盾："初看如此，但进一步想..."

原文：
${result}

改写后（直接输出，不要说明）：`;
      const humanized = await callAI(humanizePrompt);

      const deductAmount = await deductCoins(req, 'generate-chapter', chapterTitle.length + chapterContent.length + (previousChapterSummary || '').length);
      return NextResponse.json({ content: humanized, deducted: deductAmount });
    }

    // 润色（降低AI率）
    if (action === 'polish' || body.text) {
      const { text } = body;

      const prompt = `你是一个学术论文改写专家。请将以下AI生成的学术论文内容改写得更自然流畅，消除AI写作痕迹，同时保持学术论文的专业和规范：

改写要求：
1. **消除AI痕迹**：打破过于规整的"首先-其次-最后"结构；减少完美排比句；句式不要过于对仗工整
2. **保持学术风格**：使用"本研究"、"本文认为"、"相关研究表明"、"在一定程度上"等学术规范表达
3. **语言自然流畅**：句子长短交错，避免每句长度相同；段落之间过渡自然
4. **专业术语不变**：核心技术词汇必须保留原样
5. **适度变化**：句首词组适当变化，避免连续多句以相同词开头（如"因此"、"此外"、"首先"）
6. **禁止出现**：过于口语的词汇如"玩意儿"、"东西"、"琢磨"、"其实说实话"等

原文：
${text}

改写后（直接输出，保持学术论文风格，自然流畅即可，不要说明）：`;

      const result = await callAI(prompt);
      
      const deductAmount = await deductCoins(req, 'polish', text.length);
      return NextResponse.json({ polished: result, deducted: deductAmount });
    }

    // 翻译（用于中文搜索关键词转英文）
    if (action === 'translate' || body.text) {
      const { text } = body;

      const prompt = `请把以下中文关键词翻译成英文，只输出英文关键词，不要其他内容：

中文：${text}

英文（只输出翻译结果）：`;

      const result = await callAI(prompt);
      
      return NextResponse.json({ translated: result.trim() });
    }

    // 扩展搜索词（用于生成多个学术化搜索关键词）
    if (action === 'expand-search' || body.topic) {
      const { topic } = body;

      const prompt = `用户想要搜索关于"${topic}"的学术论文。
请根据这个主题，生成3个不同的、学术化的英文搜索关键词或短语，用于在学术数据库中搜索。

要求：
1. 每个搜索词要具体、学术化，不要太泛
2. 覆盖主题的不同角度或同义词
3. 只输出JSON数组格式，不要其他内容

输出格式：["搜索词1", "搜索词2", "搜索词3"]`;

      const result = await callAI(prompt);
      
      // 尝试解析 JSON
      try {
        const jsonMatch = result.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const queries = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ queries });
        }
      } catch { /* ignore */ }
      
      return NextResponse.json({ queries: [] });
    }

    // 翻译论文标题和摘要（英文转中文）
    if (action === 'translate-papers') {
      const { papers } = body;
      if (!papers || !Array.isArray(papers)) {
        return NextResponse.json({ papers });
      }

      const prompt = `请将以下学术论文的标题翻译成中文，保持学术风格。如果有摘要，也请翻译成中文。

论文列表（JSON格式）：
${JSON.stringify(papers.slice(0, 10), null, 2)}

请严格按以下JSON数组格式输出，只输出JSON，不要其他内容：
[{"title":"中文标题","abstract":"中文摘要"},...]`;

      const raw = await callAI(prompt);
      
      try {
        const jsonMatch = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch) {
          const translated = JSON.parse(jsonMatch[0]);
          // 合并翻译结果
          const merged = papers.slice(0, translated.length).map((p: any, i: number) => ({
            ...p,
            title: translated[i]?.title || p.title,
            abstract: translated[i]?.abstract || p.abstract,
          }));
          return NextResponse.json({ papers: merged });
        }
      } catch { /* ignore */ }
      
      return NextResponse.json({ papers });
    }

    // AI 过滤和筛选搜索结果（最关键的一步）
    if (action === 'filter-papers') {
      const { topic, papers } = body;
      if (!papers || !Array.isArray(papers)) {
        return NextResponse.json({ papers: [] });
      }

      const prompt = `用户的研究主题是："${topic}"

以下是搜索返回的学术论文列表（可能包含很多不相关的）：
${JSON.stringify(papers.slice(0, 30), null, 2)}

你的任务是：仔细阅读每篇论文的标题和摘要，判断它是否与用户的研究主题"${topic}"相关。

评分标准：
- 5分：完全相关，直接涉及用户研究主题的核心内容
- 3分：部分相关，涉及到主题的某个方面或子领域
- 1分：勉强相关，只有个别词汇重叠但实质无关
- 0分：完全不相关，是其他领域的内容

请按以下JSON格式输出，只输出JSON，不要其他内容：
{"filtered": [你认为是3分以上的论文，最多返回10篇，按相关性从高到低排序，每篇包含原论文的所有信息，并在末尾加上"relevance_score"字段表示你的评分]}}

注意：只返回真正与"${topic}"相关的论文，不要凑数！`;

      const raw = await callAI(prompt);
      
      try {
        const jsonMatch = raw.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ 
            papers: parsed.filtered || [],
            raw: raw
          });
        }
      } catch (e) { 
        console.error('Filter parse error:', e, 'Raw:', raw);
      }
      
      return NextResponse.json({ papers: papers.slice(0, 10), raw });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({ error: error.message || '服务器错误，请稍后重试' }, { status: 500 });
  }
}
