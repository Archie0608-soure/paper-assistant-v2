'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react';

const PACKAGES = [
  { coins: 100, price: 10, bonus: 0, label: '基础' },
  { coins: 600, price: 60, bonus: 0, label: '标准' },
  { coins: 1200, price: 120, bonus: 120, bonusLabel: '送120', label: '超值' },
  { coins: 3000, price: 300, bonus: 300, bonusLabel: '送300', label: '豪华' },
  { coins: 6000, price: 600, bonus: 600, bonusLabel: '送600', label: '至尊' },
];

const PAY_METHODS = [
  { id: 'wechat', label: '微信支付', icon: '💬', color: 'from-green-500 to-emerald-600' },
  { id: 'alipay', label: '支付宝', icon: '💙', color: 'from-blue-500 to-sky-600' },
];

export default function TopupPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number>(1);
  const [payMethod, setPayMethod] = useState('wechat');
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);

  const pkg = PACKAGES[selected];
  const totalCoins = pkg.coins + pkg.bonus;

  const handleTopup = async () => {
    setLoading(true);
    setQrCode(null);
    setPayUrl(null);
    try {
      const res = await fetch('/api/topup/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: pkg.coins, method: payMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);

      // 微信支付返回二维码
      if (data.url_qrcode) {
        setQrCode(data.url_qrcode);
        setPayUrl(data.url);
        setOrderNo(data.orderNo);
      } else if (data.payUrl && data.payData) {
        // 跳转支付
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.payUrl;
        form.acceptCharset = 'UTF-8';
        form.target = '_blank';
        const params = new URLSearchParams(data.payData);
        params.forEach((value, key) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      } else {
        alert('发起支付成功，请完成支付');
      }
    } catch (err: any) {
      alert(err.message || '发起充值失败');
    } finally {
      setLoading(false);
    }
  };

  const cancelPayment = () => {
    setQrCode(null);
    setPayUrl(null);
    setOrderNo(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-800 via-indigo-100 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-700 to-purple-700 sticky top-0 z-50 shadow-lg">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
            返回
          </button>
          <h1 className="text-lg font-bold text-white">充值金币</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* 微信支付二维码 */}
        {qrCode && (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200 text-center">
            <h2 className="font-bold text-lg text-slate-900 mb-4">请使用{payMethod === 'wechat' ? '微信' : '支付宝'}扫码支付</h2>
            <div className="flex justify-center mb-4">
              <a href={qrCode} target="_blank" rel="noopener noreferrer">
                <img src={qrCode} alt="支付二维码" className="w-56 h-56 rounded-lg cursor-pointer hover:opacity-90" />
              </a>
            </div>
            <p className="text-sm text-slate-500 mb-2">支付金额：<span className="font-bold text-indigo-600">¥{pkg.price}</span></p>
            <p className="text-xs text-slate-400 mb-2">金币将在支付成功后自动到账</p>
            <a
              href={`/topup/success?order=${orderNo}`}
              className="inline-block px-6 py-2 mb-3 text-sm text-green-600 border border-green-300 rounded-lg hover:bg-green-50"
            >
              已支付？点此跳转确认
            </a>
            <button
              onClick={cancelPayment}
              className="px-6 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg block mx-auto"
            >
              取消
            </button>
          </div>
        )}

        {/* 提示卡片 */}
        {!qrCode && (
          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 shadow-lg border border-white/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-xl">💰</span>
              </div>
              <div>
                <p className="font-semibold text-slate-900">金币充值</p>
                <p className="text-xs text-slate-500">1元 = 10金币 · 千字100金币</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">选择充值金额和支付方式，支付完成后金币自动到账</p>
          </div>
        )}

        {/* 支付方式选择 */}
        {!qrCode && (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200">
            <h2 className="font-semibold text-slate-900 mb-4">选择支付方式</h2>
            <div className="grid grid-cols-2 gap-3">
              {PAY_METHODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setPayMethod(m.id)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                    payMethod === m.id
                      ? 'border-indigo-500 bg-indigo-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{m.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{m.label}</p>
                      <p className="text-xs text-slate-400">{m.id === 'wechat' ? '推荐' : '安全便捷'}</p>
                    </div>
                  </div>
                  {payMethod === m.id && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-4 h-4 text-indigo-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 充值套餐 */}
        {!qrCode && (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200">
            <h2 className="font-semibold text-slate-900 mb-4">选择充值金额</h2>
            <div className="grid grid-cols-2 gap-3">
              {PACKAGES.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                    selected === i
                      ? 'border-indigo-500 bg-indigo-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {p.bonus > 0 && (
                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full shadow">
                      {p.bonusLabel}
                    </div>
                  )}
                  <p className="text-2xl font-bold text-slate-900">{p.coins}</p>
                  <p className="text-sm text-slate-500">金币</p>
                  <p className="text-lg font-semibold text-indigo-600 mt-1">¥{p.price}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 确认按钮 */}
        {!qrCode && (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-600">充值后获得</span>
              <div className="text-right">
                <p className="text-2xl font-bold text-amber-600">{totalCoins} <span className="text-sm font-normal">金币</span></p>
                {pkg.bonus > 0 && <p className="text-xs text-green-500">含赠品{pkg.bonus}金币</p>}
              </div>
            </div>
            <button
              onClick={handleTopup}
              disabled={loading}
              className={`w-full py-4 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                payMethod === 'wechat'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-700'
                  : 'bg-gradient-to-r from-blue-500 to-sky-600'
              }`}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? '正在生成二维码...' : `${payMethod === 'wechat' ? '微信支付' : '支付宝'} ¥${pkg.price}`}
            </button>
            <p className="text-xs text-slate-400 text-center mt-3">支付安全由虎皮椒提供保障</p>
          </div>
        )}
      </div>
    </div>
  );
}
