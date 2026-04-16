import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _supabase: any | null = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
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

    // 查找用户
    const { data: users } = await getSupabase().from('users')
      .select('id')
      .eq(userField, destination)
      .limit(1);

    if (!users || users.length === 0) {
      return NextResponse.json({ papers: [] });
    }

    const userId = users[0].id;

    // 加载用户的论文列表
    const { data: papers, error } = await getSupabase().from('papers')
      .select('id, title, major, paper_type, status, progress, degree, target_words, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ papers: papers || [] });

  } catch (error: any) {
    console.error('Load papers error:', error);
    return NextResponse.json({ error: error.message || '加载失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const { data: users } = await getSupabase().from('users')
      .select('id')
      .eq(userField, destination)
      .limit(1);

    if (!users || users.length === 0) {
      return NextResponse.json({ paper: null });
    }

    const userId = users[0].id;
    const { id } = await req.json();

    const { data: paper, error } = await getSupabase().from('papers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return NextResponse.json({ paper: paper || null });

  } catch (error: any) {
    console.error('Load paper error:', error);
    return NextResponse.json({ error: error.message || '加载失败' }, { status: 500 });
  }
}
