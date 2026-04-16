import { NextRequest, NextResponse } from 'next/server';
import pptxgen from 'pptxgenjs';
import fs from 'fs';
import path from 'path';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-deb255ccb90b4381baf2d84398480cc1';

async function callDeepSeek(prompt: string): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

function parseChapters(raw: string, pages: number): Array<{ title: string; content: string }> {
  const chapters: Array<{ title: string; content: string }> = [];
  // 尝试按行解析
  const lines = raw.split('\n').filter(l => l.trim());
  let current: { title: string; content: string } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 章节标题行（数字开头或标题格式）
    if (/^第[一二三四五六七八九十\d]+章/.test(trimmed) || /^\d+[\.、]/.test(trimmed) || (trimmed.length < 30 && trimmed.length > 2 && !trimmed.endsWith('。') && !trimmed.endsWith('：'))) {
      if (current) chapters.push(current);
      current = { title: trimmed.replace(/^[\d\.、\s]+/, '').substring(0, 50), content: '' };
    } else if (current) {
      current.content += trimmed + '\n';
    }
  }
  if (current) chapters.push(current);
  // 如果解析失败，用默认章节
  if (chapters.length === 0) {
    const defaultTitles = ['摘要', '研究背景', '研究方法', '结果分析', '结论与展望', '参考文献'];
    for (let i = 0; i < Math.min(pages - 2, 6); i++) {
      chapters.push({ title: defaultTitles[i] || `第${i + 1}节`, content: '' });
    }
  }
  return chapters.slice(0, pages - 2);
}

export async function POST(req: NextRequest) {
  try {
    const { title, name, school, keywords, pages = 10, customChapters } = await req.json();

    if (!title) return NextResponse.json({ error: '缺少论文标题' }, { status: 400 });

    const pagesNum = Number(pages);
    const nameStr = name || '张三';
    const schoolStr = school || '某某大学';
    const keywordsStr = keywords || '';

    // 构建AI提示词
    const outlinePrompt = `你是一位资深的学术答辩PPT制作专家。请为以下论文生成答辩PPT的大纲和内容。

论文标题：${title}
姓名：${nameStr}
学校：${schoolStr}
关键词：${keywordsStr}
PPT总页数：${pagesNum}页

要求：
1. 第1页：封面（标题、姓名、学校、专业、日期）
2. 最后一页：致谢
3. 中间 ${pagesNum - 2} 页为正文内容
4. 每个章节给出100-200字的内容摘要
5. 内容要学术、专业、简洁
6. 只输出大纲和章节内容，不要解释

请用以下JSON格式输出（只输出JSON，不要其他内容）：
{
  "chapters": [
    {"title": "章节标题", "content": "章节内容摘要100-200字"}
  ]
}`;

    let outlineData: any = { chapters: [] };
    try {
      const raw = await callDeepSeek(outlinePrompt);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) outlineData = JSON.parse(match[0]);
    } catch {
      // AI调用失败，使用默认章节
    }

    let chapters = outlineData.chapters || [];
    if (customChapters && customChapters.length > 0) {
      chapters = customChapters.filter((c: any) => c.title.trim());
    }
    chapters = parseChapters(chapters.length > 0 ? JSON.stringify(chapters) : '', pagesNum);

    // 生成 PPTX
    const pptx = new pptxgen();
    pptx.title = title;
    pptx.author = nameStr;
    pptx.subject = schoolStr;

    // ===== 第1页：封面 =====
    const slide1 = pptx.addSlide();
    slide1.background = { color: '1a365d' };
    slide1.addText(title, {
      x: 0.5, y: 1.8, w: 9, h: 1.2,
      fontSize: 28, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle',
    });
    slide1.addText(`${schoolStr}  毕业论文答辩`, {
      x: 0.5, y: 3.1, w: 9, h: 0.5,
      fontSize: 16, color: 'CBD5E0', align: 'center',
    });
    slide1.addText(`${nameStr}  同学`, {
      x: 0.5, y: 3.8, w: 9, h: 0.5,
      fontSize: 16, color: 'CBD5E0', align: 'center',
    });
    const today = new Date().toLocaleDateString('zh-CN');
    slide1.addText(today, {
      x: 0.5, y: 4.5, w: 9, h: 0.4,
      fontSize: 14, color: 'A0AEC0', align: 'center',
    });
    if (keywordsStr) {
      slide1.addText(`关键词：${keywordsStr}`, {
        x: 0.5, y: 5.0, w: 9, h: 0.4,
        fontSize: 12, color: '718096', align: 'center',
      });
    }

    // ===== 目录页（第2页） =====
    if (pagesNum > 2) {
      const tocSlide = pptx.addSlide();
      tocSlide.background = { color: 'F7FAFC' };
      tocSlide.addText('目  录', {
        x: 0.5, y: 0.4, w: 9, h: 0.8,
        fontSize: 28, bold: true, color: '1a365d', align: 'center',
      });
      tocSlide.addShape("rect", {
        x: 4.2, y: 1.1, w: 1.6, h: 0.04,
        fill: { color: '2B6CB0' },
      });
      chapters.forEach((ch: any, i: number) => {
        tocSlide.addText(`${i + 1}. ${ch.title}`, {
          x: 1.5, y: 1.5 + i * 0.55, w: 7, h: 0.5,
          fontSize: 16, color: '2D3748',
        });
      });
    }

    // ===== 正文章节页 =====
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      // 章节标题页（每章第一页）
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: '2B6CB0' };
      titleSlide.addText(`第${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][i % 10] || (i + 1)}章`, {
        x: 0.5, y: 1.8, w: 9, h: 0.6,
        fontSize: 16, color: 'BEE3F8', align: 'center',
      });
      titleSlide.addText(ch.title || `章节${i + 1}`, {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 28, bold: true, color: 'FFFFFF', align: 'center',
      });
      titleSlide.addShape("rect", {
        x: 4.2, y: 3.6, w: 1.6, h: 0.04,
        fill: { color: '90CDF4' },
      });

      // 内容页
      if (ch.content) {
        const contentSlide = pptx.addSlide();
        contentSlide.background = { color: 'FFFFFF' };
        contentSlide.addText(ch.title || `第${i + 1}章`, {
          x: 0.5, y: 0.3, w: 9, h: 0.6,
          fontSize: 18, bold: true, color: '1a365d',
        });
        contentSlide.addShape("rect", {
          x: 0.5, y: 0.85, w: 1.2, h: 0.03,
          fill: { color: '2B6CB0' },
        });
        contentSlide.addText(ch.content, {
          x: 0.5, y: 1.1, w: 9, h: 4.2,
          fontSize: 14, color: '2D3748', align: 'left',
          valign: 'top', lineSpacingMultiple: 1.5,
        });
      }
    }

    // ===== 最后一页：致谢 =====
    const thanksSlide = pptx.addSlide();
    thanksSlide.background = { color: '1a365d' };
    thanksSlide.addText('感谢聆听', {
      x: 0.5, y: 2.0, w: 9, h: 1,
      fontSize: 36, bold: true, color: 'FFFFFF', align: 'center',
    });
    thanksSlide.addText('敬请各位老师批评指正', {
      x: 0.5, y: 3.2, w: 9, h: 0.6,
      fontSize: 18, color: 'CBD5E0', align: 'center',
    });
    thanksSlide.addText(`${nameStr}  感谢`, {
      x: 0.5, y: 4.2, w: 9, h: 0.5,
      fontSize: 16, color: '90CDF4', align: 'center',
    });

    // 保存文件
    const fileName = `答辩PPT_${title.substring(0, 10).replace(/[\/\\:*?"<>|]/g, '_')}_${Date.now()}.pptx`;
    const outputPath = path.join(process.cwd(), 'public', 'downloads', fileName);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buffer = await (pptx as any).writeFile({ fileName: outputPath });
    const fileUrl = `/downloads/${fileName}`;

    return NextResponse.json({ url: fileUrl, title });
  } catch (error: any) {
    console.error('PPT生成失败:', error);
    return NextResponse.json({ error: error.message || '生成失败' }, { status: 500 });
  }
}
