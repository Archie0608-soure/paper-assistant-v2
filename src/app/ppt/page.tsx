'use client';
import { useState, useEffect, useRef } from 'react';
import { Presentation, ArrowLeft, Loader2, Download, RotateCcw, Home, X } from 'lucide-react';
import Link from 'next/link';

const PAGE_OPTIONS = [15, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60];

function getTimeRange(pages: number) {
  const map: Record<number, { min: number; max: number }> = {
    15: { min: 12, max: 15 }, 18: { min: 15, max: 18 }, 20: { min: 18, max: 20 },
    25: { min: 22, max: 25 }, 30: { min: 27, max: 30 }, 35: { min: 32, max: 35 },
    40: { min: 37, max: 40 }, 45: { min: 42, max: 45 }, 50: { min: 47, max: 50 },
    55: { min: 52, max: 55 }, 60: { min: 57, max: 60 },
  };
  return map[pages] || { min: 10, max: 15 };
}

interface HistoryItem {
  title: string; name: string; school: string; keywords: string;
  pages: number; url: string; time: number;
}

export default function PPTPage() {
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [keywords, setKeywords] = useState('');
  const [pages, setPages] = useState(10);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [timeRange, setTimeRange] = useState(getTimeRange(10));
  const [loading, setLoading] = useState(false);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [selectedPreview, setSelectedPreview] = useState<any>(null);  // 已选中的模板
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);  // 正在预览的模板
  const [previewData, setPreviewData] = useState<any>(null);  // 预览数据（从PPTX提取）
  const [previewLoading, setPreviewLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 预览弹窗打开时获取模板内容
  useEffect(() => {
    if (!previewTemplate) { setPreviewData(null); return; }
    setPreviewLoading(true);
    setPreviewData(null);
    const file = previewTemplate.file;
    fetch(`/api/ppt/preview?file=${encodeURIComponent(file)}`)
      .then(r => r.json())
      .then(data => { setPreviewData(data); setPreviewLoading(false); })
      .catch(() => { setPreviewLoading(false); });
  }, [previewTemplate]);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const [accountRes] = await Promise.all([
          fetch('/api/account', { credentials: 'include' }),
        ]);
        if (accountRes.ok) {
          const data = await accountRes.json();
          setAccountData(data);
        }
      } catch {}
    };
    fetchAccount();

    // 加载模板列表
    fetch('/api/ppt/templates')
      .then(r => r.json())
      .then(data => { if (data.templates) setTemplates(data.templates); })
      .catch(() => {});

    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  // 模板预览URL（用于点击查看大图）
  const templatePreviewSrc = selectedPreview
    ? 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent('https://pepperai.com.cn' + (selectedPreview.file.startsWith('/') ? '/api/ppt/download?file=' + encodeURIComponent(selectedPreview.file.slice(1)) : selectedPreview.file))
    : '';
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ppt_history');
      if (saved) {
        const all: HistoryItem[] = JSON.parse(saved);
        const valid = all.filter(h => h.time > Date.now() - 7 * 86400000);
        setHistory(valid);
      }
    } catch {}
  }, []);

  const handlePages = (val: number) => { setPages(val); setTimeRange(getTimeRange(val)); };

  const handleGenerate = async () => {
    if (!title.trim()) { setError('请输入论文标题'); return; }
    if (!name.trim()) { setError('请输入姓名'); return; }
    setError(''); setLoading(true); setProgress('正在生成...');
    try {
      const res = await fetch('/api/ppt/generate', {
        credentials: 'include',
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, name, school, keywords, pages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setProgress(''); setDownloadUrl(data.url);
      const newItem: HistoryItem = { title, name, school, keywords, pages, url: data.url, time: Date.now() };
      setHistory(prev => [newItem, ...prev.filter(h => h.title !== title)].slice(0, 20));
      localStorage.setItem('ppt_history', JSON.stringify([newItem, ...history.filter(h => h.title !== title)].slice(0, 20)));
    } catch (e: any) { setError(e.message || '生成失败'); }
    finally { setLoading(false); }
  };

  const loadHistory = (item: HistoryItem) => {
    setTitle(item.title); setName(item.name); setSchool(item.school);
    setKeywords(item.keywords); setPages(item.pages); setTimeRange(getTimeRange(item.pages));
    setDownloadUrl(item.url); setShowHistory(false);
  };
  const previewSrc = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent('https://pepperai.com.cn' + (downloadUrl.startsWith('/') ? '/api/ppt/download?file=' + encodeURIComponent(downloadUrl.slice(1)) : downloadUrl));

  return (
    <div className="bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回首页</span>
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <Presentation className="w-4 h-4 text-slate-900" />
            </div>
            <span className="font-bold text-slate-900">AI 答辩PPT</span>
          </div>
          <div className="flex-1" />
          {/* 余额 + 充值 */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm transition-colors"
            >
              <span className="text-indigo-600 font-medium">{accountData?.balance ?? '—'}</span>
              <span className="text-indigo-500 text-xs">金币</span>
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-2 z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium text-sm">{accountData?.email || accountData?.phone || '用户'}</p>
                      <p className="text-white/70 text-xs mt-0.5">{accountData?.balance ?? 0} 金币</p>
                    </div>
                    <a href="/topup" onClick={() => setShowUserMenu(false)}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition">
                      充值
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-12 space-y-5 overflow-y-auto">
        {/* 历史记录 */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button onClick={() => setShowHistory(!showHistory)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              <span>📋 历史记录 ({history.length})</span>
              <span className="text-xs text-slate-400">{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <div className="border-t border-slate-100">
                {history.map((item, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 last:border-0">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 truncate max-w-xs">{item.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.name} · {item.pages}页 · {new Date(item.time).toLocaleDateString('zh-CN')}</div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <a href={item.url.startsWith("/") ? "/api/ppt/download?file=" + encodeURIComponent(item.url.slice(1)) : item.url} download className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors">下载</a>
                      <button onClick={() => loadHistory(item)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors">重新生成</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 表单卡片 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          {/* 论文标题 */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              论文标题 <span className="text-red-500">*</span>
            </label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="例如：基于深度学习的图像识别技术研究"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
          </div>

          {/* 姓名 + 学校 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">姓名 <span className="text-red-500">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="张三"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">学校</label>
              <input value={school} onChange={e => setSchool(e.target.value)} placeholder="某某大学"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
            </div>
          </div>

          {/* 关键词 */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">关键词</label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="深度学习、图像识别、卷积神经网络"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
          </div>

          {/* 模板选择 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-800">🎨 选择模板</label>
              {selectedTemplate && (
                <button onClick={() => setSelectedTemplate(null)}
                  className="text-xs text-red-400 hover:text-red-500">取消选择</button>
              )}
            </div>
            {selectedTemplate ? (
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-indigo-200 rounded-xl">
                <div className="flex rounded-lg overflow-hidden flex-shrink-0">
                  <div className="w-4 h-10" style={{ backgroundColor: '#' + selectedTemplate.colors.primary }} />
                  <div className="w-4 h-10" style={{ backgroundColor: '#' + selectedTemplate.colors.secondary }} />
                  <div className="w-4 h-10" style={{ backgroundColor: '#' + selectedTemplate.colors.accent }} />
                  <div className="w-4 h-10" style={{ backgroundColor: '#' + selectedTemplate.colors.bg }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">[{selectedTemplate.index}] {selectedTemplate.name}</div>
                  <div className="text-xs text-slate-400">{selectedTemplate.slideCount}页 · {selectedTemplate.category}</div>
                </div>
                <button onClick={() => setSelectedTemplate(null)} className="text-xs text-red-400 hover:text-red-500">✕</button>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex gap-2 p-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {templates.slice(0, 20).map(t => (
                    <button key={t.id} onClick={() => setPreviewTemplate(t)}
                      className="flex-shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-400 transition-all"
                      title={`点击预览 ${t.name}`}>
                      <div className="flex h-10">
                        <div className="w-5" style={{ backgroundColor: '#' + t.colors.primary }} />
                        <div className="w-5" style={{ backgroundColor: '#' + t.colors.secondary }} />
                        <div className="w-5" style={{ backgroundColor: '#' + t.colors.accent }} />
                        <div className="w-5" style={{ backgroundColor: '#' + t.colors.bg }} />
                      </div>
                      <div className="text-center text-xs font-bold text-indigo-600 px-0.5 py-0.5">{t.index}</div>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                  <a href="/ppt/templates" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">查看全部 {templates.length} 个模板 →</a>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">输入编号:</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      placeholder="1"
                      className="w-14 px-2 py-1 border border-slate-200 rounded-lg text-xs text-center outline-none focus:border-indigo-400"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value;
                          const num = parseInt(val);
                          const found = templates.find(tmpl => tmpl && tmpl.index === num);
                          if (found) {
                            setSelectedTemplate(found);
                          } else {
                            alert('编号 ' + num + ' 不存在，请先在模板库确认该编号');
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-slate-800">PPT页数</label>
              <span className="text-2xl font-bold text-indigo-600">{pages}<span className="text-sm text-slate-400 font-normal ml-1">页</span></span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {PAGE_OPTIONS.map(n => (
                <button key={n} onClick={() => handlePages(n)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${pages === n ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                  {n}页
                </button>
              ))}
            </div>
            <input type="range" min={15} max={60} step={1} value={pages} onChange={e => handlePages(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer" />
            <p className="text-center text-xs text-slate-400 mt-2">建议演讲时长：<span className="text-indigo-600 font-semibold">{timeRange.min}-{timeRange.max} 分钟</span></p>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">⚠️ {error}</div>
          )}

          {/* 生成按钮 */}
          <button onClick={handleGenerate} disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />{progress || '生成中...'}</> : <><Presentation className="w-4 h-4" />一键生成答辩PPT</>}
          </button>

          {/* 成功下载区 */}
          {downloadUrl && !loading && (
            <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl text-center">
              <p className="text-base font-bold text-green-700 mb-1">✅ PPT生成成功！</p>
              <p className="text-xs text-green-500 mb-4">文件已生成，可直接下载</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <a href={downloadUrl.startsWith("/") ? "/api/ppt/download?file=" + encodeURIComponent(downloadUrl.slice(1)) : downloadUrl} download className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2">
                  <Download className="w-4 h-4" />下载PPT
                </a>
                <button onClick={() => setShowPreview(!showPreview)} className="px-5 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center gap-2">
                  {showPreview ? "关闭预览" : "在线预览"}
                </button>
              </div>
              {showPreview && (
                <iframe src={previewSrc} width="100%" height="450" frameBorder="0" className="rounded-xl border border-slate-200 mt-3"></iframe>
              )}
              <div className="flex gap-3 justify-center flex-wrap">
                <Link href="/" className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
                  <Home className="w-4 h-4" />返回首页
                </Link>
                <button onClick={() => { setDownloadUrl(''); setTitle(''); }} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />重新生成
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 功能说明 */}
        <div className="grid grid-cols-3 gap-3">
          {[{ icon: '📄', t: '封面+目录', d: '专业答辩封面' }, { icon: '🎨', t: '学术风格', d: '深蓝配色设计' }, { icon: '📚', t: '模板库', d: '自定义上传', link: '/ppt/templates' }].map((f, i) => (
            f.link ? (
              <a key={i} href={f.link} className="block bg-white rounded-2xl shadow-sm border border-slate-200 p-4 text-center hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer">
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="text-xs font-semibold text-slate-800">{f.t}</div>
                <div className="text-xs text-slate-400 mt-0.5">{f.d}</div>
              </a>
            ) : (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 text-center">
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="text-xs font-semibold text-slate-800">{f.t}</div>
                <div className="text-xs text-slate-400 mt-0.5">{f.d}</div>
              </div>
            )
          ))}
        </div>
      </main>

      {/* 模板预览弹窗 */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{previewTemplate.name}</p>
                <p className="text-xs text-slate-400">{previewTemplate.slideCount}页 · {previewTemplate.category}</p>
              </div>
              <button onClick={() => { setPreviewTemplate(null); setPreviewData(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {/* 加载预览数据 */}
              {!previewData && !previewLoading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">正在加载预览...</p>
                  </div>
                </div>
              )}
              {previewLoading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">正在解析模板内容...</p>
                  </div>
                </div>
              )}
              {previewData && (
                <div>
                  {/* 模拟PPT幻灯片预览 */}
                  <div
                    className="rounded-xl overflow-hidden shadow-lg mx-auto relative"
                    style={{ backgroundColor: '#' + previewData.bgColor, maxWidth: 700 }}
                  >
                    {/* 顶部色条 */}
                    <div className="flex">
                      {(previewData.colors || []).slice(0, 4).map((c: string, i: number) => (
                        <div key={i} className="h-2 flex-1" style={{ backgroundColor: '#' + c }} />
                      ))}
                    </div>
                    {/* 幻灯片内容 */}
                    <div className="p-8 min-h-64">
                      {previewData.boldText && previewData.boldText.length > 0 ? (
                        <div className="space-y-3">
                          {previewData.boldText.slice(0, 2).map((t: string, i: number) => (
                            <p key={i} className="font-bold text-lg" style={{ color: '#' + (previewData.colors[0] || '333333') }}>{t}</p>
                          ))}
                          {(previewData.texts || []).filter((_: any, i: number) => !previewData.boldText.includes(_)).slice(0, 4).map((t: string, i: number) => (
                            <p key={i} className="text-sm mt-1" style={{ color: '#' + (previewData.colors[1] || '666666') }}>{t.length > 60 ? t.slice(0, 60) + '...' : t}</p>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(previewData.texts || []).slice(0, 5).map((t: string, i: number) => (
                            <p key={i} className="text-sm" style={{ color: i === 0 ? '#' + (previewData.colors[0] || '333333') : '#' + (previewData.colors[1] || '666666') }}>{t.length > 80 ? t.slice(0, 80) + '...' : t}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* 底部装饰 */}
                    <div className="flex items-center justify-between px-8 pb-6">
                      <div className="flex gap-1">
                        {(previewData.colors || []).slice(0, 3).map((c: string, i: number) => (
                          <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: '#' + c }} />
                        ))}
                      </div>
                      <div className="text-xs opacity-50" style={{ color: '#' + (previewData.colors[0] || '333333') }}>
                        第1页 / 共{previewTemplate.slideCount || '?'}页
                      </div>
                    </div>
                  </div>
                  {/* 颜色盘 */}
                  <div className="flex items-center justify-center gap-3 mt-4">
                    {(previewData.colors || []).map((c: string, i: number) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded border border-slate-200" style={{ backgroundColor: '#' + c }} />
                        <span className="text-xs text-slate-400">#{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!previewData && !previewLoading && (
                <p className="text-center text-slate-400 text-sm mt-4">无法加载预览</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => { setPreviewTemplate(null); setPreviewData(null); }}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200">
                关闭
              </button>
              <button onClick={() => { setSelectedTemplate(previewTemplate); setPreviewTemplate(null); setPreviewData(null); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                使用此模板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
