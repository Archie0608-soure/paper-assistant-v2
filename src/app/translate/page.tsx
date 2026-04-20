'use client';
import { useState, useRef } from 'react';
import { Languages, Upload, FileText, Loader2, Download } from 'lucide-react';
import mammoth from 'mammoth';

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
];

function downloadDocx(text: string, filename: string) {
  fetch('/api/study/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, courseName: filename }),
  })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename + '_翻译.docx';
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      // fallback txt
      const b = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = filename + '_翻译.txt';
      a.click();
      URL.revokeObjectURL(u);
    });
}

export default function TranslatePage() {
  const [inputText, setInputText] = useState('');
  const [resultText, setResultText] = useState('');
  const [fromLang, setFromLang] = useState('zh');
  const [toLang, setToLang] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');

    try {
      let text = '';
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        text = value;
      } else if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        setError('仅支持 .docx 和 .txt 文件');
        return;
      }
      setInputText(text);
    } catch {
      setError('文件读取失败，请重试');
    }
  }

  async function handleTranslate() {
    if (!inputText.trim()) { setError('请输入文本或上传文件'); return; }
    setLoading(true);
    setError('');
    setResultText('');
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, from: fromLang, to: toLang }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '翻译失败'); return; }
      setResultText(data.result || '');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  function swapLang() {
    setFromLang(toLang);
    setToLang(fromLang);
    setInputText(resultText);
    setResultText(inputText);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Languages className="w-8 h-8 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">论文翻译</h1>
        </div>

        {/* Lang Selector */}
        <div className="flex items-center gap-3 mb-4">
          <select value={fromLang} onChange={e => setFromLang(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button onClick={swapLang} className="p-2 rounded-full hover:bg-gray-200 transition" title="交换语言">⇄</button>
          <select value={toLang} onChange={e => setToLang(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FileText className="w-4 h-4" />
              <span>原文 {inputText ? `(${inputText.length} 字符)` : ''}</span>
              {fileName && <span className="text-indigo-600">📎 {fileName}</span>}
            </div>
            <div className="flex gap-2">
              <input type="file" accept=".docx,.txt" ref={fileRef} onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">
                <Upload className="w-3 h-3" /> 上传文件
              </button>
            </div>
          </div>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="粘贴要翻译的文本，或上传 .docx / .txt 文件..."
            className="w-full p-4 h-48 text-sm resize-none focus:outline-none rounded-b-xl"
          />
        </div>

        {/* Action */}
        <div className="flex justify-center mb-4">
          <button onClick={handleTranslate} disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            {loading ? '翻译中...' : '开始翻译'}
          </button>
        </div>

        {/* Error */}
        {error && <div className="text-red-500 text-sm text-center mb-4">{error}</div>}

        {/* Result */}
        {resultText && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">译文 {resultText.length} 字符</span>
              <button onClick={() => downloadDocx(resultText, '翻译_' + fromLang + '_to_' + toLang)}
                className="flex items-center gap-1 px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Download className="w-3 h-3" /> 下载docx
              </button>
            </div>
            <textarea value={resultText} readOnly
              className="w-full p-4 h-48 text-sm resize-none focus:outline-none rounded-b-xl bg-gray-50"
              onCopy={e => e.preventDefault()} onPaste={e => e.preventDefault()} onCut={e => e.preventDefault()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
