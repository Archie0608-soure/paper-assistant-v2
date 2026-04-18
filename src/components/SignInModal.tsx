'use client';

import { useState, useEffect } from 'react';

interface SignInData {
  consecutive_days: number;
  last_sign_in: string;
  today_signed: boolean;
  total_days: number;
}

export default function SignInModal({ onClose }: { onClose: () => void }) {
  const [signInData, setSignInData] = useState<SignInData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [justSigned, setJustSigned] = useState(false);
  const [signedBonus, setSignedBonus] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/sign-in');
        const data = await res.json();
        if (res.ok) setSignInData(data);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSignIn = async () => {
    setSigning(true);
    setError('');
    try {
      const res = await fetch('/api/sign-in', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '签到失败');
      let bonus = 5;
      if (data.consecutive_days === 3) bonus += 5;
      if (data.consecutive_days === 7) bonus += 20;
      setSignedBonus(bonus);
      setSignInData({
        ...signInData!,
        consecutive_days: data.consecutive_days,
        last_sign_in: data.last_sign_in,
        today_signed: true,
        total_days: (signInData?.total_days || 0) + 1,
      });
      setJustSigned(true);
    } catch (err: any) {
      setError(err.message || '签到失败');
    }
    setSigning(false);
  };

  const getBonus = (days: number) => {
    let base = 5;
    if (days === 3) base += 5;
    if (days === 7) base += 20;
    return base;
  };

  const month = new Date().getMonth() + 1;
  const today = new Date().getDate();

  // 生成当月前today天的日历格子
  const cells = Array.from({ length: today }, (_, i) => i + 1);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-80 bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部渐变条 */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-emerald-400" />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : justSigned ? (
          <div className="py-10 text-center px-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg animate-bounce">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800">签到成功！</h3>
            <p className="text-2xl font-black text-amber-500 mt-2">+{signedBonus} 金币</p>
            <p className="text-slate-400 text-sm mt-1">连续签到 {signInData?.consecutive_days} 天</p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition text-sm"
            >
              知道了
            </button>
          </div>
        ) : signInData?.today_signed ? (
          <div className="py-10 text-center px-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800">今日已签到</h3>
            <p className="text-slate-400 text-sm mt-1">明天再来领取更多奖励吧~</p>
            <div className="mt-4 flex gap-4 justify-center">
              <div className="text-center">
                <p className="text-2xl font-black text-slate-800">{signInData?.consecutive_days}</p>
                <p className="text-xs text-slate-400">连续签到</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-slate-800">{signInData?.total_days}</p>
                <p className="text-xs text-slate-400">累计签到</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-5 w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition text-sm"
            >
              关闭
            </button>
          </div>
        ) : (
          <div className="py-6 px-6">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">每日签到</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 签到状态 */}
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-slate-600 text-sm">今日签到可获得</p>
              <p className="text-2xl font-black text-amber-500 mt-0.5">+{getBonus((signInData?.consecutive_days || 0))} 金币</p>
            </div>

            {/* 本月进度 */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>{month}月</span>
                <span>{today}天</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {cells.map(d => (
                  <div
                    key={d}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                      ${d === today ? 'bg-amber-400 text-white shadow-sm' : 'bg-emerald-100 text-emerald-600'}`}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>

            {/* 奖励规则 */}
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <p className="text-xs font-medium text-slate-500 mb-2">签到奖励</p>
              <div className="space-y-1">
                {[
                  { days: '每日', bonus: 5 },
                  { days: '连续3天', bonus: 10 },
                  { days: '连续7天', bonus: 30 },
                ].map(r => (
                  <div key={r.days} className="flex justify-between text-xs">
                    <span className="text-slate-500">{r.days}</span>
                    <span className="font-medium text-amber-500">+{r.bonus}金币</span>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-red-500 text-xs text-center mb-3">{error}</p>}

            <button
              onClick={handleSignIn}
              disabled={signing}
              className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold rounded-xl hover:from-amber-500 hover:to-orange-600 transition disabled:opacity-50 shadow-md text-sm"
            >
              {signing ? '签到中...' : '立即签到'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
