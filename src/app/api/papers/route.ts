import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
}

function getUserIdFromSession(supabase: any, cookie: { value: string } | undefined): string | null {
  if (!cookie?.value) return null;
  try {
    const raw = Buffer.from(cookie.value, 'base64url').toString();
    const parts = raw.split(':');
    const type = parts[0];
    const destination = parts.slice(1).join(':'); // 邮箱里可能有:
    const field = type === 'email' ? 'email' : 'phone';
    const { data } = supabase.from('users').select('id').eq(field, destination).limit(1).single();
    return data?.id || null;
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const userId = getUserIdFromSession(supabase, req.cookies.get('pa_session'));
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const paperId = searchParams.get('id');
    if (!paperId) return NextResponse.json({ error: '缺少论文ID' }, { status: 400 });

    const { data: paper, error: findErr } = await supabase
      .from('papers').select('id, user_id').eq('id', paperId).limit(1).single();

    if (findErr || !paper) return NextResponse.json({ error: '论文不存在' }, { status: 404 });
    if (paper.user_id !== userId) return NextResponse.json({ error: '无权删除' }, { status: 403 });

    const { error: delErr } = await supabase.from('papers').delete().eq('id', paperId);
    if (delErr) throw delErr;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/papers DELETE]', err);
    return NextResponse.json({ error: err.message || '删除失败' }, { status: 500 });
  }
}
