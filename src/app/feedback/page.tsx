'use client';
import { useState } from 'react';
import { ArrowLeft, Mail, Send, CheckCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default function FeedbackPage() {
  const [type, setType] = useState<'bug' | 'suggest' | 'other'>('suggest');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) { alert('请输入反馈内容'); return; }
    setSending(true);
    try {
      const body = `【${type === 'bug' ? '问题反馈' : type === 'suggest' ? '功能建议' : '其他'}】\n\n反馈内容：\n${content}\n\n联系方式：${contact || '未填写'}`;
      const subject = encodeURIComponent(type === 'bug' ? '【问题反馈】PepperAI' : type === 'suggest' ? '【功能建议】PepperAI' : '【其他反馈】PepperAI');
      const mailtoLink = `mailto:pepperai@163.com?subject=${subject}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;
      setSuccess(true);
    } catch (e: any) { alert(e.message || '发送失败'); }
    setSending(false);
  };

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
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">问题反馈</span>
          </div>
          <div className="flex-1" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* 标题区 */}
        <div className="text-center">
          <div className="text-4xl mb-3">📨</div>
          <h1 className="text-2xl font-bold text-slate-900">问题反馈</h1>
          <p className="text-sm text-slate-500 mt-2">帮助我们做得更好，您的每一条反馈都很重要</p>
        </div>

        {success ? (
          /* 成功状态 */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">反馈已发送！</h2>
            <p className="text-sm text-slate-500 mb-6">您的反馈已发送至 <a href="mailto:pepperai@163.com" className="text-indigo-500 font-medium">pepperai@163.com</a>，我们会在1-3个工作日内回复您。</p>
            <div className="flex gap-3 justify-center">
              <Link href="/" className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors">返回首页</Link>
              <button onClick={() => { setSuccess(false); setContent(''); setContact(''); }} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">继续反馈</button>
            </div>
          </div>
        ) : (
          /* 反馈表单 */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
            {/* 反馈类型 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2.5">反馈类型</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ id: 'bug', label: '🐛 问题反馈' }, { id: 'suggest', label: '💡 功能建议' }, { id: 'other', label: '📝 其他' }].map(t => (
                  <button key={t.id} onClick={() => setType(t.id as any)}
                    className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${type === t.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 反馈内容 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">反馈内容 <span className="text-red-500">*</span></label>
              <textarea
                value={content} onChange={e => setContent(e.target.value)}
                placeholder="请详细描述您遇到的问题或建议..."
                rows={6}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
              />
            </div>

            {/* 联系方式 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">联系方式（选填）</label>
              <input
                value={contact} onChange={e => setContact(e.target.value)}
                placeholder="邮箱或微信号"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              <p className="text-xs text-slate-400 mt-1.5">留下联系方式，我们才能及时回复您</p>
            </div>

            {/* 发送按钮 */}
            <button onClick={handleSend} disabled={sending}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200 hover:shadow-xl disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {sending ? '发送中...' : <><Send className="w-4 h-4" />发送反馈</>}
            </button>
          </div>
        )}

        {/* 邮件直接联系 */}
        <div className="text-center pt-2">
          <p className="text-xs text-slate-400 mb-2">也可以直接发送邮件至</p>
          <a href="mailto:pepperai@163.com" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-500 hover:text-indigo-600 transition-colors">
            <Mail className="w-4 h-4" />pepperai@163.com
          </a>
        </div>
      </main>
    </div>
  );
}
