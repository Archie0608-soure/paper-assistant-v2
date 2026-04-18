import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/apiAuth';

// SiliconFlow API (兼容 OpenAI 格式)
const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const API_KEY = process.env.SILICONFLOW_API_KEY || '';

interface ChapterCandidate {
  index: number;
  title: string;
  content: string;
  isHeading: boolean;
  isReference: boolean;
  isSkip: boolean;
}

interface ClassifyRequest {
  chapters: ChapterCandidate[];
  language: 'chinese' | 'english' | 'mixed';
}

interface ClassifyResult {
  index: number;
  type: 'content' | 'heading' | 'reference' | 'toc' | 'skip';
  reason?: string;
}

export async function POST(req: NextRequest) {
  const check = verifySession(req);
  if (!check.ok) return check.response;
  try {
    const { chapters, language } = await req.json() as ClassifyRequest;

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 构建提示词
    const langLabel = language === 'chinese' ? '中文' : language === 'english' ? '英文' : '中英混合';
    const chapterList = chapters.map((c, i) =>
      `[${i}] ${c.isHeading ? '【标题】' : ''}${c.isReference ? '【引用】' : ''}${c.isSkip ? '【跳过】' : ''}\n标题: ${c.title}\n内容: ${c.content.slice(0, 100)}${c.content.length > 100 ? '...' : ''}`
    ).join('\n\n');

    const prompt = `你是一个学术论文结构分析专家。给定一篇${langLabel}学术论文的章节列表，请判断每个章节是否属于"正文内容"。

判断标准：
- **content（正文内容）**: 论文的主要论述段落，包含具体观点、数据、案例分析、论证过程等
- **heading（章节标题）**: 仅作为章节分隔符的标题，没有实质性内容（如 "IV. Group Reflection"、"1. Introduction"）
- **reference（参考文献）**: 参考文献列表中的条目，通常以 [1]、Smith, J. 等格式开头
- **toc（目录）**: 目录/大纲条目，通常只有标题没有正文
- **skip（应跳过）**: 摘要、关键词、图表目录、缩略词表、作者信息等元数据段落

重要：
- 如果一个章节标题但后面跟着具体内容（≥50字），可能是正文而非纯标题
- 参考文献列表中的条目（如 [1] Chen, L. (2020)...）应标记为 reference
- 只有纯粹的章节分隔符（标题后面没有实质内容）才标记为 heading

请按以下JSON格式输出（只输出JSON，不要其他内容）：
{
  "results": [
    {"index": 0, "type": "content", "reason": "包含具体的案例分析和数据"},
    {"index": 1, "type": "heading", "reason": "仅为章节标题无实质内容"},
    ...
  ]
}

章节列表：
${chapterList}`;

    if (!API_KEY) {
      // 无 API Key 时返回空（不做过滤）
      return NextResponse.json({ results: [], error: 'no_api_key' });
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('SiliconFlow error:', err);
      return NextResponse.json({ results: [], error: 'api_error' }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 JSON 响应
    try {
      // 尝试从 markdown 代码块中提取
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json({ results: parsed.results || [] });
    } catch (e) {
      console.error('Failed to parse model response:', content.slice(0, 200));
      return NextResponse.json({ results: [], error: 'parse_error' });
    }

  } catch (e: any) {
    console.error('classify-chapters error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
