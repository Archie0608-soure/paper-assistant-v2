import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '没有文件' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    let text = '';

    if (ext === 'txt') {
      text = await file.text();
    } else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === 'pdf') {
      return NextResponse.json({ error: 'PDF文件请直接粘贴文本到检测框，系统会自动解析' }, { status: 400 });
    } else {
      return NextResponse.json({ error: '只支持 TXT、DOCX 格式' }, { status: 400 });
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text.trim()) return NextResponse.json({ error: '文件内容为空' }, { status: 400 });
    if (text.length < 50) return NextResponse.json({ error: '文件内容太少，至少50个字' }, { status: 400 });

    return NextResponse.json({ text, name: file.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '解析失败' }, { status: 500 });
  }
}
