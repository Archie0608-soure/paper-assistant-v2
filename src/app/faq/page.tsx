'use client';
import { useState } from 'react';
import { ArrowLeft, HelpCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';

const FAQS = [
  { q: '如何生成论文？', a: '在首页选择"文章生成"，输入专业、选题方向和字数要求，AI将为您生成完整论文框架和内容，支持Word和PDF导出。' },
  { q: '降重降AI如何使用？', a: '在"降重降AI"页面粘贴需要处理的文本，选择目标平台（知网/维普/格子达/大雅等），系统将自动进行降重或降AI处理，支持一键文档上传。' },
  { q: '如何充值金币？', a: '点击右上角头像→"充值金币"，选择套餐后通过微信/支付宝支付即可秒充到账。如充值未到账请联系客服。' },
  { q: '金币可以退款吗？', a: '金币充值后如需退款，请联系客服处理。未使用的金币可按原支付渠道退款，退款通常在1-3个工作日内到账。' },
  { q: '论文数据安全吗？', a: '您的论文仅供生成使用，不会被保存或共享。我们严格保护用户隐私和数据安全，所有数据传输均采用加密处理。' },
  { q: 'AI生成的论文可以通过查重吗？', a: '建议生成后使用降重功能处理，可有效降低重复率。维普、知网等主流平台均可达到合格标准。' },
  { q: '忘记了登录密码怎么办？', a: '在登录页面点击"验证码登录"，输入邮箱后获取验证码即可登录。登录后可前往账号设置修改密码。' },
  { q: '每日签到有什么奖励？', a: '每日签到可获得金币奖励，连续签到天数越高，单次奖励越丰厚。间断签到将从第一天重新计算。' },
  { q: '支持的支付方式有哪些？', a: '目前支持微信支付和支付宝支付，后续将陆续支持更多支付方式。' },
  { q: '如何联系人工客服？', a: '您可以通过"在线客服"实时对话，也可以发送邮件至 pepperai@163.com，或拨打客服电话 136-0101-3253（微信同号）。' },
];

export default function FAQPage() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回首页</span>
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
              <HelpCircle className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">常见问题</span>
          </div>
          <div className="flex-1" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* 标题区 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">❓</div>
          <h1 className="text-2xl font-bold text-slate-900">常见问题</h1>
          <p className="text-sm text-slate-500 mt-2">点击问题查看解答</p>
        </div>

        {/* FAQ 列表 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {FAQS.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-semibold text-slate-800 pr-4 leading-snug">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${expanded === i ? 'rotate-180' : ''}`} />
              </button>
              {expanded === i && (
                <div className="px-5 pb-4 text-sm text-slate-500 leading-relaxed bg-slate-50 border-t border-slate-100 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 未解决问题 */}
        <div className="mt-8 text-center p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <p className="text-sm font-semibold text-slate-700 mb-1">没有找到答案？</p>
          <p className="text-xs text-slate-400 mb-4">我们的客服团队随时为您服务</p>
          <div className="flex gap-3 justify-center">
            <Link href="/kefu" className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors shadow-sm">
              在线客服
            </Link>
            <a href="mailto:pepperai@163.com" className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
              邮件联系
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
