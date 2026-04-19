'use client';
import { useState, useEffect, useRef } from 'react';
import { Brain, ArrowLeft, Loader2, Copy, Download, FileText, Upload, Coins, CheckCircle, Home, Menu, X, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ReviewPage() {
  const [courseName, setCourseName] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const res = await fetch('/api/account', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAccountData(data);
        }
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

  // 解析文件内容
  const parseFile = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'txt' || ext === 'md') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string || '');
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    if (ext === 'docx') {
      // 用mammoth解析docx
      const mammoth = (window as any).mammoth;
      if (!mammoth) {
        // 动态加载mammoth
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
          script.onload = async () => {
            try {
              const mammoth = (window as any).mammoth;
              const arrayBuffer = await file.arrayBuffer();
              const { value } = await mammoth.extractRawText({ arrayBuffer });
              resolve(value);
            } catch (e) { reject(e); }
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return value;
    }

    if (ext === 'pdf') {
      // 动态加载pdf.js legacy版
      if (!(window as any).pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('PDF库下载失败，请检查网络'));
          document.head.appendChild(script);
        });
      }
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF解析库加载失败，请刷新重试');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return text;
    }

    if (ext === 'ppt') {
      // 旧版 .ppt 格式，发送到服务端解析
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/study/parse-file', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PPT解析失败');
      if (!data.text.trim()) throw new Error('未能从PPT中提取到有效文字内容');
      return data.text;
    }

    if (ext === 'pptx') {
      // pptx本质是zip，直接读xml
      const loadJSZip = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          if ((window as any).JSZip) { resolve((window as any).JSZip); return; }
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
          script.onload = () => resolve((window as any).JSZip);
          script.onerror = () => reject(new Error('JSZip库加载失败，请检查网络后重试'));
          document.head.appendChild(script);
        });
      };

      const JSZipLib = await loadJSZip();
      // 用 Promise.race 添加超时保护（60秒）
      const zip = await Promise.race([
        JSZipLib.loadAsync(file),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('文件解析超时（60秒），文件可能过大或已损坏')), 60000)),
      ]) as any;

      const slideTexts: Array<{ num: number; text: string }> = [];
      const slideRegex = /ppt\/slides\/slide(\d+)\.xml/;

      const promises = Object.entries(zip.files)
        .filter(([path, entry]: [string, any]) => !entry.dir && slideRegex.test(path))
        .map(async ([path, entry]: [string, any]) => {
          const num = parseInt(slideRegex.exec(path)?.[1] || '0');
          const xml = await entry.async('string');
          const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          return { num, text };
        });

      const results = await Promise.all(promises);
      const combined = results
        .filter(r => r.text)
        .sort((a, b) => a.num - b.num)
        .map(r => r.text)
        .join('\n');

      if (!combined.trim()) throw new Error('未能从PPT中提取到有效文字内容，请确认文件内容非空');
      return combined;
    }

    return '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileLoading(true);
    setError('');
    try {
      const text = await parseFile(file);
      if (!text.trim()) {
        setError('无法从文件中提取文字内容，请尝试将PPT/PDF另存为Word或纯文本格式');
        setFileLoading(false);
        return;
      }
      setExtractedText(text.slice(0, 8000));
      setStep('preview');
    } catch (err: any) {
      setError('文件解析失败: ' + (err.message || '请确认文件格式正确'));
    } finally {
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!courseName.trim()) { setError('请输入课程名称'); return; }
    if (!extractedText.trim()) { setError('请先上传课程资料'); return; }
    setLoading(true);
    setError('');
    setStep('result');
    try {
      const res = await Promise.race([
        fetch('/api/study/generate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: extractedText, courseName }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 300000)),
      ]) as Response;

      const data = await res.json().catch(() => { throw new Error('服务器响应无效'); });
      if (!res.ok) throw new Error(data.error || '生成失败');
      setResult(data.result || '');

      // 刷新余额
      const accRes = await fetch('/api/account', { credentials: 'include' });
      if (accRes.ok) setAccountData(await accRes.json());
    } catch (err: any) {
      if (err.message === 'TIMEOUT') {
        setError('生成超时（超过5分钟），请稍后重试');
        setStep('preview');
      } else {
        setError(err.message || '生成失败，请稍后重试');
        setStep('preview');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    const blob = new Blob([result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${courseName || '复习资料'}_复习大纲.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setCourseName('');
    setExtractedText('');
    setResult('');
    setFileName('');
    setError('');
    setStep('upload');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-xl hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Link>
            <Brain className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-slate-800">复习资料生成器</span>
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
                    <FileText className="w-4 h-4" />双降工具
                  </Link>
                  <Link href="/transactions" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <Coins className="w-4 h-4" />交易明细
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 步骤指示 */}
        <div className="flex items-center gap-2 mb-6">
          {['上传资料', '预览确认', '生成结果'].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'upload' && i === 0 || step === 'preview' && i <= 1 || step === 'result' && i <= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {i + 1}
              </div>
              <span className={`text-sm ${step === 'upload' && i === 0 || step === 'preview' && i <= 1 || step === 'result' && i <= 2 ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>{s}</span>
              {i < 2 && <div className={`w-8 h-px ${step === 'result' || (step === 'preview' && i === 0) ? 'bg-indigo-300' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 步骤1: 上传 */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">输入课程名称</h2>
              <input
                type="text"
                value={courseName}
                onChange={e => setCourseName(e.target.value)}
                placeholder="例如：计算机网络、数据结构、宏观经济学"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
              />
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">上传课程资料</h2>
              <p className="text-sm text-slate-500 mb-4">支持 PPT、PDF、Word（.docx）、纯文本（.txt）格式，推荐上传PPT或课件PDF，效果更好</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ppt,.pptx,.pdf,.docx,.txt,.md"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={fileLoading}
                className="w-full py-8 border-2 border-dashed border-indigo-300 rounded-xl flex flex-col items-center gap-3 hover:border-indigo-500 hover:bg-indigo-50/50 transition disabled:opacity-50 cursor-pointer"
              >
                {fileLoading ? (
                  <>
                    <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                    <p className="text-sm text-slate-500">正在解析文件...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-indigo-400" />
                    <p className="text-sm text-slate-500">点击上传课程资料</p>
                    <p className="text-xs text-slate-400">PPT · PDF · Word · TXT</p>
                  </>
                )}
              </button>
              {fileName && !fileLoading && (
                <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />已选择: {fileName}
                </p>
              )}
            </div>

            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <div className="flex items-start gap-2">
                <Coins className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <span className="font-semibold">生成费用：40金币/次</span>
                  <p className="mt-1 text-amber-700">包含：核心知识点 · 名词解释 · 简答题 · 填空题 · 知识框架图</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => extractedText ? setStep('preview') : null}
              disabled={!extractedText || !courseName.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一步：预览内容
            </button>
          </div>
        )}

        {/* 步骤2: 预览 */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">确认课程资料</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{courseName}</span>
                  <span className="text-xs text-slate-400">({extractedText.length}字)</span>
                </div>
              </div>
              <textarea
                value={extractedText}
                onChange={e => setExtractedText(e.target.value.slice(0, 8000))}
                className="w-full h-64 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                placeholder="从文件中提取的文字会显示在这里，可以手动编辑删减..."
              />
              <p className="mt-1 text-xs text-slate-400 text-right">最多8000字，建议保留核心内容</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('upload')} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition">
                上一步
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : '🚀 开始生成复习资料（40金币）'}
              </button>
            </div>
          </div>
        )}

        {/* 步骤3: 结果 */}
        {step === 'result' && (
          <div className="space-y-4">
            {loading && (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-600 font-medium mb-1">正在生成复习资料...</p>
                <p className="text-sm text-slate-400">预计需要10-30秒，请稍候</p>
              </div>
            )}

            {!loading && result && (
              <>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">📚 {courseName} 复习资料</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
                      >
                        {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? '已复制' : '复制'}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
                      >
                        <Download className="w-4 h-4" />下载
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed bg-slate-50 p-4 rounded-xl overflow-auto max-h-96">
                      {result}
                    </pre>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleReset} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition">
                    🆕 生成新的复习资料
                  </button>
                  <Link href="/" className="flex-1 py-3 bg-indigo-100 text-indigo-700 rounded-xl font-semibold text-sm hover:bg-indigo-200 transition text-center">
                    返回首页
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
