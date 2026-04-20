import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAdminAuthenticated(req: NextRequest): boolean {
  const key = req.headers.get('X-Admin-Key');
  const password = req.headers.get('X-Admin-Password');
  return (
    key === '801851e064a630a77e0cc810e3379955153f57659b76e53fc0cd039ab62ba2b6' &&
    password === 'SJOMo7vIcv3Edbi1k0gxZN9e8Lmw2DV+'
  );
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 总用户数 & 今日新注册
    const { count: totalUsers } = await supabase
      .from('users').select('*', { count: 'exact', head: true });

    const { count: todayUsers } = await supabase
      .from('users').select('*', { count: 'exact', head: true })
      .gte('created_at', today);

    // 总充值笔数 & 金额（只统计真实用户充值，排除管理员加款和退款）
    const { count: totalTransactions } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true })
      .eq('type', 'recharge').ilike('description', '充值%');

    const { data: txData } = await supabase
      .from('transactions').select('amount')
      .eq('type', 'recharge').ilike('description', '充值%');
    const totalRecharge = txData?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;

    // 每日新增用户（近7天）
    const { data: dailyUsersData } = await supabase
      .from('users')
      .select('created_at')
      .gte('created_at', weekAgo)
      .lte('created_at', today + 'T23:59:59')
      .order('created_at', { ascending: true });

    // 每日 PV（从 page_views 表）
    const { data: dailyPvData } = await supabase
      .from('page_views')
      .select('date, pv')
      .gte('date', weekAgo)
      .lte('date', today)
      .order('date', { ascending: true });

    // 构建每日数据
    const userMap: Record<string, number> = {};
    dailyUsersData?.forEach((u: any) => {
      const d = u.created_at.slice(0, 10);
      userMap[d] = (userMap[d] || 0) + 1;
    });

    const pvMap: Record<string, number> = {};
    dailyPvData?.forEach((p: any) => {
      pvMap[p.date] = p.pv;
    });

    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dates.push(d);
    }

    const dailyData = dates.map((date) => ({
      date,
      users: userMap[date] || 0,
      pv: pvMap[date] || 0,
    }));

    // 最近注册用户（最新10条）
    const { data: recentUsers } = await supabase
      .from('users').select('email, created_at, balance')
      .order('created_at', { ascending: false }).limit(10);

    // 总 PV（从 page_views sum）
    const { data: allPv } = await supabase
      .from('page_views').select('pv');
    const totalPv = allPv?.reduce((sum, p: any) => sum + p.pv, 0) ?? 0;
    const todayPv = pvMap[today] || 0;

    return NextResponse.json({
      totalUsers: totalUsers ?? 0,
      todayUsers: todayUsers ?? 0,
      totalPv,
      todayPv,
      totalTransactions: totalTransactions ?? 0,
      totalRecharge: ((txData?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0) / 100),
      dailyData,
      recentUsers: recentUsers ?? [],
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
