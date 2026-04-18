import { NextRequest, NextResponse } from 'next/server';
import pptxgen from 'pptxgenjs';
import fs from 'fs';
import path from 'path';
import { verifySession } from '@/lib/apiAuth';

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
  const lines = raw.split('\n').filter(l => l.trim());
  let current: { title: string; content: string } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[\d一二三四五六七八九十]+[.、：:]/.test(trimmed) || /^(摘要|第|章节|目录|引言|结论|参考文献|致谢)/.test(trimmed)) {
      if (current) chapters.push(current);
      const titleMatch = trimmed.match(/^[^。，,！!？?]+/);
      current = { title: titleMatch ? titleMatch[0] : trimmed, content: '' };
    } else if (current) {
      current.content += (current.content ? ' ' : '') + trimmed;
    }
  }
  if (current) chapters.push(current);
  if (chapters.length === 0) {
    const defaults = ['研究背景', '研究意义', '研究方法', '研究结果', '讨论与分析', '结论与展望'];
    for (let i = 0; i < Math.min(pages - 2, 6); i++) {
      chapters.push({ title: defaults[i] || `第${i+1}节`, content: '本章内容请根据论文实际情况补充详细论述。' });
    }
  }
  return chapters.slice(0, pages - 2);
}

// Color palettes for different chapter types
    const PALETTES = {
  cover: { bg: '1a1a2e', accent: 'e94560', text: 'FFFFFF', subtext: 'a0a0b0' },
  toc: { bg: 'f8f9fc', accent: '4361ee', text: '1a1a2e', subtext: '6b6b7b' },
  chapter: [{ bg: '0f3460', accent: 'e94560', text: 'FFFFFF', subtext: 'a0b4d4' },
              { bg: '1a1a2e', accent: '4cc9f0', text: 'FFFFFF', subtext: 'a0a0c0' },
              { bg: '2d3436', accent: 'fdcb6e', text: 'FFFFFF', subtext: 'd0d4d8' },
              { bg: '006266', accent: '1dd1a1', text: 'FFFFFF', subtext: 'a0e8d8' }],
  content: { bg: 'FFFFFF', accent: '4361ee', text: '1a1a2e', subtext: '6b6b7b', highlight: 'f0f4ff' },
  thanks: { bg: '1a1a2e', accent: 'e94560', text: 'FFFFFF', subtext: 'a0a0b0' },
};

function addDecoration(slide: any, palette: any, type: string) {
  if (type === 'cover' || type === 'thanks') {
    // Top accent bar
    slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.08, fill: { color: palette.accent } });
    // Bottom accent bar
    slide.addShape("rect", { x: 0, y: 5.545, w: 10, h: 0.08, fill: { color: palette.accent } });
    // Left decorative line
    slide.addShape("rect", { x: 0.4, y: 1.5, w: 0.04, h: 2.5, fill: { color: palette.accent } });
    // Corner dot
    slide.addShape("ellipse", { x: 9.2, y: 0.3, w: 0.5, h: 0.5, fill: { color: palette.accent, transparency: 70 } });
    slide.addShape("ellipse", { x: 9.4, y: 0.5, w: 0.3, h: 0.3, fill: { color: palette.accent } });
  } else if (type === 'toc') {
    // Top bar
    slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.06, fill: { color: palette.accent } });
    // Side decorative element
    slide.addShape("rect", { x: 0, y: 0.5, w: 0.15, h: 4.5, fill: { color: palette.accent, transparency: 85 } });
  } else if (type === 'content') {
    // Header bar
    slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.7, fill: { color: palette.accent } });
    // Footer line
    slide.addShape("rect", { x: 0.5, y: 5.3, w: 9, h: 0.02, fill: { color: palette.accent, transparency: 50 } });
    // Page number circle
    slide.addShape("ellipse", { x: 9.2, y: 5.1, w: 0.35, h: 0.35, fill: { color: palette.accent } });
  } else if (type === 'chapter') {
    // Top left accent
    slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.06, fill: { color: palette.accent } });
    // Bottom accent line
    slide.addShape("rect", { x: 0, y: 5.54, w: 10, h: 0.06, fill: { color: palette.accent } });
    // Center left decorative line
    slide.addShape("rect", { x: 0.5, y: 1.8, w: 0.05, h: 2, fill: { color: palette.accent } });
  }
}

function addBulletPoints(slide: any, content: string, x: number, y: number, w: number, h: number, color: string) {
  const paragraphs = content.split(/[。；!?！]/).filter(p => p.trim().length > 5);
  const items = paragraphs.slice(0, 5);
  const startY = y;
  const lineH = Math.min(h / Math.max(items.length, 1), 0.7);

  items.forEach((item, i) => {
    const bulletY = startY + i * lineH;
    // Bullet dot
    slide.addShape("ellipse", { x: x, y: bulletY + 0.12, w: 0.12, h: 0.12, fill: { color: color } });
    // Bullet text
    slide.addText(item.trim() + (item.endsWith('。') || item.endsWith('！') || item.endsWith('？') ? '' : '。'), {
      x: x + 0.25, y: bulletY, w: w - 0.25, h: lineH,
      fontSize: 13, color: '2d3436', valign: 'top',
      lineSpacingMultiple: 1.3,
    });
  });
}

export async function POST(req: NextRequest) {
  const check = verifySession(req);
  if (!check.ok) return check.response;
  try {
    const { title, name, school, keywords, pages = 10, customChapters, templateId } = await req.json();
    if (!title) return NextResponse.json({ error: '缺少论文标题' }, { status: 400 });

    const pagesNum = Number(pages);
    let templateColors: any = null;
    if (templateId) {
      try {
        const tmplStore = path.join(process.cwd(), 'data', 'templates.json');
        if (fs.existsSync(tmplStore)) {
          const all = JSON.parse(fs.readFileSync(tmplStore, 'utf8'));
          const tpl = all.find((t: any) => t.id === templateId);
          if (tpl) templateColors = tpl.colors;
        }
      } catch {}
    }
    const PALETTE_OVERRIDE: any = templateColors ? {
      bg: templateColors.bg || 'FFFFFF',
      primary: templateColors.primary || '2B6CB0',
      secondary: templateColors.secondary || '1a365d',
      accent: templateColors.accent || 'e94560',
      text: 'FFFFFF',
      subtext: 'd0d4e0',
    } : null;
    const nameStr = name || '张三';
    const schoolStr = school || '某某大学';
    const keywordsStr = keywords || '';
    const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

    const outlinePrompt = `你是一位资深的学术答辩PPT制作专家。请为以下论文生成详细的PPT内容。

论文标题：${title}
姓名：${nameStr}
学校：${schoolStr}
关键词：${keywordsStr}
PPT总页数：${pagesNum}页

要求：
1. 第1页：封面（标题、姓名、学校、日期）
2. 第2页：目录
3. 中间 ${pagesNum - 3} 页为正文，每章一页（标题+内容）
4. 最后一页：致谢
5. 每个章节给出150-200字的详细学术内容摘要，内容要专业、充实、有深度
6. 内容要分成2-4个要点，每个要点有具体论述
7. 只输出JSON，不要其他内容

请用以下JSON格式输出：
{
  "chapters": [
    {"title": "章节标题", "content": "150-200字的详细学术内容摘要，分段说明要点"}
  ]
}`;

    let outlineData: any = { chapters: [] };
    try {
      const raw = await callDeepSeek(outlinePrompt);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) outlineData = JSON.parse(match[0]);
    } catch { /* AI调用失败，使用默认章节 */ }

    let chapters = outlineData.chapters || [];
    if (customChapters && customChapters.length > 0) {
      chapters = customChapters.filter((c: any) => c.title.trim());
    }
    if (chapters.length === 0) {
      chapters = parseChapters('', pagesNum);
    } else {
      for (let i = 0; i < chapters.length; i++) {
        if (!chapters[i].content || !chapters[i].content.trim()) {
          try {
            const contentPrompt = '为章节「' + chapters[i].title + '」生成150-200字学术摘要' + (keywordsStr ? '（关键词：' + keywordsStr + '）' : '');
            chapters[i].content = await callDeepSeek(contentPrompt);
          } catch {
            chapters[i].content = '本章内容请根据论文实际情况补充详细论述。';
          }
        }
      }
    }

    const pptx = new pptxgen();
    pptx.title = title;
    pptx.author = nameStr;
    pptx.subject = schoolStr;

    // ===== 第1页：封面 =====
    {
      const sl = pptx.addSlide();
      const pal = PALETTE_OVERRIDE || PALETTES.cover;
      sl.background = { color: pal.bg };
      addDecoration(sl, pal, 'cover');
      // 标题
      sl.addText(title, {
        x: 0.7, y: 1.6, w: 8.6, h: 1.4,
        fontSize: 32, bold: true, color: pal.text, align: 'left', valign: 'middle',
        lineSpacingMultiple: 1.2,
      });
      // 分隔线
      sl.addShape("rect", { x: 0.7, y: 3.1, w: 2, h: 0.04, fill: { color: pal.accent } });
      // 学校信息
      sl.addText(schoolStr, { x: 0.7, y: 3.3, w: 8, h: 0.5, fontSize: 16, color: pal.subtext, align: 'left' });
      sl.addText('毕业论文答辩', { x: 0.7, y: 3.75, w: 8, h: 0.4, fontSize: 14, color: pal.subtext, align: 'left' });
      // 姓名和日期
      sl.addText(nameStr + '  同学', { x: 0.7, y: 4.4, w: 5, h: 0.4, fontSize: 14, color: pal.subtext, align: 'left' });
      sl.addText(today, { x: 6, y: 4.4, w: 3, h: 0.4, fontSize: 13, color: pal.subtext, align: 'right' });
      // 关键词
      if (keywordsStr) {
        sl.addText('关键词：' + keywordsStr, { x: 0.7, y: 4.95, w: 8, h: 0.35, fontSize: 11, color: pal.accent, align: 'left' });
      }
    }

    // ===== 第2页：目录 =====
    {
      const sl = pptx.addSlide();
      const pal = PALETTES.toc;
      sl.background = { color: pal.bg };
      addDecoration(sl, pal, 'toc');
      sl.addText('目  录', { x: 0.5, y: 0.3, w: 9, h: 0.9, fontSize: 32, bold: true, color: pal.text, align: 'center' });
      sl.addShape("rect", { x: 4.2, y: 1.1, w: 1.6, h: 0.04, fill: { color: pal.accent } });
      const startY = 1.4;
      const availableH = 5.2 - startY;
      const itemH = Math.min(availableH / chapters.length, 0.55);
      chapters.forEach((ch: any, i: number) => {
        const y = startY + i * itemH;
        // Number circle
        sl.addShape("ellipse", { x: 1.2, y: y + 0.08, w: 0.35, h: 0.35, fill: { color: pal.accent } });
        sl.addText(String(i + 1), { x: 1.2, y: y + 0.08, w: 0.35, h: 0.35, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
        // Title
        sl.addText(ch.title || `第${i+1}章`, { x: 1.7, y: y, w: 6.5, h: 0.5, fontSize: 15, color: pal.text, valign: 'middle' });
        // Dotted line
        sl.addShape("rect", { x: 1.7, y: y + 0.48, w: 7.5, h: 0.01, fill: { color: 'e0e0e0' } });
      });
    }

    // ===== 正文章节页 =====
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const pal = PALETTES.chapter[i % PALETTES.chapter.length];
      const isLongContent = ch.content && ch.content.length > 100;

      if (isLongContent) {
        // 分两页：标题页 + 内容页
        // --- 标题页 ---
        const titleSl = pptx.addSlide();
        titleSl.background = { color: pal.bg };
        addDecoration(titleSl, pal, 'chapter');
        const chapterNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][i % 10] || String(i + 1);
        titleSl.addText(`第${chapterNum}章`, { x: 0.5, y: 1.5, w: 9, h: 0.6, fontSize: 16, color: pal.subtext, align: 'center' });
        titleSl.addText(ch.title || `第${i+1}章`, { x: 0.5, y: 2.2, w: 9, h: 1.2, fontSize: 30, bold: true, color: pal.text, align: 'center', valign: 'middle' });
        titleSl.addShape("rect", { x: 4, y: 3.5, w: 2, h: 0.04, fill: { color: pal.accent } });

        // --- 内容页 ---
        const contentSl = pptx.addSlide();
        const cpal = PALETTES.content;
        contentSl.background = { color: cpal.bg };
        addDecoration(contentSl, cpal, 'content');
        // Header bar title
        contentSl.addText(ch.title || `第${i+1}章`, {
          x: 0.4, y: 0.12, w: 8, h: 0.5,
          fontSize: 16, bold: true, color: 'FFFFFF', valign: 'middle',
        });
        // Chapter number
        contentSl.addText(String(i + 1), {
          x: 8.8, y: 0.12, w: 0.8, h: 0.5,
          fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
        });
        // Accent bar left
        contentSl.addShape("rect", { x: 0.4, y: 0.85, w: 0.06, h: 3.8, fill: { color: cpal.accent } });
        // Bullet points
        addBulletPoints(contentSl, ch.content, 0.6, 0.9, 8.8, 3.8, cpal.accent);
        // Page number
        contentSl.addText(String(i + 3), {
          x: 9.2, y: 5.1, w: 0.35, h: 0.35,
          fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
        });
      } else {
        // 单页：标题+内容合并
        const sl = pptx.addSlide();
        sl.background = { color: pal.bg };
        addDecoration(sl, pal, 'chapter');
        const chapterNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][i % 10] || String(i + 1);
        sl.addText(`第${chapterNum}章`, { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 14, color: pal.subtext, align: 'center' });
        sl.addText(ch.title || `第${i+1}章`, { x: 0.5, y: 1.75, w: 9, h: 0.9, fontSize: 26, bold: true, color: pal.text, align: 'center', valign: 'middle' });
        sl.addShape("rect", { x: 3.5, y: 2.75, w: 3, h: 0.04, fill: { color: pal.accent } });
        sl.addText(ch.content || '内容待补充', {
          x: 0.8, y: 3.0, w: 8.4, h: 2.2,
          fontSize: 14, color: pal.subtext, align: 'center', valign: 'top', lineSpacingMultiple: 1.5,
        });
      }
    }

    // ===== 最后一页：致谢 =====
    {
      const sl = pptx.addSlide();
      const pal = PALETTE_OVERRIDE || PALETTES.thanks;
      sl.background = { color: pal.bg };
      addDecoration(sl, pal, 'thanks');
      sl.addText('感谢聆听', { x: 0.5, y: 1.8, w: 9, h: 1.2, fontSize: 44, bold: true, color: pal.text, align: 'center', valign: 'middle' });
      sl.addShape("rect", { x: 3.5, y: 3.1, w: 3, h: 0.04, fill: { color: pal.accent } });
      sl.addText('敬请各位老师批评指正', { x: 0.5, y: 3.3, w: 9, h: 0.6, fontSize: 18, color: pal.subtext, align: 'center' });
      sl.addText(nameStr + '  感谢', { x: 0.5, y: 4.1, w: 9, h: 0.5, fontSize: 14, color: pal.accent, align: 'center' });
      sl.addText(today, { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 12, color: pal.subtext, align: 'center' });
    }

    const fileName = `答辩PPT_${title.substring(0, 10).replace(/[\/\\:*?"<>|]/g, '_')}_${Date.now()}.pptx`;
    const outputPath = path.join(process.cwd(), 'public', 'downloads', fileName);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await (pptx as any).writeFile({ fileName: outputPath });
    const fileUrl = `/downloads/${fileName}`;
    return NextResponse.json({ url: fileUrl, title });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '生成失败' }, { status: 500 });
  }
}
