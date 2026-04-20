import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('file');

    if (!filePath) return NextResponse.json({ error: '缺少文件路径' }, { status: 400 });

    // 安全检查：只允许 templates 目录下的文件
    const fullPath = path.join('/home/ubuntu/paper-assistant-v2', 'public', filePath);
    if (!fullPath.includes('templates') || !fs.existsSync(fullPath)) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const buffer = fs.readFileSync(fullPath);
    const zip = await JSZip.loadAsync(buffer);

    // 读取第一张幻灯片
    const slide1Entries = zip.file(/^ppt\/slides\/slide1\.xml$/);
    const slide1Entry = slide1Entries ? slide1Entries[0] : null;
    if (!slide1Entry) {
      return NextResponse.json({ error: '未找到幻灯片' }, { status: 404 });
    }

    const slide1Xml = await slide1Entry.async('string');

    // 提取标题（<a:t>标签中的文本）
    const titleMatches = slide1Xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    const allText: string[] = [];
    for (const m of titleMatches) {
      const t = m.replace(/<[^>]+>/g, '');
      if (t.trim()) allText.push(t.trim());
    }

    // 提取主色调（从 srgbClr val 属性）
    const colorMatches = slide1Xml.match(/srgbClr[^>]*val="([0-9A-Fa-f]{6})"/g) || [];
    const colors: string[] = [];
    const seen = new Set<string>();
    for (const m of colorMatches) {
      const c = m.match(/val="([0-9A-Fa-f]{6})"/)?.[1];
      if (c && !seen.has(c) && c !== '000000' && c !== 'FFFFFF') {
        seen.add(c);
        colors.push(c);
      }
    }

    // 提取背景色
    let bgColor = 'FFFFFF';
    const bgMatch = slide1Xml.match(/solidFill[^>]*>[^<]*<srgbClr[^>]*val="([0-9A-Fa-f]{6})"/);
    if (bgMatch) bgColor = bgMatch[1];

    // 提取加粗文本（通常是标题）
    const boldMatches = slide1Xml.match(/<a:defRPr[^>]*b="1"[^>]*>[^<]*<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    const boldText: string[] = [];
    for (const m of boldMatches) {
      const t = m.match(/<a:t[^>]*>([^<]*)<\/a:t>/)?.[1];
      if (t?.trim()) boldText.push(t.trim());
    }

    return NextResponse.json({
      texts: allText.slice(0, 20),
      boldText: boldText.slice(0, 5),
      colors: colors.slice(0, 6),
      bgColor,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
