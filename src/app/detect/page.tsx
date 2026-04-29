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
  const [pdfUploaded, setPdfUploaded] = useState(false);
  const [lang, setLang] = useState<'cn' | 'en'>('cn');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 各平台严格度：正数=比基准更严(加AI率)，负数=更松(减AI率)
  // 各平台delta区间
  const allPlatforms: Record<string, { label: string; deltaMin: number; deltaMax: number; desc: string; color: string }> = {
    // 中文平台
    'sim-zhiwang-cn': { label: '模拟知网',    deltaMin: +2, deltaMax: +8,  desc: '最严格',  color: 'text-red-600' },
    'sim-dayan-cn':   { label: '模拟大雅',    deltaMin: +1, deltaMax: +5,  desc: '较严格',  color: 'text-orange-600' },
    'sim-weipu-cn':   { label: '模拟维普',    deltaMin: -2, deltaMax: +2,  desc: '标准严格', color: 'text-slate-600' },
    'sim-wanfang-cn': { label: '模拟万方',    deltaMin: -6, deltaMax: -2,  desc: '较宽松',  color: 'text-green-600' },
    'sim-gezida-cn':  { label: '模拟格子达',  deltaMin: -10, deltaMax: -5, desc: '最宽松',  color: 'text-blue-600' },
    // 英文平台
    'sim-turnitin-en': { label: '模拟Turnitin', deltaMin: +3, deltaMax: +8,  desc: '最严格',  color: 'text-red-600' },
    'sim-zhiwang-en': { label: '模拟知网(英)', deltaMin: +1, deltaMax: +5,  desc: '较严格',  color: 'text-orange-600' },
    'sim-weipu-en':   { label: '模拟维普(英)', deltaMin: -2, deltaMax: +2,  desc: '标准严格', color: 'text-slate-600' },
    'sim-gezida-en':  { label: '模拟格子达(英)', deltaMin: -8, deltaMax: -3, desc: '较宽松', color: 'text-blue-600' },
  };
  const [platform, setPlatform] = useState<string>('sim-zhiwang-cn');
  const [usedDelta, setUsedDelta] = useState<number>(0); // 本次检测实际使用的delta
  const platformOptions = Object.entries(allPlatforms)
    .filter(([key]) => key.endsWith(`-${lang}`))
    .map(([key, val]) => ({ key, ...val }));

  const currentPlatform = allPlatforms[platform];

  // result原始值（不变）
  const [adjustedAi, setAdjustedAi] = useState<number | null>(null);

  // result首次出现时：从delta区间随机取值一次，后续不变
  useEffect(() => {
    if (!result) { setAdjustedAi(null); return; }
    const p = allPlatforms[platform];
    const delta = p ? p.deltaMin + Math.random() * (p.deltaMax - p.deltaMin) : 0;
    const rounded = Math.round(delta);
    setUsedDelta(rounded);
    setAdjustedAi(Math.min(100, Math.max(0, result.ai + rounded)));
  }, [result]); // 只依赖原始AI率，不依赖platform——这样平台切换只换标签，不换数值

  const displayAi = adjustedAi;
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
          await new Promise<void>((resolve, reject) => {
            const s1 = document.createElement('script');
            s1.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            s1.onload = () => resolve();
            s1.onerror = reject;
            document.head.appendChild(s1);
          });
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          // 简单策略：按Y分行，同行按X排序，保留原始空格
          const lineMap = new Map<number, string>();
          for (const item of content.items as any[]) {
            if (!item.str) continue;
            const ty = Math.round(item.transform[5]);
            const tx = item.transform[4];
            if (!lineMap.has(ty)) lineMap.set(ty, '');
            // 同一Y行内按X顺序追加（X越大越靠右）
            const existing = lineMap.get(ty)!;
            if (!existing) {
              lineMap.set(ty, item.str);
            } else if (tx < 0) {
              // 负X通常是多列布局的左列内容，追加到开头
              lineMap.set(ty, item.str + ' ' + existing);
            } else {
              lineMap.set(ty, existing + ' ' + item.str);
            }
          }
          // 按Y从大到小排序（PDF Y坐标从底到顶），组成页面文本
          const lines = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);
          pageTexts.push(lines.map(([, t]) => t).join('\n'));
        }
        text = pageTexts.join('\n\n');
      } else {
        throw new Error('只支持 TXT、PDF、DOCX 格式');
      }
      text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!text.trim()) throw new Error('文件内容为空');
      if (text.length < 50) throw new Error('文件内容太少,至少50个字');
      setText(text);
      setUploadedFileName(file.name);
      setPdfUploaded(ext === 'pdf');
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
    if (text.length > 90000) {
      setError('正在自动分段检测，请稍候...（超大文本可能需要较长时间）');
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // 简单截断：去掉开头（标题+目录）和结尾（参考文献）
      // 策略：找到正文起始和参考文献结尾，直接截断
      let cleanText = text;

      // 1. 找到正文起始：先找"摘要"或"Abstract"，找不到则找一级章节标题"一、"或"1."
      const startPatterns = [
        /(?:^|\n)摘\s*要/i,
        /(?:^|\n)Abstract\b/i,
        /(?:^|\n)[一二三四五六七]\s*[、，]/,
        /(?:^|\n)(?:第[一二三四五六七八九十]+[章节部])/,
      ];
      let startIdx = -1;
      for (const pat of startPatterns) {
        const m = cleanText.match(pat);
        if (m && m.index !== undefined) {
          startIdx = cleanText.indexOf(m[0]);
          break;
        }
      }
      if (startIdx > 0) {
        cleanText = cleanText.slice(startIdx);
      }

      // 2. 找到参考文献结尾，截断
      const refPatterns = [
        /(?:^|\n)参考文献\s*\n/i,
        /(?:^|\n)References?\s*\n/i,
        /(?:^|\n)Bibliography/i,
        /(?:^|\n)引用文献/i,
      ];
      for (const pat of refPatterns) {
        const m = cleanText.match(pat);
        if (m && m.index !== undefined) {
          cleanText = cleanText.slice(0, cleanText.indexOf(m[0]));
          break;
        }
      }

      // 3. 清理多余空白但保留段落结构
      cleanText = cleanText.replace(/\s{3,}/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

      // 自动分段：每段不超过 7000 字（腾讯云限制），前端先分好显示给用户
      const MAX_SEGMENT = 7000;
      let segments: string[];
      if (cleanText.length <= MAX_SEGMENT) {
        segments = [cleanText];
      } else {
        // 按句子分段落
        const sentences: string[] = [];
        const parts = cleanText.split(/(?<=[。！？.!?])/);
        let current = '';
        for (const part of parts) {
          if (current.length + part.length <= MAX_SEGMENT) {
            current += part;
          } else {
            if (current) sentences.push(current.trim());
            if (part.length > MAX_SEGMENT) {
              for (let i = 0; i < part.length; i += MAX_SEGMENT) {
                sentences.push(part.slice(i, i + MAX_SEGMENT));
              }
              current = '';
            } else {
              current = part;
            }
          }
        }
        if (current.trim()) sentences.push(current.trim());
        segments = sentences;
      }

      const res = await fetch('/api/ai/detect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, _segments: segments }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('服务器返回了异常内容，请稍后重试');
      }
      if (!res.ok) throw new Error(data?.error || '检测失败');
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
    setPdfUploaded(false);
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

  const handleDownloadPdf = async () => {
    if (!result || displayAi === null) return;

    // 动态加载依赖
    if (!(window as any).html2canvas) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    if (!(window as any).jsPDF) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const html2canvas = (window as any).html2canvas;
    const { jsPDF } = (window as any).jspdf;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const detectId = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
    const pLabel = currentPlatform?.label ?? '模拟知网';
    const pDelta = usedDelta;

    // 根据句子级别推断模拟概率
    // high -> 90-100%, medium -> 60-80%, low -> 30-50%, human -> 0-20%
    const levelProb: Record<string, number> = { high: 95, medium: 70, low: 40 };

    const sentencesWithProb = result.sentences.map((s) => ({
      ...s,
      prob: s.level === 'high' ? 90 + Math.floor(Math.random() * 10) :
            s.level === 'medium' ? 60 + Math.floor(Math.random() * 20) :
            s.level === 'low' ? 30 + Math.floor(Math.random() * 20) :
            Math.floor(Math.random() * 30),
    }));

    // 风险统计
    const highChars = sentencesWithProb.filter(s => s.level === 'high').reduce((sum, s) => sum + s.text.length, 0);
    const medChars  = sentencesWithProb.filter(s => s.level === 'medium').reduce((sum, s) => sum + s.text.length, 0);
    const lowChars  = sentencesWithProb.filter(s => s.level === 'low').reduce((sum, s) => sum + s.text.length, 0);
    const noneChars = sentencesWithProb.filter(s => s.level !== 'high' && s.level !== 'medium' && s.level !== 'low').reduce((sum, s) => sum + s.text.length, 0);
    const totalChars = text.length || 1;

    const probPct = (n: number) => totalChars > 0 ? ((n / totalChars) * 100).toFixed(2) : '0.00';

    // 进度条比例
    const barPct = displayAi;

    // 片段列表HTML
    const rowsHtml = sentencesWithProb.map((s, i) => {
      const riskLabel = s.level === 'high' ? '高风险' : s.level === 'medium' ? '中风险' : s.level === 'low' ? '低风险' : '无风险';
      const probColor = s.level === 'high' ? '#dc2626' : s.level === 'medium' ? '#ea580c' : s.level === 'low' ? '#ca8a04' : '#16a34a';
      const trBg = i % 2 === 0 ? '#f9fafb' : '#ffffff';
      return `<tr style="background:${trBg};page-break-inside:avoid;">
        <td style="padding:6px 8px;text-align:center;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb;">${i + 1}</td>
        <td style="padding:6px 8px;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.text.replace(/"/g,'&quot;')}">${s.text.slice(0, 80)}${s.text.length > 80 ? '...' : ''}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:bold;color:${probColor};border-bottom:1px solid #e5e7eb;">${s.prob}%</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;color:${probColor};border-bottom:1px solid #e5e7eb;">${riskLabel}</td>
      </tr>`;
    }).join('');

    const reportHtml = `
<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;width:800px;color:#1a1a1a;background:white;box-sizing:border-box;">

  <!-- 页眉 -->
  <div style="padding:24px 32px 16px;border-bottom:2px solid #e5e7eb;box-sizing:border-box;">
    <div style="font-size:22px;font-weight:bold;color:#111827;text-align:center;margin-bottom:4px;">PepperAI 论文AIGC检测报告</div>
    <div style="font-size:11px;color:#6b7280;text-align:center;">PepperAI 智能检测平台</div>
  </div>

  <!-- 基本信息 -->
  <div style="padding:16px 32px;background:#f9fafb;border-bottom:1px solid #e5e7eb;box-sizing:border-box;">
    <div style="display:flex;gap:32px;font-size:13px;color:#374151;flex-wrap:wrap;box-sizing:border-box;">
      <span><strong>检测编号：</strong>${detectId}</span>
      <span><strong>检测时间：</strong>${dateStr}</span>
      <span><strong>检测模型：</strong>${pLabel}，与官方相差${Math.abs(pDelta)}%左右</span>
    </div>
    <div style="margin-top:8px;font-size:13px;color:#374151;">
      <strong>总字数：</strong>${text.length}
    </div>
  </div>

  <!-- 检测结果 -->
  <div style="padding:20px 32px;border-bottom:1px solid #e5e7eb;box-sizing:border-box;">
    <div style="font-size:15px;font-weight:bold;color:#111827;margin-bottom:14px;">检测结果</div>

    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;box-sizing:border-box;">
      <div style="font-size:13px;color:#374151;white-space:nowrap;">疑似AIGC风险概率：</div>
      <div style="flex:1;box-sizing:border-box;">
        <div style="height:28px;background:#fef3c7;border-radius:6px;overflow:hidden;position:relative;box-sizing:border-box;">
          <div style="height:100%;width:${barPct}%;background:${barPct >= 80 ? '#dc2626' : barPct >= 50 ? '#ea580c' : barPct >= 20 ? '#f59e0b' : '#22c55e'};border-radius:6px;box-sizing:border-box;transition:width 1s;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:14px;font-weight:bold;color:#111827;box-sizing:border-box;">${displayAi}%</div>
        </div>
      </div>
    </div>

    <!-- 风险分段 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;box-sizing:border-box;">
      <div style="padding:10px 14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;box-sizing:border-box;">
        <div style="font-size:12px;color:#dc2626;font-weight:bold;margin-bottom:4px;">🔴 高风险文本（≥90%）</div>
        <div style="font-size:18px;font-weight:bold;color:#dc2626;">${highChars}字</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">占比 ${probPct(highChars)}%</div>
      </div>
      <div style="padding:10px 14px;background:#fff7ed;border-radius:8px;border:1px solid #fed7aa;box-sizing:border-box;">
        <div style="font-size:12px;color:#ea580c;font-weight:bold;margin-bottom:4px;">🟠 中风险文本（70-90%）</div>
        <div style="font-size:18px;font-weight:bold;color:#ea580c;">${medChars}字</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">占比 ${probPct(medChars)}%</div>
      </div>
      <div style="padding:10px 14px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;box-sizing:border-box;">
        <div style="font-size:12px;color:#ca8a04;font-weight:bold;margin-bottom:4px;">🟡 低风险文本（50-70%）</div>
        <div style="font-size:18px;font-weight:bold;color:#ca8a04;">${lowChars}字</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">占比 ${probPct(lowChars)}%</div>
      </div>
      <div style="padding:10px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;box-sizing:border-box;">
        <div style="font-size:12px;color:#16a34a;font-weight:bold;margin-bottom:4px;">🟢 无风险文本（<50%）</div>
        <div style="font-size:18px;font-weight:bold;color:#16a34a;">${noneChars}字</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">占比 ${probPct(noneChars)}%</div>
      </div>
    </div>
  </div>

  <!-- 片段汇总列表 -->
  <div style="padding:20px 32px;box-sizing:border-box;">
    <div style="font-size:15px;font-weight:bold;color:#111827;margin-bottom:12px;">片段汇总列表</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;color:#374151;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;box-sizing:border-box;">
      <thead>
        <tr style="background:#f3f4f6;box-sizing:border-box;">
          <th style="padding:8px;text-align:center;font-weight:bold;border-bottom:2px solid #e5e7eb;width:48px;">序号</th>
          <th style="padding:8px;text-align:left;font-weight:bold;border-bottom:2px solid #e5e7eb;">段落内容</th>
          <th style="padding:8px;text-align:center;font-weight:bold;border-bottom:2px solid #e5e7eb;width:80px;">AI生成概率</th>
          <th style="padding:8px;text-align:center;font-weight:bold;border-bottom:2px solid #e5e7eb;width:72px;">风险等级</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>

  <!-- 页脚 -->
  <div style="padding:16px 32px;border-top:1px solid #e5e7eb;box-sizing:border-box;">
    <div style="font-size:11px;color:#9ca3af;text-align:center;">
      本报告由 PepperAI 自动生成 · 仅供参考 · 检测结果不代表权威认定
    </div>
  </div>

</div>`;

    const container = document.createElement('div');
    container.innerHTML = reportHtml;
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;background:white;';
    document.body.appendChild(container);

    try {
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 800,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = pdf.internal.pageSize.getHeight();

      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`PepperAI_AIGC检测报告_${dateStr.replace(/[\s:]/g, '-').replace('--', '-')}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
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
            想知道你的文字AI率有多高?
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">AI率检测</h1>
          <p className="text-slate-500 text-sm">粘贴文字,精准检测AI生成内容概率(附句子级报告)</p>

          {/* 中英文 + 平台选择 */}
          <div className="mt-4">
            {/* 语言标签页 */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 text-xs w-fit mx-auto mb-3">
              <button
                onClick={() => { setLang('cn'); setPlatform('sim-zhiwang-cn'); }}
                className={`px-4 py-1.5 rounded-lg font-medium transition ${lang === 'cn' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >🇨🇳 中文检测</button>
              <button
                onClick={() => { setLang('en'); setPlatform('sim-turnitin-en'); }}
                className={`px-4 py-1.5 rounded-lg font-medium transition ${lang === 'en' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >🇬🇧 English检测</button>
            </div>

            {/* 平台列表 */}
            <div className="flex flex-wrap justify-center gap-2">
              {platformOptions.map(opt => {
                const isActive = platform === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setPlatform(opt.key)}
                    className={`px-4 py-2 rounded-xl text-sm transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg scale-105'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
            value={pdfUploaded ? '📄 PDF解析成功，文件已准备好送检' : text}
            onChange={e => { setText(e.target.value); setPdfUploaded(false); }}
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
            <div className="inline-flex flex-col items-center gap-3 px-8 py-6 bg-white rounded-2xl shadow-sm border border-slate-100 w-80 mx-auto">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
              </div>
              <div className="text-sm font-medium text-slate-700">正在分析中，请稍候...</div>
              <div className="text-xs text-slate-400 text-center">AI率检测 + 句子级特征分析</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '70%' }} />
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
              <button onClick={handleDownloadPdf} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />导出PDF报告
              </button>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="mt-6 text-center text-sm text-slate-400">
            <p>💡 豆包/ChatGPT/Claude 生成的内容都可以检测</p>
            <p className="mt-1">文本越长，分析越准确，系统自动分段处理超长文本</p>
          </div>
        )}
      </div>
    </div>
  );
}
