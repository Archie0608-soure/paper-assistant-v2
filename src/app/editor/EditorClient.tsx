'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, FileDown, Loader2, Check, Plus, Trash2, BookOpen, Wand2, RefreshCw, X } from 'lucide-react';
import { PAPER_FORMATS, getFormat } from '@/lib/paper-formats';

interface Chapter {
  number: number;
  title: string;
  content: string;
  written: boolean;
  content_generated?: string;
}

interface SelectionState {
  text: string;
  start: number;
  end: number;
  top: number;
  left: number;
}

function EditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paperId = searchParams.get('id');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [formatLabel, setFormatLabel] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  const loadPaper = useCallback(async () => {
    if (!paperId) { setLoading(false); return; }
    try {
      const res = await fetch('/api/papers/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: paperId }),
      });
      const data = await res.json();
      if (!res.ok || !data.paper) { router.push('/'); return; }
      const p = data.paper;
      setTitle(p.title || '');

      let loadedChapters: Chapter[] = [];
      if (typeof p.chapters === 'string') {
        try {
          const parsed = JSON.parse(p.chapters);
          if (Array.isArray(parsed) && parsed[0]?.title) {
            loadedChapters = parsed.map((c: any, i: number) => ({
              number: i + 1,
              title: c.title || `第${toChinese(i + 1)}章`,
              content: c.content || c.content_generated || '',
              written: c.written || false,
              content_generated: c.content_generated || c.content || '',
            }));
          }
        } catch { /* ignore */ }
        if (!loadedChapters.length) {
          loadedChapters = [{ number: 1, title: '全文', content: p.chapters, written: true, content_generated: p.chapters }];
        }
      } else if (Array.isArray(p.chapters)) {
        loadedChapters = p.chapters.map((c: any, i: number) => ({
          number: i + 1,
          title: c.title || `第${toChinese(i + 1)}章`,
          content: c.content || c.content_generated || '',
          written: c.written || false,
          content_generated: c.content_generated || c.content || '',
        }));
      }

      if (!loadedChapters.length) {
        const fmt = getFormat(p.degree || 'bachelor');
        loadedChapters = fmt.chapters.filter(c => c.required).map((c, i) => ({
          number: i + 1, title: c.title, content: '', written: false,
        }));
      }

      setChapters(loadedChapters);
      setActiveChapter(0);
      setWordCount(countWords(loadedChapters[0]?.content || ''));
      setFormatLabel(p.degree ? PAPER_FORMATS[p.degree]?.label || '本科' : '本科');
    } catch { router.push('/'); }
    finally { setLoading(false); }
  }, [paperId, router]);

  useEffect(() => { loadPaper(); }, [loadPaper]);

  const savePaper = useCallback(async (updatedChapters?: Chapter[], updatedTitle?: string) => {
    if (!paperId) return;
    setSaving(true);
    try {
      const chaptersToSave = updatedChapters || chapters;
      const titleToSave = updatedTitle !== undefined ? updatedTitle : title;
      await fetch('/api/papers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: paperId,
          title: titleToSave,
          chapters: chaptersToSave.map(c => ({
            number: c.number,
            title: c.title,
            content: c.content,
            written: c.written || c.content.length > 0,
            content_generated: c.content_generated || c.content,
          })),
        }),
      });
      setLastSaved(new Date());
    } catch (err) { console.error('Save failed:', err); }
    finally { setSaving(false); }
  }, [paperId, chapters, title]);

  useEffect(() => {
    if (!paperId || chapters.length === 0) return;
    const timer = setTimeout(() => savePaper(), 2000);
    return () => clearTimeout(timer);
  }, [chapters, title, savePaper, paperId]);

  const updateChapter = (idx: number, content: string) => {
    const updated = [...chapters];
    updated[idx] = { ...updated[idx], content, written: content.length > 0 };
    setChapters(updated);
    setWordCount(countWords(content));
  };

  const updateChapterTitle = (idx: number, t: string) => {
    const updated = [...chapters];
    updated[idx] = { ...updated[idx], title: t };
    setChapters(updated);
  };

  const addChapter = () => {
    const newChapter: Chapter = { number: chapters.length + 1, title: `第${toChinese(chapters.length + 1)}章`, content: '', written: false };
    setChapters([...chapters, newChapter]);
    setActiveChapter(chapters.length);
  };

  const deleteChapter = (idx: number) => {
    if (chapters.length <= 1) return;
    const updated = chapters.filter((_, i) => i !== idx);
    updated.forEach((c, i) => (c.number = i + 1));
    setChapters(updated);
    setActiveChapter(Math.max(0, idx - 1));
  };

  // 选中文字后弹出工具栏
  const handleTextSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value } = ta;
    if (selectionStart === selectionEnd) {
      setSelection(null);
      return;
    }
    const text = value.slice(selectionStart, selectionEnd).trim();
    if (!text) { setSelection(null); return; }

    // 计算光标位置
    const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 28;
    const textBefore = value.slice(0, selectionStart);
    const lines = textBefore.split('\n').length;
    const top = lines * lineHeight + 60;
    const left = Math.min(200, ta.offsetWidth - 240);

    setSelection({ text, start: selectionStart, end: selectionEnd, top, left });
  };

  // AI处理（润色/扩写选中文字）
  const handleAiAction = async (action: 'polish' | 'expand') => {
    if (!selection) return;
    const ta = textareaRef.current;
    const active = chapters[activeChapter];
    if (!ta || !active) return;

    const { text, start, end } = selection;
    const fullText = ta.value;
    const beforeText = fullText.slice(0, start);
    const afterText = fullText.slice(end);

    // 找到选中文字所在段落的上下文
    const beforePara = beforeText.lastIndexOf('\n\n') >= 0
      ? beforeText.slice(beforeText.lastIndexOf('\n\n') + 2)
      : beforeText;
    const afterPara = afterText.indexOf('\n\n') >= 0
      ? afterText.slice(0, afterText.indexOf('\n\n'))
      : afterText;

    setAiLoading(true);
    setAiAction(action);

    try {
      const res = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text,
          context: { before: beforePara.slice(-500), after: afterPara.slice(0, 500) },
          chapterTitle: active.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI处理失败');

      // 用AI结果替换选中文字
      const newContent = fullText.slice(0, start) + data.result + fullText.slice(end);
      updateChapter(activeChapter, newContent);

      // 重新设置光标到处理后位置
      setTimeout(() => {
        const newPos = start + data.result.length;
        ta.setSelectionRange(newPos, newPos);
        ta.focus();
      }, 50);

      setSelection(null);
    } catch (err: any) {
      alert(err.message || 'AI处理失败，请重试');
    } finally {
      setAiLoading(false);
      setAiAction(null);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || '导出失败'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${title || '论文'}.docx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { alert(err.message || '导出失败'); }
  };

  const active = chapters[activeChapter];
  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.content), 0);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 sticky top-0 z-20">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition">
          <ArrowLeft className="w-5 h-5" /><span className="text-sm">返回</span>
        </button>
        <div className="flex-1">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-bold text-slate-900 bg-transparent border-none outline-none w-full" placeholder="论文标题" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BookOpen className="w-4 h-4" /><span>{formatLabel}</span>
        </div>
        <div className="text-sm text-slate-500">{totalWords.toLocaleString()} 字</div>
        <button onClick={() => savePaper()} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : lastSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span className="text-sm">{saving ? '保存中...' : lastSaved ? '已保存' : '保存'}</span>
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <FileDown className="w-4 h-4" /><span className="text-sm">导出</span>
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：章节列表 */}
        <aside className="w-72 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700 text-sm">论文章节</h2>
            <p className="text-xs text-slate-400 mt-1">{chapters.length} 章 · {totalWords.toLocaleString()} 字</p>
          </div>
          <div className="divide-y divide-slate-100">
            {chapters.map((ch, idx) => (
              <div key={idx}>
                <button onClick={() => { setActiveChapter(idx); setWordCount(countWords(ch.content)); setSelection(null); }}
                  className={`w-full text-left px-4 py-3 transition ${activeChapter === idx ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${activeChapter === idx ? 'text-indigo-700' : 'text-slate-700'}`}>{ch.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {countWords(ch.content).toLocaleString()} 字
                        {ch.content_generated && !ch.content && ' · AI生成'}
                      </p>
                    </div>
                    {ch.content_generated && !ch.content && (
                      <span className="flex-shrink-0 text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">AI</span>
                    )}
                  </div>
                </button>
              </div>
            ))}
          </div>
          <div className="p-4">
            <button onClick={addChapter}
              className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition">
              <Plus className="w-4 h-4" />添加章节
            </button>
          </div>
        </aside>

        {/* 右侧：编辑器 */}
        <main className="flex-1 overflow-y-auto relative">
          {active ? (
            <div className="max-w-3xl mx-auto p-8">
              {/* 章节标题 */}
              <div className="mb-6">
                <input type="text" value={active.title} onChange={(e) => updateChapterTitle(activeChapter, e.target.value)}
                  className="text-2xl font-bold text-slate-900 bg-transparent border-none outline-none w-full" placeholder="章节标题" />
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                  <span>{formatLabel}</span><span>·</span><span>{wordCount.toLocaleString()} 字</span>
                </div>
              </div>

              {/* AI 加载动画 */}
              {aiLoading && (
                <div className="mb-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full border-2 border-purple-200 flex items-center justify-center">
                      {aiAction === 'polish' ? <Wand2 className="w-5 h-5 text-purple-600" /> : <RefreshCw className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div className="absolute -inset-1 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-700">
                      {aiAction === 'polish' ? '✨ AI 润色中...' : '📝 AI 扩写中...'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {aiAction === 'polish' ? '正在优化文本表达，提升学术质量' : '正在结合上下文扩展论述深度'}
                    </p>
                    <div className="mt-2 h-1.5 bg-purple-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"
                        style={{ width: '60%' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* 编辑器 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
                <textarea
                  ref={textareaRef}
                  value={active.content}
                  onChange={(e) => { updateChapter(activeChapter, e.target.value); }}
                  onMouseUp={handleTextSelect}
                  onKeyUp={handleTextSelect}
                  onBlur={() => { setTimeout(() => setSelection(null), 200); }}
                  className="w-full min-h-screen max-h-screen overflow-y-auto p-6 text-slate-700 text-base leading-relaxed resize-none border-none outline-none"
                  placeholder="开始编写本章内容... 选中文本可使用AI润色/扩写"
                  style={{ lineHeight: '1.9', minHeight: '60vh' }}
                />

                {/* 选中文字悬浮工具栏 */}
                {selection && !aiLoading && (
                  <div className="fixed z-50 flex items-center gap-1 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5"
                    style={{ top: Math.min(selection.top + 80, window.innerHeight - 60), left: selection.left }}>
                    <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200">
                      <button
                        onClick={() => handleAiAction('polish')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-100 transition">
                        <Wand2 className="w-3.5 h-3.5" />润色
                      </button>
                      <span className="text-xs text-slate-400 mr-1">
                        {Math.ceil(countWords(selection.text) / 50)} 金币
                      </span>
                    </div>
                    <div className="flex items-center gap-1 pl-1.5">
                      <button
                        onClick={() => handleAiAction('expand')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition">
                        <RefreshCw className="w-3.5 h-3.5" />扩写
                      </button>
                      <span className="text-xs text-slate-400">
                        ~{Math.ceil(countWords(selection.text) * 0.3 / 50)} 金币
                      </span>
                    </div>
                    <button
                      onClick={() => setSelection(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition ml-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* 底部工具栏 */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => deleteChapter(activeChapter)} disabled={chapters.length <= 1}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed">
                    <Trash2 className="w-3 h-3" />删除章节
                  </button>
                  <span className="text-xs text-slate-400">选中文字即可使用AI润色/扩写</span>
                </div>
                <div className="text-xs text-slate-400">约 {Math.ceil(wordCount / 500)} 分钟阅读</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400"><p>选择一个章节开始编辑</p></div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function EditorClient() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
      <EditorContent />
    </Suspense>
  );
}

function toChinese(num: number): string {
  const chars = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return chars[num];
  if (num < 20) return '十' + chars[num - 10];
  if (num < 100) return chars[Math.floor(num / 10)] + '十' + (num % 10 ? chars[num % 10] : '');
  return String(num);
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}
