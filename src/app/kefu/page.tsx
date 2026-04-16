'use client';
import { useState, useEffect, useRef } from 'react';
import { MessageCircle, ArrowLeft, Send, Mail, Phone, ChevronDown } from 'lucide-react';
import Link from 'next/link';

const FAQS = [
  { q: '如何生成论文？', a: '在首页选择"文章生成"，输入专业、选题方向和字数要求，AI将为您生成完整论文框架和内容。' },
  { q: '降重降AI如何使用？', a: '在"降重降AI"页面粘贴需要处理的文本，选择目标平台（知网/维普等），系统将自动进行降重或降AI处理。' },
  { q: '如何充值金币？', a: '点击右上角头像→"充值金币"，选择套餐后通过虎皮椒支付即可秒充到账。' },
  { q: '金币可以退款吗？', a: '金币充值后如需退款，请联系客服处理。未使用的金币可按原支付渠道退款。' },
  { q: '论文数据安全吗？', a: '您的论文仅供生成使用，不会被保存或共享。我们严格保护用户隐私和数据安全。' },
  { q: 'AI生成的论文可以通过查重吗？', a: '建议生成后使用降重功能处理，可有效降低重复率。维普等平台均可达到合格标准。' },
];

export default function KefuPage() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/account').then(r => r.ok && r.json()).then(d => setUser(d)).catch(() => {});
    setMessages([{
      role: 'assistant',
      content: '您好！我是 PepperAI 智能客服 👋\n\n您可以咨询：\n• 论文生成相关问题\n• 降重降AI使用方法\n• 充值退款问题\n• 账号问题\n\n也可以选择下方常见问题快速获取答案 😊',
    }]);
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const autoReply = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('充值') || lower.includes('金币') || lower.includes('付费')) return '充值问题：请前往"充值金币"页面选择套餐，支持微信/支付宝支付，充值后即时到账。如有退款问题请联系客服处理。💰';
    if (lower.includes('论文') || lower.includes('生成')) return '论文生成：输入专业方向和选题，系统会自动生成完整论文。如需调整章节内容，可以在编辑页面修改。📄';
    if (lower.includes('降重') || lower.includes('降ai')) return '降重降AI：支持知网、维普、格子达、大雅等平台，粘贴文本后选择对应平台即可一键处理。✨';
    if (lower.includes('密码') || lower.includes('登录') || lower.includes('注册')) return '登录问题：请检查邮箱格式是否正确。忘记密码可使用"验证码登录"重置密码。如持续无法登录请联系客服。🔐';
    return '感谢您的提问！我们的客服团队会尽快回复您。如需紧急帮助，请联系：pepperai@163.com 📧';
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg = { role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: autoReply(input) }]);
      setSending(false);
    }, 800);
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
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">在线客服</span>
          </div>
          <div className="flex-1" />
          <a href="mailto:pepperai@163.com"
            className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />邮件联系
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* 在线对话 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 对话Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-lg">🤖</div>
            <div>
              <div className="text-sm font-bold text-white">PepperAI 智能客服</div>
              <div className="text-xs text-white/70">平均5分钟内回复 · 24小时在线</div>
            </div>
          </div>

          {/* 消息区 */}
          <div className="h-80 overflow-y-auto px-5 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                )}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-500 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'}`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && user && (
                  <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-sm">🤖</div>
                <div className="px-4 py-2.5 bg-slate-100 rounded-2xl rounded-bl-md text-sm text-slate-400">正在回复...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框 */}
          <div className="px-4 py-3 border-t border-slate-100 flex gap-3">
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={user ? '输入您的问题...' : '请先登录后使用客服'}
              disabled={!user || sending}
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50" />
            <button onClick={sendMessage} disabled={!user || sending || !input.trim()}
              className="w-10 h-10 bg-indigo-500 text-white rounded-full flex items-center justify-center hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 底部联系方式 */}
        <div className="text-center space-y-1 text-sm text-slate-400">
          <p>发送失败？您也可以直接联系我们</p>
          <div className="flex items-center justify-center gap-4">
            <a href="mailto:pepperai@163.com" className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 font-medium">
              <Mail className="w-4 h-4" />pepperai@163.com
            </a>
            <a href="tel:13601013253" className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 font-medium">
              <Phone className="w-4 h-4" />136-0101-3253
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
