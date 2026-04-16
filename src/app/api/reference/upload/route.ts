import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

function parseUserFromSession(session: { value: string } | undefined): { type: string; destination: string } | null {
  if (!session?.value) return null;
  try {
    const raw = Buffer.from(session.value, 'base64url').toString();
    const lastColon = raw.lastIndexOf(':');
    const beforeLast = raw.slice(0, lastColon);
    const secondColon = beforeLast.indexOf(':');
    return {
      type: raw.split(':')[0],
      destination: beforeLast.slice(secondColon + 1),
    };
  } catch { return null; }
}

async function parseFileContent(buffer: Buffer, ext: string): Promise<string> {
  if (ext === 'txt' || ext === 'md') {
    return buffer.toString('utf-8');
  }
  if (ext === 'pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    } catch { throw new Error('PDF解析失败'); }
  }
  if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch { throw new Error('Word文档解析失败'); }
  }
  throw new Error('不支持的文件格式，仅支持 PDF、Word、TXT');
}

// GET: 列出用户上传的参考文献
export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    const user = parseUserFromSession(session);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const supabase = getSupabase();
    const field = user.type === 'email' ? 'email' : 'phone';
    const { data: dbUser } = await supabase.from('users').select('id').eq(field, user.destination).limit(1).maybeSingle();
    if (!dbUser) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const { data: docs, error } = await supabase
      .from('reference_docs')
      .select('id, filename, file_type, content_length, created_at')
      .eq('user_id', dbUser.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ docs: docs || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '查询失败' }, { status: 500 });
  }
}

// DELETE: 删除参考文献
export async function DELETE(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    const user = parseUserFromSession(session);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('id');
    if (!docId) return NextResponse.json({ error: '缺少文档ID' }, { status: 400 });

    const supabase = getSupabase();
    const field = user.type === 'email' ? 'email' : 'phone';
    const { data: dbUser } = await supabase.from('users').select('id').eq(field, user.destination).limit(1).maybeSingle();
    if (!dbUser) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const { error } = await supabase.from('reference_docs').delete().eq('id', docId).eq('user_id', dbUser.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '删除失败' }, { status: 500 });
  }
}

// POST: 上传参考文献
export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    const user = parseUserFromSession(session);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const supabase = getSupabase();
    const field = user.type === 'email' ? 'email' : 'phone';
    const { data: dbUser } = await supabase.from('users').select('id').eq(field, user.destination).limit(1).maybeSingle();
    if (!dbUser) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: '请使用multipart/form-data上传' }, { status: 400 });
    }

    const formData = await req.formData();
    const files: File[] = [];
    for (const f of formData.getAll('files')) {
      if (f instanceof File) files.push(f);
    }

    if (files.length === 0) return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: '最多上传10个文件' }, { status: 400 });

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB per file
    const MAX_TOTAL = 20 * 1024 * 1024; // 20MB total
    let totalSize = 0;
    for (const f of files) totalSize += f.size;
    if (totalSize > MAX_TOTAL) return NextResponse.json({ error: '总文件大小不能超过20MB' }, { status: 400 });

    const results: { filename: string; id: string; status: 'ok' | 'fail'; error?: string }[] = [];

    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
        results.push({ filename: f.name, id: '', status: 'fail', error: '不支持的格式' });
        continue;
      }
      if (f.size > MAX_SIZE) {
        results.push({ filename: f.name, id: '', status: 'fail', error: '文件超过5MB限制' });
        continue;
      }

      try {
        const buffer = Buffer.from(await f.arrayBuffer());
        let content: string;
        try {
          content = await parseFileContent(buffer, ext);
        } catch (e: any) {
          results.push({ filename: f.name, id: '', status: 'fail', error: e.message });
          continue;
        }

        if (content.trim().length < 50) {
          results.push({ filename: f.name, id: '', status: 'fail', error: '文件内容过少' });
          continue;
        }

        const { data, error } = await supabase
          .from('reference_docs')
          .insert({
            user_id: dbUser.id,
            filename: f.name,
            file_type: ext,
            content: content.slice(0, 200000), // 限制20万字
            content_length: content.length,
          })
          .select('id')
          .maybeSingle();

        if (error || !data) {
          results.push({ filename: f.name, id: '', status: 'fail', error: '存储失败' });
          continue;
        }

        results.push({ filename: f.name, id: data.id, status: 'ok' });
      } catch (e: any) {
        results.push({ filename: f.name, id: '', status: 'fail', error: e.message });
      }
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const fail = results.filter(r => r.status === 'fail').length;
    return NextResponse.json({
      results,
      message: `上传完成：${ok}个成功${fail > 0 ? `，${fail}个失败` : ''}`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || '上传失败' }, { status: 500 });
  }
}
