'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', destination: email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '发送失败');
        return;
      }
      setToken(data.token);
      setStep('verify');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', destination: email, code, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '验证失败');
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
          <p className="text-indigo-300">{step === 'email' ? '注册你的账号' : '输入验证码'}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/10">
          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-sm text-indigo-200 mb-1">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/20 border border-white/30 text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 caret-white"
                  placeholder="your@email.com"
                />
              </div>
              {error && <p className="text-red-300 text-sm text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition disabled:opacity-50"
              >
                {loading ? '发送中...' : '获取验证码'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-indigo-200 text-center">验证码已发送到 <span className="text-white font-medium">{email}</span></p>
              <div>
                <label className="block text-sm text-indigo-200 mb-1">验证码</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                  maxLength={6}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/20 border border-white/30 text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 caret-white text-center text-2xl tracking-widest"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-red-300 text-sm text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 transition disabled:opacity-50"
              >
                {loading ? '验证中...' : '注册'}
              </button>
              <button type="button" onClick={() => setStep('email')} className="w-full text-sm text-indigo-300 hover:text-white transition py-1">
                重新发送验证码
              </button>
            </form>
          )}
          <div className="mt-4 text-center">
            <a href="/signin" className="text-sm text-indigo-300 hover:text-white transition">
              已有账号？去登录
            </a>
          </div>
          <div className="mt-2 text-center">
            <button type="button" onClick={() => router.push('/')} className="text-sm text-indigo-300 hover:text-white transition">
              ← 返回首页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
