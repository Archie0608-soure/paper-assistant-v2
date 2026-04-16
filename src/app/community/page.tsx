'use client';
import { useState, useEffect, useCallback } from 'react';
import { Users, ArrowLeft, Heart, Plus, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

const MAJORS = ['人工智能', '数据科学', '计算机科学', '工商管理', '金融学', '机械工程', '电子信息', '土木工程', '医学', '教育学', '法学', '其他'];

interface Topic {
  id: string; title: string; major: string; description: string;
  is_anonymous: boolean; likes: number; created_at: string;
}

export default function CommunityPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', major: MAJORS[0], description: '', is_anonymous: false });
  const [submitting, setSubmitting] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<any>(null);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch('/api/community/topics');
      const data = await res.json();
      setTopics(data.topics || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTopics();
    fetch('/api/account').then(r => r.ok && r.json()).then(d => setUser(d)).catch(() => {});
    try { const l = localStorage.getItem('community_liked'); if (l) setLikedIds(new Set(JSON.parse(l))); } catch {}
  }, [fetchTopics]);

  const handleLike = async (id: string) => {
    if (!user) { alert('请先登录'); return; }
    try {
      const res = await fetch(`/api/community/topics/${id}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setTopics(prev => prev.map(t => t.id === id ? { ...t, likes: Math.max(0, t.likes + (data.liked ? 1 : -1)) } : t));
      const newLiked = new Set(likedIds);
      data.liked ? newLiked.add(id) : newLiked.delete(id);
      setLikedIds(newLiked);
      localStorage.setItem('community_liked', JSON.stringify([...newLiked]));
    } catch {}
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { alert('请输入标题'); return; }
    if (!user) { alert('请先登录'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/community/topics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setTopics(prev => [data.topic, ...prev]);
      setShowForm(false);
      setForm({ title: '', major: MAJORS[0], description: '', is_anonymous: false });
    } catch (e: any) { alert(e.message); }
    setSubmitting(false);
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m}分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}小时前`;
    return `${Math.floor(h / 24)}天前`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回首页</span>
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
              <Users className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">专属社区</span>
          </div>
          <div className="flex-1" />
          <button onClick={() => { if (!user) { alert('请先登录'); return; } setShowForm(!showForm); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors shadow-sm">
            {showForm ? <><X className="w-4 h-4" />取消</> : <><Plus className="w-4 h-4" />发布选题</>}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* 发布表单 */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">发布新选题</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">选题标题 <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例如：基于区块链的供应链金融风险控制研究"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">专业方向 <span className="text-red-500">*</span></label>
                  <select value={form.major} onChange={e => setForm(f => ({ ...f, major: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-400 transition-all">
                    {MAJORS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))}
                      className="w-4 h-4 accent-indigo-500" />
                    匿名发布
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">补充描述</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="简要描述研究内容和方向..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none" />
              </div>
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200 hover:shadow-xl disabled:opacity-60 transition-all flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />发布中...</> : <><Plus className="w-4 h-4" />发布选题</>}
              </button>
            </div>
          </div>
        )}

        {/* 列表 */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">加载中...</div>
        ) : topics.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">暂无话题，来发布第一个吧</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map((topic) => (
              <div key={topic.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all duration-200 flex flex-col gap-3">
                {/* 标签行 */}
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold">{topic.major}</span>
                  <span className="text-xs text-slate-400">{timeAgo(topic.created_at)}</span>
                </div>
                {/* 标题 */}
                <h3 className="text-sm font-bold text-slate-800 leading-snug flex-1">{topic.title}</h3>
                {/* 描述 */}
                {topic.description && (
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{topic.description}</p>
                )}
                {/* 底部 */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{topic.is_anonymous ? '👤 匿名' : '👤 同学'}</span>
                  <button onClick={() => handleLike(topic.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${likedIds.has(topic.id) ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}>
                    <Heart className={`w-3.5 h-3.5 ${likedIds.has(topic.id) ? 'fill-current' : ''}`} />
                    {topic.likes || 0}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
