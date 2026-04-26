import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
// @ts-ignore
const pdfParse = require('pdf-parse');

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '没有文件' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    let text = '';

    if (ext === 'txt') {
      text = await file.text();
    } else if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json({ error: '只支持 TXT、PDF、DOCX 格式' }, { status: 400 });
    }

    // 清理空白字符
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!text.trim()) return NextResponse.json({ error: '文件内容为空' }, { status: 400 });
    if (text.length < 50) return NextResponse.json({ error: '文件内容太少，至少50个字' }, { status: 400 });

    return NextResponse.json({ text, name: file.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '解析失败' }, { status: 500 });
  }
}
