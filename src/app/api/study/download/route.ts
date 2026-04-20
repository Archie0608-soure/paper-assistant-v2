import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

function verifySession(req: NextRequest): boolean {
  const session = req.cookies.get('pa_session');
  return !!session?.value;
}

interface ParsedBlock {
  type: 'heading' | 'paragraph' | 'list';
  level?: number; // 1-6 for headings
  text: string;
  bold?: boolean;
  items?: string[]; // for list
}

// 简单 markdown 解析
function parseMarkdown(text: string): ParsedBlock[] {
  const lines = text.split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 跳过空行
    if (!line.trim()) { i++; continue; }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].replace(/\*\*/g, '').trim(),
      });
      i++; continue;
    }

    // 无序列表
    const listMatch = line.match(/^[-*]\s+(.+)/);
    if (listMatch) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(lines[i].replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim());
        i++;
      }
      blocks.push({ type: 'list', text: '', items });
      continue;
    }

    // 段落（收集连续非空非列表行）
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^[-*]\s/)
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ').replace(/\*\*/g, '').trim() });
    }
  }

  return blocks;
}

// markdown 文本片段解析（处理粗体）
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }
  if (runs.length === 0) runs.push(new TextRun({ text }));
  return runs;
}

function blocksToDocx(blocks: ParsedBlock[], courseName: string): Document {
  const children: Paragraph[] = [];

  // 封面标题
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: courseName || '复习资料',
          size: 56,
          bold: true,
          color: '1e3a5f',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      shading: { type: 'horzStripe', color: 'auto' },
      children: [
        new TextRun({
          text: '复习大纲',
          size: 32,
          color: '4a6fa5',
          italics: true,
        }),
      ],
    })
  );

  children.push(new Paragraph({ children: [] })); // 空行

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = Math.min(block.level || 1, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const sizes: Record<number, number> = { 1: 48, 2: 40, 3: 36, 4: 32, 5: 28, 6: 24 };
      const colors: Record<number, string> = { 1: '1e3a5f', 2: '2c5282', 3: '2b6cb0', 4: '3182ce', 5: '4299e1', 6: '63b3ed' };

      children.push(
        new Paragraph({
          spacing: { before: level === 1 ? 400 : 240, after: 120 },
          children: [
            new TextRun({
              text: block.text,
              style: `Heading${level}` as any,
              size: sizes[level] || 32,
              bold: true,
              color: colors[level] || '1e3a5f',
            }),
          ],
        })
      );
    } else if (block.type === 'paragraph') {
      if (!block.text) continue;
      children.push(
        new Paragraph({
          spacing: { after: 160, line: 360, lineRule: 'auto' },
          alignment: AlignmentType.JUSTIFIED,
          children: parseInline(block.text),
        })
      );
    } else if (block.type === 'list' && block.items) {
      for (const item of block.items) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: '•  ', color: '4a6fa5' }),
              ...parseInline(item),
            ],
          })
        );
      }
    }
  }

  // 页脚
  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [
        new TextRun({
          text: '— 由论文助手生成 —',
          size: 18,
          color: 'a0aec0',
          italics: true,
        }),
      ],
    })
  );

  return new Document({
    sections: [{ children }],
    styles: {
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', run: { size: 48, bold: true, color: '1e3a5f' }, paragraph: { spacing: { before: 400, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', run: { size: 40, bold: true, color: '2c5282' }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: 'Heading3', name: 'Heading 3', run: { size: 36, bold: true, color: '2b6cb0' }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: 'Heading4', name: 'Heading 4', run: { size: 32, bold: true, color: '3182ce' }, paragraph: { spacing: { before: 240, after: 120 } } },
      ],
    },
  });
}

export async function POST(req: NextRequest) {
  if (!verifySession(req)) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { text, courseName } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 });
    }

    const blocks = parseMarkdown(text);
    const doc = blocksToDocx(blocks, courseName);
    const buffer = await Packer.toBuffer(doc);

    const safeName = (courseName || '复习资料').replace(/[|/\\:*?"<>]/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(safeName + '_复习大纲.docx'),
      },
    });
  } catch (err: any) {
    console.error('[/api/study/download]', err.message);
    return NextResponse.json({ error: err.message || '生成文档失败' }, { status: 500 });
  }
}
