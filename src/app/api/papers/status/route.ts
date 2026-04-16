import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
    const userField = type === 'email' ? 'email' : 'phone';

    const { searchParams } = new URL(req.url);
    const paperId = searchParams.get('id');

    const supabase = getSupabase();

    if (paperId) {
      // 查询单个论文状态
      const { data: users } = await supabase.from('users').select('id').eq(userField, destination).limit(1);
      if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

      const { data: paper, error } = await supabase
        .from('papers')
        .select('id, title, status, progress, degree, target_words, chapters, created_at')
        .eq('id', paperId)
        .eq('user_id', users[0].id)
        .single();

      if (error) throw error;
      return NextResponse.json({ paper });
    } else {
      // 查询所有进行中的论文
      const { data: users } = await supabase.from('users').select('id').eq(userField, destination).limit(1);
      if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

      const { data: papers, error } = await supabase
        .from('papers')
        .select('id, title, status, progress, degree, target_words, created_at')
        .eq('user_id', users[0].id)
        .eq('status', 'generating')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ papers: papers || [] });
    }

  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}
