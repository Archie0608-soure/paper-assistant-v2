import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = req.cookies.get('pa_session');
      if (!session) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const sessionData = Buffer.from(session.value, 'base64url').toString();
    const parts = sessionData.split(':');
    const userId = parts[1] || 'anonymous';

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 检查是否已点赞
    const { data: existing } = await (supabase as any)
      .from('community_topic_likes')
      .select('id')
      .eq('topic_id', id)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // 取消点赞
      await (supabase as any)
        .from('community_topic_likes')
        .delete()
        .eq('id', existing.id);

      await (supabase as any)
        .from('community_topics')
        .update({ likes: (supabase as any).rpc('decrement_likes', { row_id: id }) })
        .eq('id', id);

      return NextResponse.json({ liked: false });
    } else {
      // 添加点赞
      await (supabase as any)
        .from('community_topic_likes')
        .insert({ topic_id: id, user_id: userId });

      await (supabase as any)
        .from('community_topics')
        .update({ likes: (supabase as any).rpc('increment_likes', { row_id: id }) })
        .eq('id', id);

      return NextResponse.json({ liked: true });
    }
  } catch (error: any) {
    // 如果rpc方法不存在,直接更新
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const session = req.cookies.get('pa_session');
      if (!session) return NextResponse.json({ error: '请先登录' }, { status: 401 });
      const sessionData = Buffer.from(session.value, 'base64url').toString();
      const parts = sessionData.split(':');
      const userId = parts[1] || 'anonymous';

      const { id } = await params;

      const { data: existing } = await (supabase as any)
        .from('community_topic_likes')
        .select('id')
        .eq('topic_id', id)
        .eq('user_id', userId)
        .single();

      if (existing) {
        await (supabase as any).from('community_topic_likes').delete().eq('id', existing.id);
        const { data: topic } = await (supabase as any).from('community_topics').select('likes').eq('id', id).single();
        await (supabase as any).from('community_topics').update({ likes: Math.max(0, (topic?.likes || 1) - 1) }).eq('id', id);
        return NextResponse.json({ liked: false });
      } else {
        await (supabase as any).from('community_topic_likes').insert({ topic_id: id, user_id: userId });
        const { data: topic } = await (supabase as any).from('community_topics').select('likes').eq('id', id).single();
        await (supabase as any).from('community_topics').update({ likes: (topic?.likes || 0) + 1 }).eq('id', id);
        return NextResponse.json({ liked: true });
      }
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
  }
}
