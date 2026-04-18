'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">PepperAI</h1>
          <p className="text-indigo-300">登录你的账号</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/10">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-indigo-200 mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm text-indigo-200 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-300 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition disabled:opacity-50"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
          <div className="mt-4 text-center">
            <a href="/signup" className="text-sm text-indigo-300 hover:text-white transition">
              还没有账号？去注册
            </a>
          </div>
          <div className="mt-2 text-center">
            <button type="button" onClick={() => router.push('/')} className="text-sm text-indigo-300 hover:text-white transition">
              ← 返回首页
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
