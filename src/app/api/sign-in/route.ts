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

    const client = getSupabase();
    
    // Get user
    const { data: user, error: userError } = await (client.from('users') as any)
      .select('*')
      .eq(userField, destination)
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const today = new Date().toISOString().split('T')[0];
    const lastSignIn = user.last_sign_in ? new Date(user.last_sign_in).toISOString().split('T')[0] : null;
    
    // Check if already signed in today
    if (lastSignIn === today) {
      return NextResponse.json({ error: '今日已签到', consecutive_days: user.consecutive_days || 0, today_signed: true }, { status: 400 });
    }

    // Calculate consecutive days
    let consecutiveDays = 1;
    if (lastSignIn) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastSignIn === yesterdayStr) {
        consecutiveDays = (user.consecutive_days || 0) + 1;
      }
    }

    // Calculate bonus
    let bonus = 5; // Base 5 coins
    if (consecutiveDays >= 7) {
      bonus += 20; // 7 days: +20 extra
    } else if (consecutiveDays >= 3) {
      bonus += 5; // 3 days: +5 extra
    }

    // Update user
    const { error: updateError } = await (client.from('users') as any)
      .update({
        consecutive_days: consecutiveDays,
        last_sign_in: new Date().toISOString(),
        balance: (user.balance || 0) + bonus
      })
      .eq(userField, destination);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      bonus,
      consecutive_days: consecutiveDays,
      today_signed: true,
      message: `签到成功！获得${bonus}金币（${consecutiveDays}天连续签到）`
    });

  } catch (error: any) {
    console.error('Sign-in error:', error);
    return NextResponse.json({ error: error.message || '签到失败' }, { status: 500 });
  }
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

    const client = getSupabase();
    
    const { data: user, error } = await (client.from('users') as any)
      .select('consecutive_days, last_sign_in')
      .eq(userField, destination)
      .limit(1)
      .single();

    if (error || !user) {
      return NextResponse.json({ consecutive_days: 0, last_sign_in: null, today_signed: false });
    }

    const today = new Date().toISOString().split('T')[0];
    const lastSignIn = user.last_sign_in ? new Date(user.last_sign_in).toISOString().split('T')[0] : null;
    const todaySigned = lastSignIn === today;

    return NextResponse.json({
      consecutive_days: user.consecutive_days || 0,
      last_sign_in: user.last_sign_in,
      today_signed: todaySigned
    });

  } catch (error: any) {
    console.error('Get sign-in info error:', error);
    return NextResponse.json({ consecutive_days: 0, last_sign_in: null, today_signed: false });
  }
}
