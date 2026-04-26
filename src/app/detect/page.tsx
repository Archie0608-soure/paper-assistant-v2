'use client';
import { useState, useEffect, useRef } from 'react';
import { Brain, ArrowLeft, Loader2, Copy, AlertTriangle, Home, ShieldCheck, Coins, X, Sparkles, Zap, ChevronDown, ChevronUp, Upload, FileText, Download, Printer, FileBadge } from 'lucide-react';
import Link from 'next/link';

type SentenceLevel = 'high' | 'medium' | 'low';
type LabelColor = 'red' | 'yellow' | 'green';

interface SentenceResult {
  text: string;
  level: SentenceLevel;
  tag: string;
  color: LabelColor;
  reason: string;
}

interface DetectResult {
  ai: number;
  original: number;
  source: string;
  sentences: SentenceResult[];
  summary: { high: number; medium: number; low: number; total: number } | null;
}

export default function DetectPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [error, setError] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [reasonsExpanded, setReasonsExpanded] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [lang, setLang] = useState<'cn' | 'en'>('cn');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 各平台严格度：正数=比基准更严(加AI率)，负数=更松(减AI率)
  const allPlatforms: Record<string, { label: string; delta: number; desc: string; color: string }> = {
    // 中文平台
    'sim-zhiwang-cn': { label: '模拟知网',    delta: +6, desc: '最严格',  color: 'text-red-600' },
    'sim-dayan-cn':   { label: '模拟大雅',    delta: +3, desc: '较严格',  color: 'text-orange-600' },
    'sim-weipu-cn':   { label: '模拟维普',    delta:  0, desc: '标准严格', color: 'text-slate-600' },
    'sim-wanfang-cn': { label: '模拟万方',    delta: -4, desc: '较宽松',  color: 'text-green-600' },
    'sim-gezida-cn':  { label: '模拟格子达',  delta: -7, desc: '最宽松',  color: 'text-blue-600' },
    // 英文平台
    'sim-turnitin-en': { label: '模拟Turnitin', delta: +5, desc: '最严格',  color: 'text-red-600' },
    'sim-zhiwang-en': { label: '模拟知网(英)', delta: +3, desc: '较严格',  color: 'text-orange-600' },
    'sim-weipu-en':   { label: '模拟维普(英)', delta:  0, desc: '标准严格', color: 'text-slate-600' },
    'sim-gezida-en':  { label: '模拟格子达(英)', delta: -5, desc: '较宽松', color: 'text-blue-600' },
  };
  const [platform, setPlatform] = useState<string>('sim-zhiwang-cn');
  const platformOptions = Object.entries(allPlatforms)
    .filter(([key]) => key.endsWith(`-${lang}`))
    .map(([key, val]) => ({ key, ...val }));

  // 根据选择平台调整显示的AI率
  const currentPlatform = allPlatforms[platform];
  const displayAi = result ? Math.min(100, Math.max(0, result.ai + (currentPlatform?.delta ?? 0))) : null;
  const displayOrig = displayAi !== null ? 100 - displayAi : null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let text = '';
      if (ext === 'txt') {
        text = await file.text();
      } else if (ext === 'docx') {
        if (!(window as any).mammoth) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        const arrayBuffer = await file.arrayBuffer();
        const res = await (window as any).mammoth.extractRawText({ arrayBuffer });
        text = res.value;
      } else if (ext === 'pdf') {
        if (!(window as any).pdfjsLib) {
          await new Promise((resolve, reject) => {
            const s1 = document.createElement('script');
            s1.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            s1.onload = resolve;
            s1.onerror = reject;
            document.head.appendChild(s1);
          });
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((item: any) => item.str).join(' '));
        }
        text = pages.join('\n');
      } else {
        throw new Error('只支持 TXT、PDF、DOCX 格式');
      }
      text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!text.trim()) throw new Error('文件内容为空');
      if (text.length < 50) throw new Error('文件内容太少,至少50个字');
      setText(text);
      setUploadedFileName(file.name);
      setResult(null);
    } catch (err: any) {
      setError(err.message || '文件解析失败');
    } finally {
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const res = await fetch('/api/account', { credentials: 'include' });
        if (res.ok) setAccountData(await res.json());
      } catch {}
    };
    fetchAccount();
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDetect = async () => {
    if (!text.trim()) { setError('请输入要检测的文本'); return; }
    if (text.length < 50) { setError('文本至少需要50个字才能准确检测'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ai/detect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '检测失败');
      setResult(data);
    } catch (err: any) {
      setError(err.message || '检测失败,请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setText('');
    setResult(null);
    setError('');
    setUploadedFileName('');
  };

  const aiLevel = displayAi !== null
    ? displayAi >= 80 ? 'high'
      : displayAi >= 50 ? 'medium'
      : displayAi >= 20 ? 'low'
      : 'human'
    : null;

  const levelConfig = {
    high: { label: 'AI痕迹明显', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', icon: '🤖', desc: '这段文字极有可能是AI生成的,建议大幅修改' },
    medium: { label: 'AI特征较重', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', icon: '⚠️', desc: '这段文字包含较多AI生成特征,建议适当修改' },
    low: { label: '疑似AI特征', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', bar: 'bg-yellow-500', icon: '🤔', desc: '这段文字可能有少量AI辅助痕迹,但基本正常' },
    human: { label: '人类写作', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', bar: 'bg-green-500', icon: '✅', desc: '这段文字看起来是人类写作的,自然流畅' },
  };
  const config = aiLevel ? levelConfig[aiLevel] : null;

  const colorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', line: 'border-l-red-400', tag: '高AI' },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', line: 'border-l-yellow-400', tag: '疑似AI' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-700', line: 'border-l-green-400', tag: '人类写作' },
  };

  const handlePrintReport = () => {
    if (!result || displayAi === null) return;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const levelLabel: Record<string,string> = { high: 'AI痕迹明显', medium: 'AI特征较重', low: '疑似AI特征', human: '人类写作' };
    const aiTag = aiLevel ? levelLabel[aiLevel] : '';
    const pLabel = currentPlatform?.label ?? '';
    const pDelta = currentPlatform?.delta ?? 0;

    const sentencesHtml = result.sentences.map((s, i) => {
      const cm = colorMap[s.color];
      const numBg = { red: '#fee2e2', yellow: '#fef9c3', green: '#dcfce7' }[s.color];
      const numColor = { red: '#dc2626', yellow: '#ca8a04', green: '#16a34a' }[s.color];
      const bg = { red: '#fef2f2', yellow: '#fefce8', green: '#f0fdf4' }[s.color];
      const border = { red: '#fca5a5', yellow: '#fde047', green: '#86efac' }[s.color];
      return `<div style="display:flex;gap:12px;padding:10px 14px;border-radius:8px;border-left:4px solid ${border};background:${bg};margin-bottom:8px;">
        <div style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:${numBg};color:${numColor};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">${i+1}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;padding:1px 8px;border-radius:99px;background:${numBg};color:${numColor};">${s.tag}</span>
            <span style="font-size:12px;color:#9ca3af;">${s.reason}</span>
          </div>
          <div style="font-size:14px;line-height:1.7;color:#374151;">${s.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>
      </div>`;
    }).join('');

    const aiBg = displayAi >= 80 ? '#fef2f2' : displayAi >= 50 ? '#fff7ed' : displayAi >= 20 ? '#fefce8' : '#f0fdf4';
    const aiColor = displayAi >= 80 ? '#dc2626' : displayAi >= 50 ? '#ea580c' : displayAi >= 20 ? '#ca8a04' : '#16a34a';
    const origBg = displayOrig! >= 80 ? '#f0fdf4' : displayOrig! >= 50 ? '#fff7ed' : '#fefce8';
    const origColor = displayOrig! >= 80 ? '#16a34a' : displayOrig! >= 50 ? '#ea580c' : '#ca8a04';

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>AI率检测报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 24px; margin-bottom: 32px; }
    .title { font-size: 22px; font-weight: bold; color: #111827; margin-bottom: 6px; }
    .subtitle { font-size: 12px; color: #6b7280; }
    .meta { display: flex; justify-content: center; gap: 32px; margin-top: 14px; font-size: 13px; color: #374151; }
    .scores { display: flex; gap: 20px; margin-bottom: 28px; align-items: stretch; }
    .score-card { flex: 1; padding: 20px; border-radius: 12px; text-align: center; }
    .score-big { font-size: 44px; font-weight: bold; }
    .score-label { font-size: 12px; margin-top: 4px; }
    .divider { display: flex; align-items: center; font-size: 20px; color: #d1d5db; }
    .section-title { font-size: 14px; font-weight: bold; color: #374151; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
    .legend { display: flex; gap: 20px; margin-bottom: 16px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 5px; color: #6b7280; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    .summary-bar { display: flex; gap: 16px; padding: 12px 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 20px; font-size: 12px; color: #6b7280; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">📋 AI率检测报告</div>
    <div class="subtitle">Paper Assistant 智能检测平台 · ${pLabel}</div>
    <div class="meta">
      <span>🕐 检测时间:${dateStr}</span>
      <span>📝 文本字数:${text.length} 字</span>
      <span>🔍 基准引擎:腾讯云+DeepSeek${pDelta !== 0 ? `(${pDelta > 0 ? '+' : ''}${pDelta}% 平台调整)` : ''}</span>
    </div>
  </div>

  <div class="scores">
    <div class="score-card" style="background:${aiBg};">
      <div class="score-big" style="color:${aiColor};">${result.ai}%</div>
      <div class="score-label" style="color:${aiColor};">AI生成率</div>
      <div style="font-size:12px;margin-top:4px;color:#6b7280;">${aiTag}</div>
    </div>
    <div class="divider">/</div>
    <div class="score-card" style="background:${origBg};">
      <div class="score-big" style="color:${origColor};">${result.original}%</div>
      <div class="score-label" style="color:${origColor};">人类写作概率</div>
    </div>
  </div>

  <div class="section-title">📋 句子级AI特征分析</div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#f87171;"></div>高AI(明显AI生成特征)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#facc15;"></div>疑似AI(部分AI特征)</div>
    <div class="legend-item"><div class="legend-dot" style="background#4ade80;"></div>人类写作(自然流畅)</div>
  </div>

  ${result.summary ? `<div class="summary-bar">
    <span>共 ${result.summary.total} 句</span>
    <span style="color:#dc2626;">🤖 高AI ${result.summary.high} 句</span>
    <span style="color:#ca8a04;">⚠️ 疑似AI ${result.summary.medium} 句</span>
    <span style="color:#16a34a;">✅ 人类写作 ${result.summary.low} 句</span>
  </div>` : ''}

  <div class="sentences">
    ${sentencesHtml}
  </div>

  <div class="footer">
    本报告由 Paper Assistant 自动生成 · 仅供参考 · 检测结果不代表权威认定
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-xl hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Link>
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-slate-800">AI率检测</span>
          </div>
          <div className="flex items-center gap-3">
            {accountData && (
              <div className="flex items-center gap-1 text-sm text-amber-600">
                <Coins className="w-4 h-4" />
                <span className="font-medium">{accountData.balance ?? 0}</span>
              </div>
            )}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="p-2 rounded-xl hover:bg-slate-100 transition">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-indigo-600">{accountData?.phone?.slice(-2) || accountData?.email?.slice(0,1) || '?'}</span>
                </div>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
                  <Link href="/" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <Home className="w-4 h-4" />首页
                  </Link>
                  <Link href="/reduce" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <ShieldCheck className="w-4 h-4" />双降工具
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            想知道你的文字有多"假"?
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">AI率检测</h1>
          <p className="text-slate-500 text-sm">粘贴文字,精准检测AI生成内容概率(附句子级报告)</p>

          {/* 中英文 + 平台选择 */}
          <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
            {/* 语言切换 */}
            <div className="flex bg-slate-100 rounded-xl p-1 text-xs">
              <button
                onClick={() => { setLang('cn'); setPlatform('sim-zhiwang-cn'); }}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${lang === 'cn' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >🇨🇳 中文</button>
              <button
                onClick={() => { setLang('en'); setPlatform('sim-turnitin-en'); }}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${lang === 'en' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >🇬🇧 English</button>
            </div>

            {/* 平台选择 */}
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as any)}
              className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
            >
              {platformOptions.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 平台说明 */}
          {result && currentPlatform && (
            <div className={`inline-flex items-center gap-1.5 mt-2 text-xs ${currentPlatform.color}`}>
              <span>📐 当前结果已调整为「{currentPlatform.label}」风格</span>
              <span className="text-slate-400">({currentPlatform.delta > 0 ? '+' : ''}{currentPlatform.delta}% 严格度)</span>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-slate-700">输入文本</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{text.length} 字</span>
              {uploadedFileName && (
                <span className="flex items-center gap-1 text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                  <FileText className="w-3 h-3" />{uploadedFileName}
                </span>
              )}
              {text && (
                <button onClick={handleReset} className="text-xs text-slate-400 hover:text-red-500 transition">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 mb-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg cursor-pointer hover:bg-indigo-100 transition">
              {fileLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {fileLoading ? '解析中...' : '上传文件'}
              <input ref={fileInputRef} type="file" accept=".txt,.pdf,.docx" onChange={handleFileUpload} className="hidden" />
            </label>
            <span className="text-xs text-slate-400 self-center">支持 TXT、PDF、DOCX</span>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="粘贴你要检测的文字,比如从豆包、ChatGPT、Claude等AI工具复制出来的内容..."
            className="w-full h-48 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
          {error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* 检测按钮 */}
        <button
          onClick={handleDetect}
          disabled={loading || !text.trim()}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-6"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />AI率检测中,请稍候...</>
          ) : (
            <><Brain className="w-4 h-4" />开始检测</>
          )}
        </button>

        {/* 加载状态 */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-3 px-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <div className="text-left">
                <div className="text-sm font-medium text-slate-700">正在分析中...</div>
                <div className="text-xs text-slate-400 mt-0.5">第一步:腾讯云AI率检测 → 第二步:句子级特征分析</div>
              </div>
            </div>
          </div>
        )}

        {/* 结果 */}
        {!loading && result && config && (
          <div className="space-y-4 animate-in">
            {/* 核心分数 */}
            <div className={`${config.bg} border ${config.border} rounded-2xl p-6 text-center`}>
              <div className="text-6xl mb-3">{config.icon}</div>
              <div className={`text-4xl font-bold ${config.color} mb-2`}>
                {displayAi}%
                <span className="text-lg font-normal text-slate-500 ml-1">AI率</span>
              </div>
              <div className="text-sm text-slate-500 mb-3">
                人类写作概率:{displayOrig}%
              </div>
              <div className="w-full h-3 bg-white rounded-full overflow-hidden mb-2">
                <div className={`h-full ${config.bar} rounded-full transition-all duration-1000`} style={{ width: `${displayAi}%` }} />
              </div>
              <div className="text-xs text-slate-400">← 人类写作  AI生成 →</div>
              <div className={`mt-3 text-sm font-medium ${config.color}`}>{config.label}</div>
            </div>

            {/* 句子级分析 */}
            {result.sentences && result.sentences.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">📋 句子级AI特征分析</h3>
                    <p className="text-xs text-slate-400 mt-0.5">基于腾讯云AI率 + DeepSeek语义分析</p>
                  </div>
                  {/* 图例 */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-400"></span>
                      <span className="text-slate-600">高AI</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                      <span className="text-slate-600">疑似AI</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-green-400"></span>
                      <span className="text-slate-600">人类写作</span>
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {result.sentences.map((sentence, i) => {
                    const cm = colorMap[sentence.color];
                    const numColors = { red: 'bg-red-100 text-red-600', yellow: 'bg-yellow-100 text-yellow-700', green: 'bg-green-100 text-green-600' };
                    return (
                      <div key={i} className={`flex gap-3 p-3 rounded-xl border-l-4 ${cm.line} ${cm.bg}`}>
                        <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${numColors[sentence.color]}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cm.badge}`}>{sentence.tag}</span>
                            <span className="text-xs text-slate-400">{sentence.reason}</span>
                          </div>
                          <p className={`text-sm leading-relaxed ${cm.text}`}>{sentence.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {result.summary && (
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-4 text-xs text-slate-500">
                    <span>共 {result.summary.total} 句</span>
                    <span className="text-red-500">🤖 高AI {result.summary.high} 句</span>
                    <span className="text-yellow-500">⚠️ 疑似AI {result.summary.medium} 句</span>
                    <span className="text-green-500">✅ 人类写作 {result.summary.low} 句</span>
                  </div>
                )}
              </div>
            )}

            {/* 解读指南 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-700 mb-3">📊 AI率解读</h3>
              <div className="space-y-2">
                {[
                  { range: '0-20%', label: '基本人类写作', color: 'bg-green-100 text-green-700', desc: '放心提交,基本不会触发检测' },
                  { range: '20-50%', label: '可能有AI辅助', color: 'bg-yellow-100 text-yellow-700', desc: '建议适当润色修改' },
                  { range: '50-80%', label: 'AI特征较重', color: 'bg-orange-100 text-orange-700', desc: '需要大幅修改或重写' },
                  { range: '80-100%', label: '明显AI生成', color: 'bg-red-100 text-red-700', desc: '极大概率被检测出,建议完全重写' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-20 text-center px-2 py-1 rounded-lg text-xs font-bold ${item.color}`}>{item.range}</div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">{item.label}</div>
                      <div className="text-xs text-slate-400">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 降AI建议 */}
            {displayAi! >= 30 && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-indigo-700 mb-2 flex items-center gap-2">
                  💡 降低AI率的建议
                </h3>
                <ul className="space-y-1.5 text-sm text-indigo-600">
                  <li>• 使用「双降工具」一键降低AI率</li>
                  <li>• 手动加入个人理解和表达习惯</li>
                  <li>• 补充具体案例、数据、个人经历</li>
                  <li>• 调整句式,增加变化和自然停顿</li>
                </ul>
                <Link href="/reduce" className="mt-3 inline-flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition">
                  立即降AI →
                </Link>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition">
                🆕 重新检测
              </button>
              <button onClick={handlePrintReport} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                <FileBadge className="w-4 h-4" />生成检测报告
              </button>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="mt-6 text-center text-sm text-slate-400">
            <p>💡 豆包/ChatGPT/Claude 生成的内容都可以检测</p>
            <p className="mt-1">文本越长,分析越准确(最多8000字)</p>
          </div>
        )}
      </div>
    </div>
  );
}
