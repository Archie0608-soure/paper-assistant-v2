'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminBalancePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/admin/adjust-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: email, amount: Number(amount), reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin');
  };

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <div className="flex items-center justify-between mb-8">
        <h1>🎛️ 管理员后台 - 余额调整</h1>
        <button
          onClick={handleLogout}
          style={{ padding: '8px 16px', background: '#374151', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          退出登录
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>用户邮箱</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>调整金额（正数加款，负数扣款）</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="例如: 100 或 -50"
            required
            style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>原因（可选）</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="福利发放 / 退款 / 补偿..."
            style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#4F46E5',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '处理中...' : '确认调整'}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fee', color: '#c00', borderRadius: '8px' }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#efe', color: '#060', borderRadius: '8px' }}>
          <h3>✅ 操作成功</h3>
          <p>用户: {result.email}</p>
          <p>旧余额: {result.old_balance}</p>
          <p>新余额: <strong>{result.new_balance}</strong></p>
          <p>变动: {result.change > 0 ? '+' : ''}{result.change}</p>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px', fontSize: '14px' }}>
        <h3>📝 说明</h3>
        <ul>
          <li>正数 = 加款（福利、充值、补偿）</li>
          <li>负数 = 扣款（错误扣费回退、惩罚等）</li>
          <li>所有操作都会记录到用户交易明细</li>
          <li>余额不能为负数</li>
        </ul>
      </div>
    </div>
  );
}
