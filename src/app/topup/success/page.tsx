'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get('order');
  const [status, setStatus] = useState<'checking' | 'success' | 'pending'>('checking');

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('success');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-800 via-indigo-100 to-white flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {status === 'checking' ? (
          <>
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <span className="text-4xl">⏳</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">支付确认中...</h2>
            <p className="text-slate-500">请稍候，我们正在确认您的支付状态</p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">充值成功！</h2>
            <p className="text-slate-500 mb-6">金币已到账，感谢您的支持</p>
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
