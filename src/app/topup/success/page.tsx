'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get('order');
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'failed'>('idle');
  const isChecking = status === 'checking';
  const [message, setMessage] = useState('');

  const handleVerify = async () => {
    if (!orderNo) return;
    setStatus('checking');
    setMessage('');
    try {
      const res = await fetch('/api/topup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order_no: orderNo }),
      });
      const data = await res.json();
      if (data.success || data.status === 'completed') {
        setStatus('success');
        setMessage(data.message || '充值成功！');
      } else {
        setStatus('failed');
        setMessage(data.message || '暂未检测到支付，请稍后再试');
      }
    } catch {
      setStatus('failed');
      setMessage('验证失败，请稍后再试');
    }
  };

  // 自动验证
  useEffect(() => {
    if (!orderNo) return;
    const timer = setTimeout(() => {
      handleVerify();
    }, 1500);
    return () => clearTimeout(timer);
  }, [orderNo]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-800 via-indigo-100 to-white flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {status === 'idle' || status === 'checking' ? (
          <>
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">支付确认中...</h2>
            <p className="text-slate-500">正在确认您的支付状态</p>
            {orderNo && (
              <p className="text-xs text-slate-400 mt-2">订单号：{orderNo}</p>
            )}
          </>
        ) : status === 'success' ? (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">充值成功！</h2>
            <p className="text-slate-500 mb-2">{message}</p>
            {orderNo && (
              <p className="text-xs text-slate-400 mb-6">订单号：{orderNo}</p>
            )}
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition"
            >
              返回首页
            </Link>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">支付失败</h2>
            <p className="text-slate-500 mb-6">{message}</p>
            <div className="space-y-3">
              <button
                onClick={handleVerify}
                disabled={isChecking}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {isChecking ? '验证中...' : '重新验证支付'}
              </button>
              <Link
                href="/topup"
                className="block w-full px-6 py-3 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition"
              >
                返回充值页面
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TopupSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-indigo-800 via-indigo-100 to-white flex items-center justify-center">
        <div className="text-white">加载中...</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
