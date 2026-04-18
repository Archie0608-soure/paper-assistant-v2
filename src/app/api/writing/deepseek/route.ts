import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
  const check = verifySession(req);
  if (!check.ok) return check.response;
  try {
    const { content, action } = await req.json();

    if (!content) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 });
    }

    const apiKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'DeepSeek API未配置' }, { status: 500 });
    }
    const usingSiliconFlow = !!process.env.SILICONFLOW_API_KEY;
    const apiUrl = usingSiliconFlow
      ? 'https://api.siliconflow.cn/v1/chat/completions'
      : 'https://api.deepseek.com/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: usingSiliconFlow ? 'deepseek-ai/DeepSeek-V3.2' : 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的论文写作助手，负责帮助用户创作论文内容。请根据用户提供的开头或主题，续写或创作连贯、专业、学术风格的论文内容。保持相同的写作风格和语气。',
          },
          {
            role: 'user',
            content: `请续写以下论文内容：\n\n${content}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('DeepSeek API error:', error);
      return NextResponse.json({ error: 'AI生成失败' }, { status: 500 });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || '';

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('DeepSeek route error:', error);
    return NextResponse.json({ error: error.message || '生成失败' }, { status: 500 });
  }
}
