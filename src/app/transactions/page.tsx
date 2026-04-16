'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, ArrowLeft, Coins, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

interface Transaction {
  id: number;
  type: 'recharge' | 'expense';
  amount: number;
  description: string;
  created_at: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/transactions?limit=50', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError('请先登录后查看交易明细');
          setLoading(false);
          return;
        }
        throw new Error(data.error || '获取失败');
      }
      setTransactions(data.transactions || []);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalRecharge = transactions
    .filter(t => t.type === 'recharge')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => router.back()} className="text-slate-500 hover:text-indigo-600 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-slate-900">交易明细</span>
          </div>
          <div className="flex-1" />
          <div style={{ width: 32 }} />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
            <div className="text-xs text-slate-400 font-medium mb-1">累计充值</div>
            <div className="text-lg font-bold text-green-600">{totalRecharge}</div>
            <div className="text-xs text-slate-400 mt-0.5">金币</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
            <div className="text-xs text-slate-400 font-medium mb-1">累计消费</div>
            <div className="text-lg font-bold text-red-500">{totalExpense}</div>
            <div className="text-xs text-slate-400 mt-0.5">金币</div>
          </div>
        </div>

        {/* 交易列表 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <div className="text-sm">加载中...</div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-200 p-6 text-center shadow-sm">
            <div className="text-red-500 text-sm">{error}</div>
            <button onClick={fetchTransactions} className="mt-3 text-sm text-indigo-600 hover:underline">重试</button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-slate-500 text-sm font-medium">暂无交易记录</div>
            <div className="text-slate-400 text-xs mt-1">充值或消费后将显示在这里</div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <div className="text-xs text-slate-400 font-medium">共 {transactions.length} 条记录</div>
            </div>
            <div className="divide-y divide-slate-100">
              {transactions.map((t) => {
                const { date, time } = formatTime(t.created_at);
                const isRecharge = t.type === 'recharge';
                return (
                  <div key={t.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition">
                    {/* 图标 */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isRecharge ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      {isRecharge ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-500" />
                      )}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{t.description || (isRecharge ? '充值' : '消费')}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{date} {time}</div>
                    </div>

                    {/* 金额 */}
                    <div className={`text-base font-bold flex-shrink-0 ${isRecharge ? 'text-green-600' : 'text-red-500'}`}>
                      {isRecharge ? '+' : ''}{t.amount}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
