'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SignInData {
  consecutive_days: number;
  last_sign_in: string;
  today_signed: boolean;
  total_days: number;
}

export default function DailySignInPage() {
  const router = useRouter();
  const [signInData, setSignInData] = useState<SignInData | null>(null);
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');

  // 获取签到信息
  const loadSignIn = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sign-in');
      const data = await res.json();
      if (res.ok) setSignInData(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadSignIn();
  }, []);

  // 执行签到
  const handleSignIn = async () => {
    setSigning(true);
    setError('');
    try {
      const res = await fetch('/api/sign-in', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '签到失败');
      setSignInData({
        ...signInData!,
        consecutive_days: data.consecutive_days,
        last_sign_in: data.last_sign_in,
        today_signed: true,
        total_days: (signInData?.total_days || 0) + 1,
      });
    } catch (err: any) {
      setError(err.message || '签到失败');
    }
    setSigning(false);
  };

  // 计算本月已签到天数
  const getThisMonthDays = () => {
    if (!signInData) return 0;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return Array.from({ length: now.getDate() }, (_, i) => {
      const day = i + 1;
      // 简化：假设每天签到直到今天
      if (signInData.today_signed) return day;
      return day < now.getDate() ? day : 0;
    }).filter(d => d > 0).length;
  };

  // 本月日历
  const renderCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells = Array.from({ length: 42 }, (_, i) => {
      const day = i - firstDay + 1;
      if (day < 1 || day > daysInMonth) return null;
      return day;
    });

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return (
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map(w => (
          <div key={w} className="text-xs text-slate-400 py-1">{w}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday = day === now.getDate();
          const isSigned = signInData?.today_signed || Math.random() > 0.3; // 模拟已签到
          return (
            <div
              key={i}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm mx-auto
                ${isSigned ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}
                ${isToday && isSigned ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}
              `}
            >
              {day}
            </div>
          );
        })}
      </div>
    );
  };

  // 计算奖励
  const getBonus = (days: number) => {
    let base = 5;
    if (days === 3) base += 5;
    if (days === 7) base += 20;
    if (days === 30) base += 100;
    return base;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 flex flex-col items-center py-8 px-4">
      {/* 顶部导航 */}
      <div className="w-full max-w-md flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-white/70 hover:text-white transition">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-white">每日签到</h1>
        <div className="w-6" />
      </div>

      <div className="w-full max-w-md space-y-4">
        {/* 签到状态卡片 */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
          {signInData?.today_signed ? (
            <div className="text-center py-2">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-white font-bold text-lg">今日已签到</h2>
              <p className="text-indigo-200 text-sm mt-1">明天再来领取更多奖励吧~</p>
            </div>
          ) : (
            <div className="text-center py-2">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-white font-bold text-lg">立即签到</h2>
              <p className="text-indigo-200 text-sm mt-1">连续签到奖励更丰厚哦~</p>
              {error && <p className="text-red-300 text-sm mt-2">{error}</p>}
              <button
                onClick={handleSignIn}
                disabled={signing}
                className="mt-4 px-8 py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold rounded-full hover:from-amber-500 hover:to-orange-600 transition disabled:opacity-50 shadow-lg hover:shadow-xl"
              >
                {signing ? '签到中...' : '立即签到'}
              </button>
            </div>
          )}
        </div>

        {/* 连续签到天数 */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-300 text-sm">连续签到</p>
              <p className="text-3xl font-bold text-white mt-1">
                {signInData?.consecutive_days || 0}
                <span className="text-base text-indigo-300 ml-1">天</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-300 text-sm">累计签到</p>
              <p className="text-3xl font-bold text-white mt-1">
                {signInData?.total_days || 0}
                <span className="text-base text-indigo-300 ml-1">天</span>
              </p>
            </div>
          </div>
        </div>

        {/* 本月日历 */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
          <h3 className="text-white font-bold mb-4">
            {new Date().getMonth() + 1}月签到日历
          </h3>
          {renderCalendar()}
        </div>

        {/* 签到奖励规则 */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
          <h3 className="text-white font-bold mb-3">签到奖励</h3>
          <div className="space-y-2">
            {[
              { days: '每日', bonus: 5, desc: '基础奖励' },
              { days: '连续3天', bonus: 10, desc: '+5额外奖励' },
              { days: '连续7天', bonus: 30, desc: '+20额外奖励' },
              { days: '连续30天', bonus: 130, desc: '+100额外奖励' },
            ].map(rule => (
              <div key={rule.days} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-white text-sm">{rule.days}</p>
                  <p className="text-indigo-300 text-xs">{rule.desc}</p>
                </div>
                <span className="text-amber-400 font-bold">+{rule.bonus}金币</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
