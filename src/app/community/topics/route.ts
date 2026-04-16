import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit')) || 50;
    const offset = Number(searchParams.get('offset')) || 0;

    const { data, error, count } = await (supabase as any)
      .from('community_topics')
      .select('*', { count: 'exact' })
      .order('likes', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return NextResponse.json({ topics: data || [], total: count || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const sessionData = Buffer.from(session.value, 'base64url').toString();
    const parts = sessionData.split(':');
    const userId = parts[1] || 'anonymous';

    const { title, major, description, is_anonymous } = await req.json();

    if (!title?.trim()) return NextResponse.json({ error: '请输入标题' }, { status: 400 });
    if (!major?.trim()) return NextResponse.json({ error: '请选择专业方向' }, { status: 400 });

    const { data, error } = await (supabase as any)
      .from('community_topics')
      .insert({
        title: title.trim(),
        major: major.trim(),
        description: description?.trim() || '',
        is_anonymous: Boolean(is_anonymous),
        user_id: userId,
        likes: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ topic: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
