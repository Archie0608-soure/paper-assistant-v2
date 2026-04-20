'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

const ADMIN_KEY = '801851e064a630a77e0cc810e3379955153f57659b76e53fc0cd039ab62ba2b6';
const ADMIN_PASSWORD = 'SJOMo7vIcv3Edbi1k0gxZN9e8Lmw2DV+';

interface Stats {
  totalUsers: number;
  todayUsers: number;
  totalPv: number;
  todayPv: number;
  totalTransactions: number;
  totalRecharge: number;
  dailyData: { date: string; users: number; pv: number }[];
  recentUsers: { email: string; created_at: string; balance: number }[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/check-session');
        if (!res.ok) router.replace('/admin');
      } catch {
        router.replace('/admin');
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats', {
          headers: {
            'X-Admin-Key': ADMIN_KEY,
            'X-Admin-Password': ADMIN_PASSWORD,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">加载中...</div>
      </div>
    );
  }

  const kpiCards = [
    { label: '总注册用户', value: stats?.totalUsers ?? '-', color: 'from-indigo-500 to-purple-600' },
    { label: '今日新注册', value: stats?.todayUsers ?? '-', color: 'from-emerald-500 to-teal-600' },
    { label: '总浏览量 PV', value: stats?.totalPv ? Number(stats.totalPv).toLocaleString() : '-', color: 'from-orange-500 to-red-600' },
    { label: '今日浏览量', value: stats?.todayPv ?? '-', color: 'from-pink-500 to-rose-600' },
    { label: '充值笔数', value: stats?.totalTransactions ?? '-', color: 'from-cyan-500 to-blue-600' },
    { label: '总充值金额', value: stats?.totalRecharge ? `¥${Number(stats.totalRecharge).toLocaleString()}` : '-', color: 'from-amber-500 to-yellow-600' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📊 数据看板</h1>
          <p className="text-slate-400 text-xs">实时数据 · 每天更新</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/admin/adjust-balance')}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition"
          >
            余额调整
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm transition"
          >
            退出
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        {kpiCards.map((card) => (
          <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-2xl p-4`}>
            <p className="text-white/70 text-xs mb-1">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* 每日趋势 */}
      {stats?.dailyData && stats.dailyData.length > 0 && (
        <div className="px-4 pt-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-4">📈 近7天趋势</h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={[...stats.dailyData].reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Line type="monotone" dataKey="users" stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} name="注册" />
                <Line type="monotone" dataKey="pv" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="浏览" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 最近注册用户 */}
      <div className="px-4 pt-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <h2 className="text-sm font-medium text-slate-300 mb-4">🆕 最近注册用户</h2>
          {stats?.recentUsers && stats.recentUsers.length > 0 ? (
            <div className="space-y-2">
              {stats.recentUsers.map((u, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm text-slate-200">{u.email}</p>
                    <p className="text-xs text-slate-500">{new Date(u.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-emerald-400">{u.balance}</p>
                    <p className="text-xs text-slate-500">金币</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-4">暂无数据</p>
          )}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="px-4 pt-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-300">
          ⚠️ 数据来源：Supabase users 表 + 每日 PV 统计表（需确认统计逻辑已接入）
        </div>
      </div>
    </div>
  );
}
