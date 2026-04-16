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

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const userId = getUserIdFromSession(supabase, req.cookies.get('pa_session'));
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const query = supabase
      .from('papers')
      .select('id, title, major, paper_type, chapters, created_at')
      .eq('user_id', userId)
      .not('chapters', 'is', null)
      .not('chapters', 'eq', '[]')
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: papersData, error: listErr } = await query;
    if (listErr) throw listErr;

    const papers = (papersData || []).map((p: any) => {
      let chapters: any[] = [];
      try {
        const parsed = JSON.parse(p.chapters);
        if (Array.isArray(parsed)) {
          chapters = parsed.map((c: any) => ({
            title: c.title || c.name || '未命名章节',
            content: c.content || c.content_generated || c.text || '',
            level: c.level || 1,
          }));
        }
      } catch {}
      return {
        id: p.id, title: p.title, major: p.major, paper_type: p.paper_type,
        chapter_count: chapters.length, chapters, created_at: p.created_at,
      };
    }).filter((p: any) => p.chapter_count > 0);

    return NextResponse.json({ papers });
  } catch (err: any) {
    console.error('[/api/papers/list]', err);
    return NextResponse.json({ error: err.message || '获取论文列表失败' }, { status: 500 });
  }
}
