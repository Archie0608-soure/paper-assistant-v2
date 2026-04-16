'use client';
import mammoth from "mammoth";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Scale, ChevronLeft, CheckCircle, Loader2, AlertCircle, Download, Edit3, Sparkles, FileText, X } from 'lucide-react';

interface Chapter {
  title: string;
  level: number;
  content: string;
  isReference?: boolean;
  status?: 'pending' | 'processing' | 'done';
  processedContent?: string;
  selected?: boolean;
}

type View = 'input' | 'chapters';

// 处理类型: doc=文档上传, text=直接文本
type ProcessType = 'doc' | 'text';

export default function ReducePage() {
  const [view, setView] = useState<View>('input');
  const [processType, setProcessType] = useState<ProcessType>('doc');
  const [lang, setLang] = useState<'chinese' | 'english'>('chinese');
  const [platform, setPlatform] = useState('zhiwang');
  const [mode, setMode] = useState<'plagiarism' | 'ai' | 'both'>('both');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fileName, setFileName] = useState('');
  const [inputText, setInputText] = useState('');  // 文本处理模式的输入
  const [parsingDoc, setParsingDoc] = useState(false);  // 文档解析中（输入区域）
  const [justParsed, setJustParsed] = useState(false);  // 刚解析完（短暂显示进度消失）
  const [showPaperSelector, setShowPaperSelector] = useState(false);  // 显示论文选择器
  const [paperList, setPaperList] = useState<any[]>([]);  // 论文列表
  const [loadingPapers, setLoadingPapers] = useState(false);

  // DOCX 降AI专用状态（不走本地切分，直接走官方SpeedAI）
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [docxStep, setDocxStep] = useState<'idle' | 'confirm' | 'processing' | 'done' | 'error'>('idle');
  const [docxSessionId, setDocxSessionId] = useState('');
  const [docxDocId, setDocxDocId] = useState('');
  const [docxCost, setDocxCost] = useState<number | null>(null);
  const [docxCharCount, setDocxCharCount] = useState(0);
  const [docxProgress, setDocxProgress] = useState(0);
  const [docxStatusMsg, setDocxStatusMsg] = useState('');
  const [docxError, setDocxError] = useState('');
  const [docxDownloadUrl, setDocxDownloadUrl] = useState('');
  const [docxDownloadName, setDocxDownloadName] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  // 平台选项（语言联动）
  const platformOptions = lang === 'chinese'
    ? [
        { id: 'zhiwang', label: '知网' },
        { id: 'vip', label: '维普' },
        { id: 'gezida', label: '格子达' },
        { id: 'daya', label: '大雅' },
        { id: 'wanfang', label: '万方' },
      ]
    : [
        { id: 'zhiwang', label: '知网' },
        { id: 'vip', label: '维普' },
        { id: 'gezida', label: '格子达' },
        { id: 'turnitin', label: 'Turnitin' },
      ];

  // 语言切换时重置平台选择
  const handleLangChange = (newLang: 'chinese' | 'english') => {
    setLang(newLang);
    setPlatform(newLang === 'chinese' ? 'zhiwang' : 'zhiwang');
  };
  const [accountData, setAccountData] = useState<any>(null);
  // 文本处理模式：直接降重/降AI的结果
  const [textResult, setTextResult] = useState<string>('');
  const [textProcessing, setTextProcessing] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  // step: 'idle' | 'step1' | 'step2' | 'done'
  const [step, setStep] = useState<'idle' | 'step1' | 'step2' | 'done'>('idle');

  useEffect(() => {
    fetch('/api/account', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setAccountData(d))
      .catch(() => {});
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      alert('仅支持 .docx 格式（Word 2007+），请将文档另存为 .docx 格式后重试');
      e.target.value = '';
      return;
    }

    // DOCX 直接走 SpeedAI 官方流程：先算费用
    setDocxFile(file);
    setDocxStep('idle');
    setDocxError('');
    setDocxDownloadUrl('');
    setParsingDoc(true);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('lang', lang);
    fd.append('platform', platform);

    try {
      const res = await fetch('/api/ai/reduce-docx/cost', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');

      setDocxSessionId(data.sessionId);
      setDocxCost(data.cost);
      setDocxCharCount(data.charCount || 0);
      setDocxStep('confirm');
      setParsingDoc(false);
    } catch (err: any) {
      setDocxStep('error');
      setDocxError(err.message || '提交失败，请稍后重试');
      setParsingDoc(false);
    }

    e.target.value = '';
  };

  // 确认开始 DOCX 处理
  const handleDocxStart = async () => {
    if (!docxFile || !docxSessionId) return;
    setDocxStep('processing');
    setDocxProgress(5);
    setDocxStatusMsg('正在提交文档...');
    setDocxError('');

    try {
      const res = await fetch('/api/ai/reduce-docx/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: docxSessionId, lang, platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '启动处理失败');

      setDocxDocId(data.docId);
      setDocxProgress(10);
      setDocxStatusMsg('已提交，等待处理...');
      subscribeDocxProgress(data.docId);
    } catch (err: any) {
      setDocxStep('error');
      setDocxError(err.message || '启动失败');
    }
  };

  // DOCX SSE 订阅进度
  const subscribeDocxProgress = (docId: string) => {
    const es = new EventSource(`/api/ai/reduce-docx/progress?doc_id=${encodeURIComponent(docId)}`);
    eventSourceRef.current = es;

    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const t = msg.type;

        if (t === 'connected') { setDocxStatusMsg('已连接，等待处理...'); return; }
        if (t === 'ping' || t === 'pong') return;

        if (t === 'progress') {
          const p = Math.round((msg.progress || 0) * 0.8 + 10);
          setDocxProgress(Math.min(p, 90));
          setDocxStatusMsg(msg.stage || `处理中... ${Math.round(msg.progress || 0)}%`);
        }
        if (t === 'stage') { setDocxStatusMsg(msg.stage || '处理中...'); }
        if (t === 'need_pay') {
          es.close(); setDocxStep('error'); setDocxError('点数不足，请充值后重试');
        }
        if (t === 'error') {
          es.close(); setDocxStep('error'); setDocxError(msg.error || '处理失败');
        }
        if (t === 'completed') {
          es.close();
          eventSourceRef.current = null;
          setDocxProgress(85);
          setDocxStatusMsg('处理完成，正在下载...');
          downloadDocxFile(docId).then(({ url, name }) => {
            setDocxDownloadUrl(url);
            setDocxDownloadName(name);
            setDocxStep('done');
            setDocxProgress(100);
            setDocxStatusMsg('处理完成！');
          }).catch((err: any) => {
            setDocxStep('error');
            setDocxError(err.message || '文件下载失败');
          });
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setDocxStatusMsg('连接中断，切换为轮询...');
      pollDocxFallback(docId);
    };
  };

  // DOCX 轮询 fallback
  const pollDocxFallback = async (docId: string) => {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const fd = new FormData();
        fd.append('user_doc_id', docId);
        const res = await fetch(`https://api3.speedai.chat/v1/docx/status`, { method: 'POST', body: fd });
        const data = await res.json();
        setDocxProgress(Math.min(10 + Math.round(i / 120 * 75), 85));
        setDocxStatusMsg(`处理中... ${data.progress || Math.round(i / 120 * 100)}%`);
        if (data.status === 'completed') {
          setDocxProgress(85);
          downloadDocxFile(docId).then(({ url, name }) => {
            setDocxDownloadUrl(url); setDocxDownloadName(name);
            setDocxStep('done'); setDocxProgress(100); setDocxStatusMsg('处理完成！');
          });
          return;
        }
        if (data.status === 'error') { setDocxStep('error'); setDocxError(data.error || '处理失败'); return; }
        if (data.status === 'need_pay') { setDocxStep('error'); setDocxError('点数不足'); return; }
      } catch {}
    }
    setDocxStep('error'); setDocxError('处理超时');
  };

  // 下载 DOCX 文件
  const downloadDocxFile = async (docId: string): Promise<{ url: string; name: string }> => {
    if (!docxFile) throw new Error('文件丢失');
    const outName = docxFile.name.replace(/\.(docx|doc)$/i, '_降AI.docx');
    const fd = new FormData();
    fd.append('user_doc_id', docId);
    fd.append('file_name', outName.replace(/\.docx$/, ''));
    const res = await fetch('/api/ai/reduce-docx/download', { method: 'POST', body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '下载失败');
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), name: outName };
  };

  const handleDocxDownload = () => {
    if (!docxDownloadUrl) return;
    const a = document.createElement('a');
    a.href = docxDownloadUrl;
    a.download = docxDownloadName;
    a.click();
  };

  // 从已生成论文选择
  const handleSelectPaper = async () => {
    if (paperList.length > 0) { setShowPaperSelector(true); return; }
    setLoadingPapers(true);
    setShowPaperSelector(true);
    try {
      const res = await fetch('/api/papers/list', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPaperList(data.papers || []);
    } catch (err: any) {
      alert('加载论文列表失败: ' + err.message);
      setShowPaperSelector(false);
    } finally {
      setLoadingPapers(false);
    }
  };

  // 选择一篇论文后加载其章节
  const handleLoadPaper = async (paper: any) => {
    setShowPaperSelector(false);
    setFileName(paper.title);
    setJustParsed(true);
    setView('chapters');
    setTimeout(() => setJustParsed(false), 2500);

    // chapters 直接用 paper.chapters
    const chapters = paper.chapters.map((ch: any, i: number) => ({
      title: ch.title,
      level: ch.level || 1,
      content: ch.content || '',
      isReference: false,
      status: 'pending' as const,
      selected: true,
    }));
    setChapters(chapters);
  };

  // 文本处理模式：直接对文本降重/降AI（不经过章节解析）
  const handleTextSubmit = async () => {
    const text = inputText.trim();
    if (!text) { alert('请输入要处理的文本'); return; }
    if (text.length < 50) { alert('文本内容太少，至少需要50字'); return; }

    setTextProcessing(true);
    setTextResult('');

    try {
      const res = await Promise.race([
        fetch('/api/ai/reduce', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, platform, mode, language: lang }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 120000)),
      ]) as Response;

      let data: any;
      try { data = await res.json(); }
      catch { throw new Error('服务器返回了无效响应，请稍后重试'); }

      if (!res.ok) throw new Error(data?.error || '处理失败');

      // 提取结果
      let raw = data.deaid || data.reduced || data.result || '';
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw.trim());
          raw = parsed.rewrite || parsed.result || parsed.text || raw;
        } catch { /* keep raw */ }
      }
      if (typeof raw !== 'string') raw = String(raw);

      setTextResult(raw);
      // 刷新余额
      fetch('/api/account', { credentials: 'include' })
        .then(r => r.json()).then(d => { if (!d.error) setAccountData(d); }).catch(() => {});
    } catch (err: any) {
      if (err.message === 'TIMEOUT') {
        alert('处理超时（超过120秒），请尝试缩短文本或稍后重试');
      } else {
        alert(err.message || '处理失败，请稍后重试');
      }
    } finally {
      setTextProcessing(false);
    }
  };

  const handleProcessChapter = async (idx: number) => {
    const ch = chapters[idx];
    if (ch.status === 'done' || ch.isReference) return;
    setChapters(prev => prev.map((c, i) => i === idx ? { ...c, status: 'processing' } : c));
    try {
      // Call text-based reduce API directly - no file needed
      const res = await fetch('/api/ai/reduce', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ch.content, platform, mode, language: lang }),
      });
      let data: any;
      try { data = await res.json(); }
      catch { throw new Error('服务器返回了无效响应，请稍后重试'); }
      if (!res.ok) throw new Error(data?.error || '处理失败');

      // 兼容多种响应格式，提取纯文本
      let raw = data.deaid || data.reduced || data.result || '';
      // 如果是 stringified JSON（如 '{"rewrite":"...","code":200}'），尝试解析
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            // 提取常见的 rewrite / result / text 字段
            raw = parsed.rewrite || parsed.result || parsed.text || parsed.reduced || parsed.deaid || raw;
          } catch { /* keep raw */ }
        }
      }
      const resultText = typeof raw === 'string' ? raw : ch.content;
      setChapters(prev => prev.map((c, i) => i === idx ? { ...c, status: 'done', processedContent: resultText } : c));
      // 处理完成后刷新余额显示
      fetch('/api/account', { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (!d.error) setAccountData(d); })
        .catch(() => {});
    } catch (err: any) {
      setChapters(prev => prev.map((c, i) => i === idx ? { ...c, status: 'pending' } : c));
      alert(`"${ch.title}" 处理失败: ${err.message}`);
    }
  };

  const handleProcessAll = async () => {
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].status === 'pending' && !chapters[i].isReference) {
        await handleProcessChapter(i);
      }
    }
  };

  // 一键处理所有已勾选章节（并行）
  const handleProcessSelected = async () => {
    const targets = chapters.filter(c => !c.isReference && c.status !== 'done' && c.selected);
    if (targets.length === 0) { alert('请先勾选要处理的章节'); return; }
    // 并行处理所有选中章节
    const promises = targets.map(ch => {
      const idx = chapters.indexOf(ch);
      return handleProcessChapter(idx);
    });
    await Promise.all(promises);
  };

  // 全选 / 取消全选（排除参考文献）
  const toggleSelectAll = () => {
    const selectable = chapters.filter(c => !c.isReference);
    const allSelected = selectable.every(c => c.selected);
    setChapters(prev => prev.map(c => c.isReference ? c : { ...c, selected: !allSelected }));
  };

  const toggleSelect = (idx: number) => {
    setChapters(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  };

  const handleDownload = async () => {
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
      const children: any[] = [];
      const levelMap: any = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
      for (const ch of chapters) {
        if (ch.isReference) continue;
        const content = ch.processedContent || ch.content;
        children.push(new Paragraph({ heading: levelMap[ch.level] || HeadingLevel.HEADING_1, children: [new TextRun({ text: ch.title, bold: true })] }));
        for (const p of content.split('\n').filter(Boolean)) {
          children.push(new Paragraph({ children: [new TextRun({ text: p })] }));
        }
      }
      const doc = new Document({ sections: [{ children }] });
      const buffer = await Packer.toBuffer(doc);
      const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = '降重论文.docx'; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('下载失败'); }
  };

  const doneCount = chapters.filter(c => c.status === 'done' && !c.isReference).length;
  const totalCount = chapters.filter(c => !c.isReference).length;
  const selectedChapters = chapters.filter(c => c.selected && !c.isReference && c.status !== 'done');
  const selectedCount = selectedChapters.length;
  // 费率：降重/降AI单选=4金币/百字符，降重降AI双选=6金币/百字符
  const rate = mode === 'both' ? 6 / 100 : 4 / 100;
  const estimatedTotal = selectedChapters.reduce((sum, c) => sum + Math.ceil(c.content.length * rate), 0);
  const modeLabel = mode === 'plagiarism' ? '降重' : mode === 'ai' ? '降AI' : '降重降AI';
  const allDone = totalCount > 0 && doneCount === totalCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-100 via-orange-50 to-emerald-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          {view === 'chapters' ? (
            <button onClick={() => setView('input')} className="text-sm text-slate-500 hover:text-indigo-600">← 上传文档</button>
          ) : (
            <a href="/" className="text-sm text-slate-500 hover:text-indigo-600">← 返回首页</a>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-slate-900">降重降AI</span>
            {mode === 'both' && <span className="ml-1 px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs rounded-full font-bold">双降</span>}
          </div>
          <div className="flex-1" />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm">
              <span className="text-indigo-600 font-medium">{accountData?.balance ?? '—'}</span>
              <span className="text-indigo-500 text-xs">金币</span>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-500">
                  <div className="text-white font-semibold text-sm">{accountData?.email || accountData?.phone || '用户'}</div>
                  <div className="text-white/80 text-xs mt-0.5">余额: {accountData?.balance ?? 0} 金币</div>
                </div>
                <div className="p-2">
                  <a href="/topup" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-xl font-medium">充值余额</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {view === 'input' ? (
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">📄 论文降重 · 降AI检测</h1>
            <p className="text-slate-500 mb-6">上传Word文档或直接粘贴文本，AI智能降低论文重复率和AI生成率</p>

            {/* 处理类型切换 */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-3">处理方式</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setProcessType('doc')}
                  className={`p-4 rounded-2xl border-2 text-center transition-all ${processType === 'doc' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="text-2xl mb-1">📄</div>
                  <div className={`font-bold ${processType === 'doc' ? 'text-indigo-600' : 'text-slate-700'}`}>文档处理</div>
                  <div className="text-xs text-slate-400 mt-1">上传Word文档，AI章节拆分</div>
                </button>
                <button onClick={() => setProcessType('text')}
                  className={`p-4 rounded-2xl border-2 text-center transition-all ${processType === 'text' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="text-2xl mb-1">📝</div>
                  <div className={`font-bold ${processType === 'text' ? 'text-indigo-600' : 'text-slate-700'}`}>文本处理</div>
                  <div className="text-xs text-slate-400 mt-1">直接粘贴论文文本</div>
                </button>
              </div>
            </div>

            {/* 解析进度提示 */}
            {parsingDoc && (
              <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-indigo-700">正在解析文档...</div>
                  <div className="text-xs text-indigo-500 mt-0.5">AI 正在识别章节结构，请稍候（通常5-15秒）</div>
                </div>
              </div>
            )}

            {/* 文本输入区（文本处理模式） */}
            {processType === 'text' && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">粘贴论文内容</label>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="请将论文内容粘贴于此，建议至少200字以获得更好的处理效果..."
                  rows={10}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-400 focus:ring-0 focus:outline-none resize-none text-slate-700 text-sm placeholder:text-slate-400"
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-slate-400">{inputText.length} 字</div>
                  <button onClick={handleTextSubmit}
                    disabled={textProcessing || inputText.trim().length < 50}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl text-sm font-semibold shadow hover:shadow-lg disabled:opacity-50 flex items-center gap-2">
                    {textProcessing ? <><Loader2 className="w-4 h-4 animate-spin" />处理中...</> : <><Sparkles className="w-4 h-4" />开始处理</>}
                  </button>
                </div>

                {/* 文本处理结果展示 */}
                {textResult && (
                  <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-green-700">处理结果</span>
                      <button onClick={() => { navigator.clipboard.writeText(textResult); alert('已复制到剪贴板'); }}
                        className="text-xs px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600">复制全文</button>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto">{textResult}</div>
                  </div>
                )}
              </div>
            )}

            {/* 模式选择 */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-3">处理模式</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'plagiarism', label: '单降重', desc: '降低重复率', color: 'blue' },
                  { id: 'ai', label: '单降AI', desc: '降低AI率', color: 'purple' },
                  { id: 'both', label: '降重降AI', desc: '双重处理', color: 'orange' },
                ].map(m => (
                  <button key={m.id} onClick={() => setMode(m.id as any)}
                    className={`p-4 rounded-2xl border-2 text-center transition-all ${mode === m.id ? `border-${m.color}-500 bg-${m.color}-50` : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className={`text-lg font-bold ${mode === m.id ? `text-${m.color}-600` : 'text-slate-700'}`}>{m.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{m.desc}</div>
                    {m.id === 'both' && mode === 'both' && <div className="mt-1 text-xs text-orange-500 font-medium">推荐 ✓</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* 语言 */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">论文语言</label>
              <div className="flex gap-2">
                {[{ id: 'chinese', label: '中文论文' }, { id: 'english', label: '英文论文' }].map(l => (
                  <button key={l.id} onClick={() => handleLangChange(l.id as any)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${lang === l.id ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{l.label}</button>
                ))}
              </div>
            </div>

            {/* 平台 */}
            <div className="mb-8">
              <label className="block text-sm font-semibold text-slate-700 mb-2">检测平台</label>
              <div className="flex flex-wrap gap-2">
                {platformOptions.map(p => (
                  <button key={p.id} onClick={() => setPlatform(p.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${platform === p.id ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* 上传区（文档处理模式） */}
            {processType === 'doc' && (parsingDoc ? (
              <div className="border-2 border-dashed border-indigo-300 rounded-2xl p-10 text-center bg-indigo-50">
                <Loader2 className="w-8 h-8 mx-auto mb-3 text-indigo-500 animate-spin" />
                <div className="text-indigo-600 font-medium">正在分析文档...</div>
              </div>
            ) : docxStep === 'idle' ? (
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center hover:border-indigo-400 transition-colors">
                <input type="file" accept=".docx" onChange={handleFileUpload} className="hidden" id="doc-upload" />
                <label htmlFor="doc-upload" className="cursor-pointer">
                  <div className="text-5xl mb-3">📄</div>
                  <div className="text-slate-700 font-medium mb-1">点击上传 Word 文档</div>
                  <div className="text-slate-400 text-sm">支持 .docx 格式（Word 2007+）</div>
                </label>
              </div>
            ) : null)}

            {/* DOCX 费用确认 */}
            {processType === 'doc' && docxStep === 'confirm' && docxFile && (
              <div className="mt-4 p-5 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border-2 border-indigo-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-slate-800 text-lg">{docxFile.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{docxCharCount.toLocaleString()} 字符 · {lang === 'chinese' ? '中文' : '英文'} · {platform === 'zhiwang' ? '知网' : platform}</div>
                  </div>
                  <button onClick={() => { setDocxStep('idle'); setDocxFile(null); }}
                    className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-black text-indigo-600">{docxCost}</span>
                    <span className="text-slate-500 text-sm ml-1">金币</span>
                    <div className="text-xs text-slate-400 mt-0.5">按 {lang === 'chinese' ? '40' : '20'}/千字符计价</div>
                  </div>
                  <button onClick={handleDocxStart}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />开始处理
                  </button>
                </div>
              </div>
            )}

            {/* DOCX 处理进度 */}
            {processType === 'doc' && docxStep === 'processing' && (
              <div className="mt-4 p-5 bg-slate-50 rounded-2xl border-2 border-slate-200">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span className="font-medium text-slate-700">{docxStatusMsg}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${docxProgress}%` }} />
                </div>
                <div className="text-right text-sm text-slate-500 mt-1">{docxProgress}%</div>
              </div>
            )}

            {/* DOCX 完成下载 */}
            {processType === 'doc' && docxStep === 'done' && (
              <div className="mt-4 p-5 bg-green-50 rounded-2xl border-2 border-green-300 text-center">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
                <div className="font-bold text-green-700 mb-1">处理完成！</div>
                <div className="text-sm text-green-600 mb-4">{docxCharCount.toLocaleString()} 字符已降AI处理</div>
                <button onClick={handleDocxDownload}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-colors inline-flex items-center gap-2">
                  <Download className="w-4 h-4" />下载降AI文档
                </button>
                <button onClick={() => { setDocxStep('idle'); setDocxFile(null); setDocxDownloadUrl(''); }}
                  className="ml-3 px-4 py-3 border-2 border-slate-300 text-slate-600 font-medium rounded-2xl hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                  继续处理
                </button>
              </div>
            )}

            {/* DOCX 错误 */}
            {processType === 'doc' && docxStep === 'error' && (
              <div className="mt-4 p-5 bg-red-50 rounded-2xl border-2 border-red-300">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-red-700">{docxError || '处理失败'}</span>
                </div>
                <button onClick={() => { setDocxStep('idle'); setDocxFile(null); }}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium">重新上传</button>
              </div>
            )}

            {/* 从已生成论文选择 */}
            {processType === 'doc' && docxStep === 'idle' && !parsingDoc && (
              <div className="mt-3">
                <button onClick={handleSelectPaper}
                  className="w-full py-3 border-2 border-slate-300 rounded-2xl text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
                  {loadingPapers ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {loadingPapers ? '加载论文列表...' : '从已生成论文中选择'}
                </button>
              </div>
            )}

            {/* 提示 */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              {[
                { icon: '🔄', title: '智能改写', desc: '保持原意，显著降低重复率' },
                { icon: '🤖', title: 'AI痕迹消除', desc: '有效降低AIGC检测率' },
                { icon: '📊', title: '多平台适配', desc: '知网/维普/格子达/大雅/万方/Turnitin' },
                { icon: '✏️', title: '在线编辑', desc: '处理后可逐章人工润色' },
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
                  <span className="text-2xl">{tip.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{tip.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{tip.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 论文选择弹窗 */}
            {showPaperSelector && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-lg font-bold text-slate-800">选择论文</div>
                    <button onClick={() => setShowPaperSelector(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {paperList.length === 0 ? (
                      <div className="text-center py-10 text-slate-400">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <div className="text-sm">暂无已生成的论文</div>
                        <div className="text-xs mt-1">请先在一键生成页面生成论文</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {paperList.map(p => (
                          <button key={p.id}
                            onClick={() => handleLoadPaper(p)}
                            className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                            <div className="text-sm font-semibold text-slate-800 truncate">{p.title}</div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                              {p.major && <span>{p.major}</span>}
                              <span>{p.chapter_count} 个章节</span>
                              <span>{new Date(p.created_at).toLocaleDateString('zh-CN')}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 顶部信息栏 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-slate-800">{fileName || '文本内容'}</div>
                <div className="text-sm text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{chapters.length} 个章节 · {modeLabel} · 已勾选 {chapters.filter(c => c.selected && !c.isReference).length} 章</span>
                  {justParsed ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs">
                      <CheckCircle className="w-3 h-3" /> 章节解析完成，正在处理...
                    </span>
                  ) : parsingDoc ? (
                    <span className="flex items-center gap-1 text-indigo-500 text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" /> AI 解析中（预计5-15秒）...
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* 全选/取消全选 }*/}
                <button onClick={toggleSelectAll}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition flex items-center gap-1.5">
                  {chapters.filter(c => !c.isReference).every(c => c.selected) ? '☑' : '☐'} 全选
                </button>
                {/* 一键处理（处理所有未处理的）*/}
                <button onClick={handleProcessAll} disabled={doneCount === totalCount}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl text-sm font-semibold shadow hover:shadow-lg disabled:opacity-50 flex items-center gap-1.5">
                  {doneCount === totalCount ? <><CheckCircle className="w-4 h-4" />全部完成</> : <><Loader2 className="w-4 h-4 animate-spin" />一键处理</>}
                </button>
                {/* 处理选中 }*/}
                <button onClick={handleProcessSelected}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-semibold shadow hover:shadow-lg flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4" />处理选中
                </button>
                {selectedCount > 0 && (
                  <span className="px-3 py-2 bg-amber-50 text-amber-600 rounded-xl text-sm font-medium">
                    约 <strong>{estimatedTotal}</strong> 金币
                  </span>
                )}
                {allDone && (
                  <button onClick={handleDownload}
                    className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold shadow hover:shadow-lg flex items-center gap-1.5">
                    <Download className="w-4 h-4" />下载
                  </button>
                )}
              </div>
            </div>

            {/* 双步骤进度条 */}
            {totalCount > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">处理进度</span>
                  <span className="text-sm text-slate-500">{doneCount} / {totalCount} 章已完成</span>
                </div>
                <div className="flex gap-2 h-3 rounded-full overflow-hidden">
                  {/* 灰底 */}
                  <div className="flex-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${(doneCount / totalCount) * 100}%` }} />
                  </div>
                </div>
                {/* 步骤说明 */}
                <div className="flex gap-4 mt-2">
                  <span className={`text-xs flex items-center gap-1 ${mode === 'plagiarism' || mode === 'both' ? 'text-indigo-600' : 'text-slate-400'}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold ${mode === 'plagiarism' || mode === 'both' ? 'bg-indigo-500' : 'bg-slate-300'}`}>1</span>
                    降重
                  </span>
                  {mode === 'both' && (
                    <span className="text-xs flex items-center gap-1 text-purple-600">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold bg-purple-500">2</span>
                      降AI
                    </span>
                  )}
                  <span className="text-xs flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-3 h-3" />完成
                  </span>
                </div>
              </div>
            )}

            {/* 章节列表 */}
            <div className="space-y-3">
              {chapters.filter(c => !c.isReference).map((ch, idx) => (
                <div key={idx} className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all ${ch.selected ? 'border-indigo-300' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* 勾选框 */}
                    <input
                      type="checkbox"
                      checked={!!ch.selected}
                      onChange={() => toggleSelect(idx)}
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0 cursor-pointer"
                    />

                    {/* 状态图标 */}
                    {ch.status === 'done' ? (
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                    ) : ch.status === 'processing' ? (
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-slate-400">{idx + 1}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{ch.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{ch.content.length} 字</span>
                        <span className="text-amber-500 font-medium">{Math.ceil(ch.content.length * (mode === 'both' ? 6 / 100 : 4 / 100))} 金币</span>
                        {ch.status === 'done' ? <span className="text-green-500">✓ 已处理</span> : ch.status === 'processing' ? <span className="text-orange-500">处理中...</span> : <span className="text-slate-400">待处理</span>}
                      </div>
                    </div>

                    <button onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 flex-shrink-0">
                      {expandedIdx === idx ? '收起 ∧' : '展开 ∨'}
                    </button>
                    {ch.status !== 'processing' && (
                      <button onClick={() => handleProcessChapter(idx)}
                        className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 flex items-center gap-1">
                        {ch.status === 'done' ? '重新处理' : '处理'}
                      </button>
                    )}
                    {ch.status === 'done' && (
                      <button onClick={() => { setEditingIdx(idx); setEditContent(ch.processedContent || ch.content); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* 内容预览 */}
                  {expandedIdx === idx && !editingIdx && (
                    <div className="px-4 pb-3">
                      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 font-mono max-h-32 overflow-y-auto">
                        {ch.processedContent || ch.content}
                      </div>
                    </div>
                  )}

                  {/* 编辑器 */}
                  {editingIdx === idx && (
                    <div className="px-4 pb-4">
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                        className="w-full h-40 p-3 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="编辑处理后的内容..." />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => {
                          setChapters(prev => prev.map((c, i) => i === idx ? { ...c, processedContent: editContent } : c));
                          setEditingIdx(null);
                        }}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium">保存</button>
                        <button onClick={() => setEditingIdx(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs">取消</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
