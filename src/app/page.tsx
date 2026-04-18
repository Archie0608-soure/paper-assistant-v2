'use client';

import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import { useRouter } from 'next/navigation';
import { Lightbulb, Loader2, BookOpen, Layout, PenTool, Sparkles, FileDown, ArrowRight, ArrowLeft, Check, Edit3, Save, Search as SearchIcon, ExternalLink, Star, Trash2, User, Calendar, HelpCircle, MessageCircle, Users, MessageSquare, Info, LogOut, X, Bot, Scale, ShieldCheck, FileText, Wand2, Sparkles as SparklesIcon, Presentation, Brain, Languages, Library, Upload, Download, RotateCcw, Home as HomeIcon, Copy, Coins, CheckCircle, AlertCircle } from 'lucide-react';
import { exportToDocx } from '@/lib/docx';

// 常见专业分类
const MAJORS = [
  '计算机科学', '软件工程', '人工智能', '数据科学',
  '工商管理', '市场营销', '人力资源', '金融学', '经济学', '会计学',
  '心理学', '教育学', '法学', '新闻传播', '英语', '汉语言文学',
  '机械工程', '电子工程', '土木工程', '建筑学',
  '医学', '护理学', '生物工程', '化学工程',
  '物理学', '数学', '统计学', '环境科学',
  '其他',
];

// 论文类型
const PAPER_TYPES = [
  { id: 'thesis', label: '毕业论文', desc: '本科毕业论文章节完整结构' },
  { id: 'proposal', label: '开题报告', desc: '研究背景、意义、文献综述' },
  { id: 'paper', label: '课程论文', desc: '期末课程论文或小论文' },
];

interface Chapter {
  number: number;
  title: string;
  content: string;
  written: boolean;
  content_generated?: string;
}

interface Paper {
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  citations: number;
  url: string;
  source: string;
  selected?: boolean;
}

export default function Home() {
  const router = useRouter();
  // ===== 登录状态 =====
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // 登录拦截：未登录则弹窗，已登录则执行
  const requireLogin = (action: () => void) => {
    if (isLoggedIn) {
      action();
    } else {
      setPendingAction(() => action);
      setShowLoginModal(true);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/check-session');
        if (res.ok) {
          const data = await res.json();
          if (data.loggedIn) {
            setIsLoggedIn(true);
            setShowLoginModal(false);
            if (pendingAction) { pendingAction(); setPendingAction(null); }
            // 加载账户信息和签到信息
            const [accountRes, signInRes] = await Promise.all([
              fetch('/api/account'),
              fetch('/api/sign-in'),
            ]);
            if (accountRes.ok) {
              const accountData = await accountRes.json();
              setAccountData(accountData);
            }
            if (signInRes.ok) {
              const signInData = await signInRes.json();
              setSignInInfo(signInData);
            }
          }
        }
      } catch {}
    };
    checkSession();
  }, []);

  // ===== 草稿自动保存 =====
  const DRAFT_KEY = 'pepper_draft_v1';
  
  // 保存草稿到 localStorage
  const saveDraft = () => {
    try {
      const draft = {
        topic, interest, major, paperType,
        outline, chapters, currentChapter, step,
        selectedTopicTitle,
        savedAt: Date.now()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  };
  
  // 加载草稿
  const loadDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        // 检查草稿是否过期（24小时内）
        if (Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          return draft;
        }
      }
    } catch {}
    return null;
  };
  
  // 初始化时加载草稿
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.outline) {
      // 有草稿，提示用户是否恢复
      if (confirm('发现未保存的草稿，是否恢复？')) {
        setTopic(draft.topic || '');
        setInterest(draft.interest || '');
        setMajor(draft.major || '');
        setPaperType(draft.paperType || 'thesis');
        setOutline(draft.outline);
        setChapters(draft.chapters || []);
        setCurrentChapter(draft.currentChapter || null);
        setStep(draft.step || 3);
        setSelectedTopicTitle(draft.selectedTopicTitle || '');
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }, []);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string>('generate');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [signInInfo, setSignInInfo] = useState<{consecutive_days: number, last_sign_in: string | null, today_signed: boolean}>({consecutive_days: 0, last_sign_in: null, today_signed: false});
  const [topupAmount, setTopupAmount] = useState<number>(0);
  const [topupLoading, setTopupLoading] = useState(false);
  const [reduceLang, setReduceLang] = useState<'chinese' | 'english'>('chinese');
  const [reducePlatform, setReducePlatform] = useState<string>('zhiwang');
  const [reduceInput, setReduceInput] = useState('');
  const [reduceOutput, setReduceOutput] = useState('');
  const [reduceLoading, setReduceLoading] = useState(false);
  const [reduceMode, setReduceMode] = useState<'plagiarism' | 'ai' | 'both'>('both');
  const [reduceFileName, setReduceFileName] = useState('');
  const [reduceFileSize, setReduceFileSize] = useState('');
  const countWords = (t: string) => t ? t.replace(/\s/g, '').length : 0;

  // 翻译功能状态
  const [translateInput, setTranslateInput] = useState('');
  const [translateResult, setTranslateResult] = useState('');
  const [translateFrom, setTranslateFrom] = useState('zh');
  const [translateTo, setTranslateTo] = useState('en');
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [translateFileName, setTranslateFileName] = useState('');
  const translateFileRef = useRef<HTMLInputElement>(null);

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

  // PPT生成状态
  const [pptTitle, setPptTitle] = useState('');
  const [pptName, setPptName] = useState('');
  const [pptSchool, setPptSchool] = useState('');
  const [pptKeywords, setPptKeywords] = useState('');
  const [pptPages, setPptPages] = useState(10);
  const [pptTemplates, setPptTemplates] = useState<any[]>([]);
  const [pptSelectedTemplate, setPptSelectedTemplate] = useState<any>(null);
  const [pptLoading, setPptLoading] = useState(false);
  const [pptError, setPptError] = useState('');
  const [pptDownloadUrl, setPptDownloadUrl] = useState('');
  const [pptShowPreview, setPptShowPreview] = useState(false);
  const [pptProgress, setPptProgress] = useState('');

  const PPT_PAGE_OPTIONS = [15, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  const getPptTimeRange = (pages: number) => {
    const map: Record<number, {min: number; max: number}> = {
      15: {min:12,max:15}, 18: {min:15,max:18}, 20: {min:18,max:20},
      25: {min:22,max:25}, 30: {min:27,max:30}, 35: {min:32,max:35},
      40: {min:37,max:40}, 45: {min:42,max:45}, 50: {min:47,max:50},
      55: {min:52,max:55}, 60: {min:57,max:60},
    };
    return map[pages] || {min:10, max:15};
  };

  const [loginType, setLoginType] = useState<'phone' | 'email'>('email');
  const [loginDest, setLoginDest] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginCodeSent, setLoginCodeSent] = useState(false);
  const [loginPasswordMode, setLoginPasswordMode] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // 复习资料状态
  const [reviewStep, setReviewStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [reviewCourseName, setReviewCourseName] = useState('');
  const [reviewExtractedText, setReviewExtractedText] = useState('');
  const [reviewResult, setReviewResult] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewFileLoading, setReviewFileLoading] = useState(false);
  const [reviewFileName, setReviewFileName] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewCopied, setReviewCopied] = useState(false);
  const reviewFileRef = useRef<HTMLInputElement>(null);

  // 降重降AI状态（docx流程）
  const [reduceDocxFile, setReduceDocxFile] = useState<File | null>(null);
  const [reduceDocxStep, setReduceDocxStep] = useState<'idle' | 'confirm' | 'processing' | 'done' | 'error'>('idle');
  const [reduceSessionId, setReduceSessionId] = useState('');
  const [reduceCost, setReduceCost] = useState<number | null>(null);
  const [reduceCharCount, setReduceCharCount] = useState(0);
  const [reduceProgress, setReduceProgress] = useState(0);
  const [reduceStatusMsg, setReduceStatusMsg] = useState('');
  const [reduceError, setReduceError] = useState('');
  const [reduceDownloadUrl, setReduceDownloadUrl] = useState('');
  const [reduceDownloadName, setReduceDownloadName] = useState('');
  const [reduceParsing, setReduceParsing] = useState(false);
  const reduceFileRef = useRef<HTMLInputElement>(null);
  const reduceEventSourceRef = useRef<EventSource | null>(null);

  // 生成模式: 人机协作 / 一键生成
  const [generateMode, setGenerateMode] = useState<'collaborate' | 'oneclick'>('collaborate');

  // 一键生成状态
  const [oneClickTitle, setOneClickTitle] = useState('');
  const [oneClickDegree, setOneClickDegree] = useState<'bachelor' | 'master' | 'doctoral'>('bachelor');
  const [oneClickWords, setOneClickWords] = useState(8000);
  const [oneClickMajor, setOneClickMajor] = useState('');
  const [oneClickLoading, setOneClickLoading] = useState(false);
  const [oneClickError, setOneClickError] = useState<string | null>(null);
  const [oneClickSuccess, setOneClickSuccess] = useState(false);

  // 一键生成时自动刷新论文历史进度
  useEffect(() => {
    if (!oneClickSuccess) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/papers/status');
        const data = await res.json();
        if (data.papers && data.papers.length > 0) {
          // 合并到现有历史
          setPaperHistory(prev => {
            const generatingIds = new Set(data.papers.map((p: any) => p.id));
            const others = prev.filter((p: any) => !generatingIds.has(p.id));
            return [...data.papers, ...others];
          });
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [oneClickSuccess]);

  // 步骤状态: 1=选题, 2=搜索, 3=大纲, 4=写作
  const [step, setStep] = useState(1);
  
  // Step 1: 基本信息
  const [major, setMajor] = useState('');
  const [paperType, setPaperType] = useState('thesis');
  const [topic, setTopic] = useState('');
  const [interest, setInterest] = useState('');
  const [caseIndustry, setCaseIndustry] = useState('');
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const [selectedTopicTitle, setSelectedTopicTitle] = useState<string>('');
  
  // Step 2: 文献搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchFilter, setSearchFilter] = useState('全部');
  const [searched, setSearched] = useState(false);
  const filteredResults = searchFilter === '全部' ? searchResults : searchResults.filter((r: any) => r.source === searchFilter);

  // Standalone search panel handler
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearched(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim(), limit: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '搜索失败');
      setSearchResults(data.results || []);
    } catch (err: any) {
      setSearchError(err.message || '搜索失败，请稍后重试');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Step 3: 大纲
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outline, setOutline] = useState<{ title: string; chapters: any[] } | null>(null);
  
  // Step 4: 写作模式
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<number>(1);
  const [chapterContent, setChapterContent] = useState('');
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [generatingChapter, setGeneratingChapter] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [targetWordCount, setTargetWordCount] = useState<number>(1000);
  const [keywordCount, setKeywordCount] = useState<number>(5);

  // 根据章节类型自动设置目标字数
  const autoSetWordCount = (chapterTitle: string) => {
    const title = chapterTitle.toLowerCase();
    if (title.includes('摘要') || title.includes('abstract')) {
      setTargetWordCount(400);
    } else if (title.includes('关键词') || title.includes('keyword')) {
      setKeywordCount(5);
    } else if (title.includes('引言') || title.includes('绪论') || title.includes('前言')) {
      setTargetWordCount(1200);
    } else if (title.includes('理论') || title.includes('概念') || title.includes('文献综述')) {
      setTargetWordCount(1500);
    } else if (title.includes('方法') || title.includes('研究设计')) {
      setTargetWordCount(1500);
    } else if (title.includes('问题') || title.includes('现状') || title.includes('分析')) {
      setTargetWordCount(2000);
    } else if (title.includes('模型') || title.includes('构建') || title.includes('设计')) {
      setTargetWordCount(2500);
    } else if (title.includes('实证') || title.includes('结果') || title.includes('案例')) {
      setTargetWordCount(3000);
    } else if (title.includes('结论') || title.includes('总结') || title.includes('展望')) {
      setTargetWordCount(600);
    } else if (title.includes('参考文献') || title.includes('致谢')) {
      setTargetWordCount(500);
    } else {
      setTargetWordCount(1500);
    }
  };

  const [showExportPreview, setShowExportPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [paperHistory, setPaperHistory] = useState<any[]>([]);
  const [currentPaperId, setCurrentPaperId] = useState<string | null>(null);

  // 自动保存草稿（监听关键状态变化）
  useEffect(() => {
    if (outline || chapters.length > 0) {
      saveDraft();
    }
  }, [outline, chapters, chapterContent, currentChapter, step]);

  // ===== 登录函数 =====
  const handleSendLoginCode = async () => {
    if (!loginDest.trim()) { setLoginError('请输入手机号或邮箱'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: loginType, destination: loginDest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发送失败');
      setLoginCodeSent(true);
    } catch (err: any) {
      setLoginError(err.message || '发送失败，请稍后重试');
    } finally { setLoginLoading(false); }
  };

  const handlePasswordLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginDest, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败');
      setIsLoggedIn(true);
      setShowLoginModal(false);
      if (pendingAction) { pendingAction(); setPendingAction(null); }
      // 加载账户信息和签到信息
      const [accountRes, signInRes] = await Promise.all([
        fetch('/api/account'),
        fetch('/api/sign-in'),
      ]);
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAccountData(accountData);
      }
      if (signInRes.ok) {
        const signInData = await signInRes.json();
        setSignInInfo(signInData);
      }
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyLoginCode = async () => {
    if (!loginCode.trim()) { setLoginError('请输入验证码'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: loginType, destination: loginDest, code: loginCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '验证失败');
      if (data.isNewUser && !data.user?.hasPassword) {
        // 新用户：先设置密码
        setPendingUser(data.user);
        setNeedsPassword(true);
      } else {
        setIsLoggedIn(true);
        setShowLoginModal(false);
        if (pendingAction) { pendingAction(); setPendingAction(null); }
        // 加载账户信息和签到信息
        const [accountRes, signInRes] = await Promise.all([
          fetch('/api/account'),
          fetch('/api/sign-in'),
        ]);
        if (accountRes.ok) {
          const accountData = await accountRes.json();
          setAccountData(accountData);
        }
        if (signInRes.ok) {
          const signInData = await signInRes.json();
          setSignInInfo(signInData);
        }
      }
    } catch (err: any) {
      setLoginError(err.message || '验证失败');
    } finally { setLoginLoading(false); }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsLoggedIn(false);
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/writing/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMsg, action: 'chat' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: 'ai', content: data.result }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', content: `抱歉：${err.message}` }]);
    }
    setChatLoading(false);
  };

  const handleSavePaper = async () => {
    try {
      const res = await fetch('/api/papers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentPaperId,
          title: outline?.title || topic || interest || '毕业论文',
          major,
          paperType,
          outline,
          chapters,
          selectedPapers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentPaperId(data.id);
      return data.id;
    } catch (err: any) {
      console.error('Save failed:', err);
      return null;
    }
  };

  const handleLoadHistory = async () => {
    try {
      const res = await fetch('/api/papers/load');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPaperHistory(data.papers || []);
      setShowHistory(true);
    } catch (err: any) {
      console.error('Load history failed:', err);
    }
  };

  const handleLoadPaper = async (paperId: string) => {
    try {
      const res = await fetch('/api/papers/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: paperId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const p = data.paper;
      if (!p) return;
      setCurrentPaperId(p.id);
      if (p.outline) setOutline(p.outline);
      // 一键生成论文：chapters 是完整文本字符串，不是数组
      if (p.chapters) {
        if (typeof p.chapters === 'string') {
          // chapters 是完整文本，用单个章节承载
          const fullChapter = {
            number: 1,
            title: '全文',
            content: p.chapters,
            written: true,
            content_generated: p.chapters,
          };
          setChapters([fullChapter as any]);
        } else {
          setChapters(p.chapters);
        }
      }
      if (p.selected_papers) setSelectedPapers(p.selected_papers);
      if (p.major) setMajor(p.major);
      if (p.paper_type) setPaperType(p.paper_type);
      if (p.title) setTopic(p.title);
      setShowHistory(false);
    } catch (err: any) {
      console.error('Load paper failed:', err);
    }
  };

  const handleOpenAccount = async () => {
    try {
      const [accountRes, signInRes] = await Promise.all([
        fetch('/api/account'),
        fetch('/api/sign-in')
      ]);
      const accountData = await accountRes.json();
      const signInData = await signInRes.json();
      if (accountRes.ok) setAccountData(accountData);
      if (signInRes.ok) setSignInInfo(signInData);
    } catch {}
  };

  const handleSetPassword = async (newPw: string) => {
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNeedsPassword(false);
      setIsLoggedIn(true);
      setShowLoginModal(false);
      if (pendingAction) { pendingAction(); setPendingAction(null); }
    } catch (err: any) { alert(err.message || '设置失败'); }
  };

  const handleSignIn = async () => {
    try {
      const res = await fetch('/api/sign-in', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '签到失败');
      
      // 计算奖励
      let bonus = 5;
      if (data.consecutive_days === 3) bonus += 5;
      if (data.consecutive_days === 7) bonus += 20;
      
      alert(`签到成功！获得 ${bonus} 金币\n已连续签到 ${data.consecutive_days} 天`);
      
      // 更新签到信息和余额
      setSignInInfo({ ...signInInfo, consecutive_days: data.consecutive_days, last_sign_in: data.last_sign_in, today_signed: true });
      if (accountData) setAccountData({ ...accountData, balance: accountData.balance + bonus });
      
      // 关闭菜单
      setShowUserMenu(false);
    } catch (err: any) {
      alert(err.message || '签到失败，请稍后重试');
    }
  };

  // 生成选题
  const handleGenerate = async () => {
    if (!topic.trim() && !interest.trim()) {
      setError('请输入论文主题或研究方向');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/generate-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          field: major,
          paperType,
          topic: topic || interest,
          userTopic: topic ? true : false,
          caseIndustry
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => '未知错误');
        throw new Error(`服务器错误 (${res.status})：${text.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `生成失败 (${res.status})`);
      }

      setResult(data.topics);
      setStep(2);
      setSearchQuery(topic || interest);
    } catch (err: any) {
      setError(err.message || '出错了，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 一键生成
  const handleOneClickGenerate = async () => {
    if (!oneClickTitle.trim()) {
      setOneClickError('请输入论文标题');
      return;
    }
    setOneClickLoading(true);
    setOneClickError(null);
    setOneClickSuccess(false);

    try {
      const res = await fetch('/api/papers/one-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: oneClickTitle,
          degree: oneClickDegree,
          targetWords: oneClickWords,
          major: oneClickMajor,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => '未知错误');
        throw new Error(`服务器错误 (${res.status})：${text.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || `启动失败 (${res.status})`);
      }

      setOneClickSuccess(true);
      setOneClickTitle('');
      // 刷新论文历史
      await handleLoadHistory();
    } catch (err: any) {
      setOneClickError(err.message || '启动失败');
    } finally {
      setOneClickLoading(false);
    }
  };

  // 搜索文献 - 用 AI 生成学术化搜索词，再多引擎并行搜
  const handleGenerateSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setError(null);
    
    try {
      // 用 AI 生成 3 个不同的学术化搜索词
      let searchQueries = [searchQuery];
      try {
        const genRes = await fetch('/api/generate-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'expand-search',
            topic: searchQuery
          }),
        });
        const genData = await genRes.json();
        if (genData.queries && Array.isArray(genData.queries)) {
          searchQueries = [searchQuery, ...genData.queries.slice(0, 3)];
        }
      } catch {
        // AI 生成失败就用原文
      }
      
      // 三个引擎并行搜
      const SEMANTIC_KEY = process.env.NEXT_PUBLIC_SEMANTIC_SCHOLAR_KEY || '';
      const fetchPromises = searchQueries.flatMap((q: string) => [
        fetch(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=8`, {
          headers: { 'Accept': 'application/json' }
        }),
        fetch(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=8`, {
          headers: { 'Accept': 'application/json' }
        }),
        fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=8&fields=title,authors,abstract,year,citationCount,openAccessPdf`, {
          headers: { 
            'Accept': 'application/json',
            ...(SEMANTIC_KEY ? { 'x-api-key': SEMANTIC_KEY } : {})
          }
        }),
      ]);
      
      const results = await Promise.allSettled(fetchPromises);
      
      const allPapers: Paper[] = [];
      
      // 处理所有结果（每个查询的 OpenAlex + CrossRef + Semantic Scholar）
      for (let i = 0; i < results.length; i += 3) {
        const openalexResult = results[i];
        const crossrefResult = results[i + 1];
        const semanticResult = results[i + 2];
        
        // OpenAlex
        if (openalexResult.status === 'fulfilled' && openalexResult.value.ok) {
          try {
            const data = await (openalexResult.value as Response).json();
            const papers = (data.results || []).map((work: any) => ({
              title: work.title,
              authors: work.authorships?.slice(0, 5).map((a: any) => a.author.display_name) || [],
              abstract: work.abstract_inverted_index ? '有摘要' : '无摘要',
              year: work.publication_year,
              citations: work.cited_by_count || 0,
              url: work.doi || `https://openalex.org/works/${work.id}`,
              source: 'OpenAlex' as string,
            }));
            allPapers.push(...papers);
          } catch { /* ignore */ }
        }
        
        // CrossRef
        if (crossrefResult.status === 'fulfilled' && crossrefResult.value.ok) {
          try {
            const data = await (crossrefResult.value as Response).json();
            const papers = (data.message?.items || []).map((work: any) => ({
              title: work.title?.[0] || '无标题',
              authors: work.author?.slice(0, 5).map((a: any) => a.given ? `${a.given} ${a.family}` : a.family) || [],
              abstract: work.abstract ? work.abstract.slice(0, 200) + '...' : '无摘要',
              year: work.published?.['date-parts']?.[0]?.[0] || work.created?.['date-parts']?.[0]?.[0] || 0,
              citations: work['is-referenced-by-count'] || 0,
              url: work.URL || work.DOI ? `https://doi.org/${work.DOI}` : '#',
              source: 'CrossRef' as string,
            }));
            allPapers.push(...papers);
          } catch { /* ignore */ }
        }
        
        // Semantic Scholar
        if (semanticResult.status === 'fulfilled' && semanticResult.value.ok) {
          try {
            const data = await (semanticResult.value as Response).json();
            const papers = (data.data || []).map((work: any) => ({
              title: work.title,
              authors: work.authors?.slice(0, 5).map((a: any) => a.name) || [],
              abstract: work.abstract ? work.abstract.slice(0, 200) + '...' : '无摘要',
              year: work.year,
              citations: work.citationCount || 0,
              url: work.openAccessPdf?.url || `https://www.semanticscholar.org/paper/${work.paperId}`,
              source: 'Semantic Scholar' as string,
            }));
            allPapers.push(...papers);
          } catch { /* ignore */ }
        }
      }
      
      // 去重（按标题）
      const seen = new Set<string>();
      const unique = allPapers.filter((paper) => {
        const key = paper.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      // 按引用数排序
      unique.sort((a, b) => (b.citations || 0) - (a.citations || 0));
      const finalResults = unique.slice(0, 15);
      
      // AI 过滤掉不相关的论文
      let filteredResults = finalResults;
      try {
        const filterRes = await fetch('/api/generate-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'filter-papers',
            topic: searchQuery,
            papers: finalResults
          }),
        });
        const filterData = await filterRes.json();
        if (filterData.papers && filterData.papers.length > 0) {
          filteredResults = filterData.papers;
        }
      } catch {
        // 过滤失败就用原始结果
      }
      
      // 翻译标题和摘要（英文转中文）
      try {
        const translateRes = await fetch('/api/generate-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'translate-papers',
            papers: filteredResults
          }),
        });
        const translateData = await translateRes.json();
        setSearchResults(translateData.papers || filteredResults);
      } catch {
        setSearchResults(filteredResults);
      }
    } catch (err: any) {
      setError(err.message || '搜索失败');
    } finally {
      setSearching(false);
    }
  };

  // 删除章节
  const handleDeleteChapter = (chapterNum: number) => {
    if (!confirm(`确定删除第${chapterNum}章吗？`)) return;
    setChapters(prev => prev.filter(c => c.number !== chapterNum).map((c, i) => ({ ...c, number: i + 1 })));
    if (currentChapter >= chapterNum && currentChapter > 1) {
      setCurrentChapter(currentChapter - 1);
    }
  };

  // 切换选择文献
  const togglePaper = (paper: Paper) => {
    setSelectedPapers(prev => {
      const exists = prev.find(p => p.title === paper.title);
      if (exists) {
        return prev.filter(p => p.title !== paper.title);
      } else {
        return [...prev, { ...paper, selected: true }];
      }
    });
  };

  // 生成大纲
  const handleGenerateOutline = async () => {
    setOutlineLoading(true);
    
    try {
      const res = await fetch('/api/generate-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'generate-outline',
          major,
          topic: selectedTopicTitle || topic || interest,
          paperType
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '生成大纲失败');
      }

      setOutline(data.outline);
      const parsedChapters = (data.outline?.chapters || []).map((ch: any, i: number) => ({
        ...ch,
        written: false,
        content_generated: '',
      }));
      setChapters(parsedChapters);
      setStep(4);
    } catch (err: any) {
      setError(err.message || '生成大纲失败');
    } finally {
      setOutlineLoading(false);
    }
  };

  // 生成章节内容
  const handleGenerateChapter = async (chapterNum: number) => {
    const chapter = chapters.find(c => c.number === chapterNum);
    if (!chapter) return;

    setCurrentChapter(chapterNum);
    setEditingChapter(chapterNum);
    setGeneratingChapter(true);

    // 带超时控制的 fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2分钟超时
    
    try {
      const res = await fetch('/api/generate-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'generate-chapter',
          topic: outline?.title || topic,
          chapterTitle: chapter.title,
          chapterContent: chapter.content,
          previousChapterSummary: chapters[chapterNum - 2]?.content_generated || '无',
          targetWordCount: targetWordCount,
          keywordCount: keywordCount
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '生成内容失败');
      }

      if (!data.content) {
        throw new Error('生成内容为空，请重试');
      }

      setChapterContent(data.content);
      
      setChapters(prev => prev.map(c => 
        c.number === chapterNum 
          ? { ...c, content_generated: data.content, written: true }
          : c
      ));
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setError('生成超时，请重试');
      } else {
        setError(err.message || '生成内容失败');
      }
    } finally {
      setGeneratingChapter(false);
    }
  };

  // 润色内容
  const handlePolish = async () => {
    if (!chapterContent) return;
    
    setPolishing(true);
    
    try {
      const res = await fetch('/api/generate-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'polish',
          text: chapterContent
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '润色失败');
      }

      setChapterContent(data.polished);
    } catch (err: any) {
      setError(err.message || '润色失败');
    } finally {
      setPolishing(false);
    }
  };

  // 文件上传处理
  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'docx'].includes(ext || '')) {
      alert('仅支持 .txt 和 .docx 文件');
      return;
    }
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    setReduceFileName(file.name);
    setReduceFileSize(`${sizeMB} MB`);

    try {
      let text = '';
      if (ext === 'txt') {
        text = await file.text();
      } else if (ext === 'docx') {
        // 简单解析 docx（实际上是zip），提取 document.xml 文本
        const { default: mammoth } = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }
      setReduceInput((prev) => prev ? prev + '\n\n' + text : text);
    } catch (err) {
      console.error('文件解析失败:', err);
      alert('文件解析失败，请确保是有效的文本文件');
    }
  };

  // 降重降AI处理
  const handleReduce = async () => {
    if (!reduceInput.trim()) return;
    setReduceLoading(true);
    setReduceOutput('');
    try {
      const res = await fetch('/api/ai/reduce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: reduceInput,
          language: reduceLang,
          platform: reducePlatform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '处理失败');
      setReduceOutput(data.result || data.text || '');
    } catch (err: any) {
      alert(err.message || '处理失败，请稍后重试');
    } finally {
      setReduceLoading(false);
    }
  };

  // PPT：获取模板列表
  useEffect(() => {
    if (activeFeature === 'ppt' && pptTemplates.length === 0) {
      fetch('/api/ppt/templates', { credentials: 'include' })
        .then(r => r.json())
        .then(d => setPptTemplates(d.templates || []))
        .catch(() => {});
    }
  }, [activeFeature]);

  // PPT：生成
  const handlePptGenerate = async () => {
    if (!pptTitle.trim()) { setPptError('请输入论文标题'); return; }
    if (!pptName.trim()) { setPptError('请输入姓名'); return; }
    setPptError(''); setPptLoading(true); setPptProgress('正在生成...');
    try {
      const res = await fetch('/api/ppt/generate', {
        credentials: 'include',
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pptTitle, name: pptName, school: pptSchool, keywords: pptKeywords, pages: pptPages, template: pptSelectedTemplate?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setPptProgress(''); setPptDownloadUrl(data.url);
    } catch (e: any) { setPptError(e.message || '生成失败'); }
    finally { setPptLoading(false); }
  };

  // 复习资料：解析文件
  const parseReviewFile = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'txt' || ext === 'md') {
      return await file.text();
    }
    if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      return value;
    }
    throw new Error('仅支持 .txt .md .docx 格式（页面嵌入模式），如需解析PPT/PDF请前往复习资料页面');
  };

  // 复习资料：处理文件上传
  const handleReviewFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReviewFileName(file.name);
    setReviewFileLoading(true);
    setReviewError('');
    try {
      const text = await parseReviewFile(file);
      if (!text.trim()) { throw new Error('无法从文件中提取文字内容'); }
      setReviewExtractedText(text.slice(0, 8000));
      setReviewStep('preview');
    } catch (err: any) {
      setReviewError(err.message || '文件解析失败');
    } finally {
      setReviewFileLoading(false);
      if (reviewFileRef.current) reviewFileRef.current.value = '';
    }
  };

  // 复习资料：生成
  const handleReviewGenerate = async () => {
    if (!reviewCourseName.trim()) { setReviewError('请输入课程名称'); return; }
    if (!reviewExtractedText.trim()) { setReviewError('请先上传课程资料'); return; }
    setReviewLoading(true);
    setReviewError('');
    setReviewStep('result');
    try {
      const res = await Promise.race([
        fetch('/api/study/generate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reviewExtractedText, courseName: reviewCourseName }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 180000)),
      ]) as Response;
      const data = await res.json().catch(() => { throw new Error('服务器响应无效'); });
      if (!res.ok) throw new Error(data.error || '生成失败');
      setReviewResult(data.result || '');
    } catch (err: any) {
      if (err.message === 'TIMEOUT') {
        setReviewError('生成超时（超过3分钟），请稍后重试');
      } else {
        setReviewError(err.message || '生成失败，请稍后重试');
      }
      setReviewStep('preview');
    } finally {
      setReviewLoading(false);
    }
  };

  // 复习资料：复制
  const handleReviewCopy = async () => {
    try { await navigator.clipboard.writeText(reviewResult); setReviewCopied(true); setTimeout(() => setReviewCopied(false), 2000); } catch {}
  };

  // 复习资料：下载
  const handleReviewDownload = () => {
    const blob = new Blob([reviewResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${reviewCourseName || '复习资料'}_复习大纲.md`; a.click(); URL.revokeObjectURL(url);
  };

  // 复习资料：重置
  const handleReviewReset = () => {
    setReviewCourseName(''); setReviewExtractedText(''); setReviewResult('');
    setReviewFileName(''); setReviewError(''); setReviewStep('upload');
  };

  // 降重降AI：文件上传
  const handleReduceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.docx')) {
      setReduceError('仅支持 .docx 格式（Word 2007+），请将文档另存为 .docx 格式后重试');
      e.target.value = ''; return;
    }
    setReduceDocxFile(file);
    setReduceDocxStep('idle');
    setReduceError('');
    setReduceDownloadUrl('');
    setReduceParsing(true);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('lang', reduceLang);
    fd.append('platform', reducePlatform);

    try {
      const res = await fetch('/api/ai/reduce-docx/cost', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');
      setReduceSessionId(data.sessionId);
      setReduceCost(data.cost);
      setReduceCharCount(data.charCount || 0);
      setReduceDocxStep('confirm');
      setReduceParsing(false);
    } catch (err: any) {
      setReduceDocxStep('error');
      setReduceError(err.message || '提交失败，请稍后重试');
      setReduceParsing(false);
    }
    e.target.value = '';
  };

  // 降重降AI：确认开始处理
  const handleReduceStart = async () => {
    if (!reduceDocxFile || !reduceSessionId) return;
    setReduceDocxStep('processing');
    setReduceProgress(5);
    setReduceStatusMsg('正在提交文档...');
    setReduceError('');
    try {
      const res = await fetch('/api/ai/reduce-docx/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: reduceSessionId, lang: reduceLang, platform: reducePlatform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '启动处理失败');
      setReduceProgress(10);
      setReduceStatusMsg('已提交，等待处理...');
      subscribeReduceProgress(data.docId);
    } catch (err: any) {
      setReduceDocxStep('error');
      setReduceError(err.message || '启动失败');
    }
  };

  // 降重降AI：SSE订阅进度
  const subscribeReduceProgress = (docId: string) => {
    const es = new EventSource(`/api/ai/reduce-docx/progress?doc_id=${encodeURIComponent(docId)}`);
    reduceEventSourceRef.current = es;
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const t = msg.type;
        if (t === 'connected' || t === 'ping' || t === 'pong') return;
        if (t === 'progress') {
          setReduceProgress(Math.min(Math.round((msg.progress || 0) * 0.8 + 10), 90));
          setReduceStatusMsg(msg.stage || `处理中... ${Math.round(msg.progress || 0)}%`);
        }
        if (t === 'stage') setReduceStatusMsg(msg.stage || '处理中...');
        if (t === 'need_pay') { es.close(); setReduceDocxStep('error'); setReduceError('点数不足，请充值后重试'); }
        if (t === 'error') { es.close(); setReduceDocxStep('error'); setReduceError(msg.error || '处理失败'); }
        if (t === 'completed') {
          es.close(); reduceEventSourceRef.current = null;
          setReduceProgress(85);
          setReduceStatusMsg('处理完成，正在下载...');
          downloadReduceFile(docId).then(({ url, name }) => {
            setReduceDownloadUrl(url); setReduceDownloadName(name);
            setReduceDocxStep('done'); setReduceProgress(100); setReduceStatusMsg('处理完成！');
          }).catch((err: any) => { setReduceDocxStep('error'); setReduceError(err.message || '文件下载失败'); });
        }
      } catch {}
    };
    es.onerror = () => {
      es.close(); reduceEventSourceRef.current = null;
      setReduceStatusMsg('连接中断，切换为轮询...');
      pollReduceFallback(docId);
    };
  };

  // 降重降AI：轮询fallback
  const pollReduceFallback = async (docId: string) => {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const fd = new FormData(); fd.append('user_doc_id', docId);
        const res = await fetch(`https://api3.speedai.chat/v1/docx/status`, { method: 'POST', body: fd });
        const data = await res.json();
        setReduceProgress(Math.min(10 + Math.round(i / 120 * 75), 85));
        setReduceStatusMsg(`处理中... ${data.progress || Math.round(i / 120 * 100)}%`);
        if (data.status === 'completed') {
          setReduceProgress(85);
          downloadReduceFile(docId).then(({ url, name }) => {
            setReduceDownloadUrl(url); setReduceDownloadName(name);
            setReduceDocxStep('done'); setReduceProgress(100); setReduceStatusMsg('处理完成！');
          }); return;
        }
        if (data.status === 'error' || data.status === 'need_pay') {
          setReduceDocxStep('error');
          setReduceError(data.error || (data.status === 'need_pay' ? '点数不足' : '处理失败'));
          return;
        }
      } catch {}
    }
    setReduceDocxStep('error'); setReduceError('处理超时');
  };

  // 降重降AI：下载文件
  const downloadReduceFile = async (docId: string): Promise<{ url: string; name: string }> => {
    if (!reduceDocxFile) throw new Error('文件丢失');
    const outName = reduceDocxFile.name.replace(/\.(docx|doc)$/i, '_降AI.docx');
    const fd = new FormData();
    fd.append('user_doc_id', docId);
    fd.append('file_name', outName.replace(/\.docx$/, ''));
    const res = await fetch('/api/ai/reduce-docx/download', { method: 'POST', body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '下载失败');
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), name: outName };
  };

  // 降重降AI：触发下载
  const handleReduceDownload = () => {
    if (!reduceDownloadUrl) return;
    const a = document.createElement('a');
    a.href = reduceDownloadUrl; a.download = reduceDownloadName; a.click();
  };

  // 降重降AI：重置
  const handleReduceReset = () => {
    setReduceDocxFile(null); setReduceDocxStep('idle'); setReduceSessionId('');
    setReduceCost(null); setReduceCharCount(0); setReduceProgress(0);
    setReduceStatusMsg(''); setReduceError(''); setReduceDownloadUrl('');
    setReduceDownloadName('');
  };

  // 翻译：处理文件上传
  const handleTranslateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTranslateFileName(file.name);
    setTranslateError('');
    try {
      let text = '';
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        text = value;
      } else if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        setTranslateError('仅支持 .docx 和 .txt 文件');
        return;
      }
      setTranslateInput(text);
    } catch {
      setTranslateError('文件读取失败，请重试');
    }
  };

  // 翻译：交换语言
  const swapTranslateLang = () => {
    setTranslateFrom(translateTo);
    setTranslateTo(translateFrom);
    setTranslateInput(translateResult);
    setTranslateResult(translateInput);
  };

  // 翻译：执行翻译
  const handleTranslate = async () => {
    if (!translateInput.trim()) { setTranslateError('请输入文本或上传文件'); return; }
    setTranslateLoading(true);
    setTranslateError('');
    setTranslateResult('');
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: translateInput, from: translateFrom, to: translateTo }),
      });
      const data = await res.json();
      if (!res.ok) { setTranslateError(data.error || '翻译失败'); return; }
      setTranslateResult(data.result || '');
    } catch {
      setTranslateError('网络错误，请重试');
    } finally {
      setTranslateLoading(false);
    }
  };

  // 保存章节
  const handleSaveChapter = () => {
    setChapters(prev => prev.map(c => 
      c.number === currentChapter 
        ? { ...c, content_generated: chapterContent, written: true }
        : c
    ));
    setEditingChapter(null);
    alert('章节已保存！');
  };

  // 导出排版
  const handleExport = async (format: 'word' | 'pdf') => {
    const writtenChapters = chapters.filter(c => c.written);
    if (writtenChapters.length === 0) {
      alert('请先完成至少一个章节的写作');
      return;
    }

    if (format === 'pdf') {
      alert('PDF 导出：请在 Word 中打开文档，使用「文件→另存为→PDF」');
      return;
    }

    try {
      // 先保存（触发扣费）
      const saveRes = await fetch('/api/papers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: outline?.title || topic || interest || '毕业论文',
          major,
          paperType: paperType || '毕业论文',
          outline: outline,
          chapters: writtenChapters,
          selectedPapers: [],
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        if (saveData.error === '余额不足，请先充值') {
          alert('余额不足，请先充值后再导出');
        } else {
          alert(saveData.error || '保存失败，请重试');
        }
        return;
      }

      await exportToDocx(
        outline?.title || topic || interest || '毕业论文',
        major,
        studentName,
        writtenChapters
      );
    } catch (err: any) {
      alert(err?.message || '导出失败，请稍后重试');
    }
  };

  // 返回上一步
  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen select-none animate-aurora relative">
      {/* 降重降AI背景渐变叠加层（切换时动画过渡） */}
      <div
        className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-700 ${activeFeature === 'reduce' ? 'opacity-100 bg-gradient-to-br from-rose-100 via-orange-50 to-emerald-100' : 'opacity-0'}`}
      />
      {/* 顶部 Header */}
      <header className="bg-[#7c3aed] sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/micah/svg?seed=Pepper`} alt="logo" className="w-full h-full" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Pepper</h1>
                <p className="text-white/70 text-xs">智能论文助手</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {step > 1 && (
                <button 
                  onClick={goBack}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回
                </button>
              )}
              <button
                onClick={handleLoadHistory}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition"
              >
                <BookOpen className="w-4 h-4" />
                我的论文
              </button>

              {/* 登录/用户菜单 */}
              {isLoggedIn ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-white font-medium shadow-lg hover:bg-white/30 transition-all overflow-hidden"
                  >
                    <img
                      src={`https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(accountData?.email || accountData?.phone || 'user')}`}
                      alt="avatar"
                      className="w-full h-full"
                    />
                  </button>

                  {/* 下拉菜单 */}
                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-2 z-50 overflow-hidden">
                        <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">{accountData?.email || accountData?.phone}</p>
                            <p className="text-white/70 text-xs mt-0.5">{accountData?.balance || 0} 金币</p>
                          </div>
                          <button onClick={() => { setShowUserMenu(false); window.location.href = '/topup'; }}
                            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition">
                            充值
                          </button>
                        </div>

                        <div className="h-px bg-slate-100" />

                        <button
                          onClick={() => { setShowUserMenu(false); handleOpenAccount().then(() => setShowProfileModal(true)); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          <User className="w-4 h-4 text-slate-400" />
                          个人资料
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); window.location.href='/signin'; }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Calendar className="w-4 h-4 text-slate-400" />
                          每日签到
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); window.location.href='/transactions'; }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Scale className="w-4 h-4 text-slate-400" />
                          交易明细
                        </button>
                        <button onClick={() => router.push('/faq')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition">
                          <HelpCircle className="w-4 h-4 text-slate-400" />
                          常见问题
                        </button>
                        <button onClick={() => router.push('/kefu')}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition">
                          <MessageCircle className="w-4 h-4 text-slate-400" />
                          在线客服
                        </button>
                        <button onClick={() => router.push('/community')}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition">
                          <Users className="w-4 h-4 text-slate-400" />
                          专属社区
                        </button>
                        <button onClick={() => { setShowUserMenu(false); window.location.href='/review'; }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition">
                          <Brain className="w-4 h-4 text-slate-400" />
                          复习资料生成
                        </button>
                        <button onClick={() => router.push('/feedback')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition">
                          <MessageSquare className="w-4 h-4 text-slate-400" />
                          问题反馈
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); window.location.href = '/about'; }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Info className="w-4 h-4 text-slate-400" />
                          关于我们
                        </button>

                        <div className="h-px bg-slate-100" />

                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
                        >
                          <LogOut className="w-4 h-4" />
                          退出登录
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-xl text-sm hover:bg-indigo-50 transition shadow"
                >
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 左侧功能栏 + 主内容 */}
      {/* 移动端：功能栏横向贴顶 */}
      <div className="md:hidden flex gap-3 overflow-x-auto pb-3 px-4 -mx-4">
        <button
          onClick={() => setActiveFeature('generate')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'generate' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <FileText className="w-5 h-5" />
          <span className="font-semibold">文章生成</span>
        </button>
        <button
          onClick={() => setActiveFeature('translate')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'translate' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <Languages className="w-5 h-5" />
          <span className="font-medium">论文翻译</span>
        </button>
        <button
          onClick={() => setActiveFeature('ppt')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'ppt' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <Presentation className="w-5 h-5" />
          <span className="font-medium">AI PPT</span>
        </button>
        <button
          onClick={() => setActiveFeature('reduce')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'reduce' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <Scale className="w-5 h-5" />
          <span className="font-medium">降重降AI</span>
        </button>
        <button
          onClick={() => setActiveFeature('review')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'review' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <Brain className="w-5 h-5" />
          <span className="font-medium">复习资料</span>
        </button>
        <button
          onClick={() => setActiveFeature('search')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'search' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <Library className="w-5 h-5" />
          <span className="font-medium">文献搜索</span>
        </button>
        <button
          onClick={() => setActiveFeature('agent')}
          className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs transition-all ${activeFeature === 'agent' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'bg-white text-slate-600 shadow border border-slate-200'}`}
        >
          <Bot className="w-5 h-5" />
          <span className="font-medium">科研智能体</span>
        </button>
      </div>

      <div className="max-w-6xl mx-auto flex gap-6 py-6 px-6">
        {/* 桌面端：左侧固定功能栏 */}
        <aside className="hidden md:block w-52 flex-shrink-0 fixed left-6 top-1/2 -translate-y-1/2 z-30">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 overflow-hidden">
            <button
              onClick={() => setActiveFeature('generate')}
              className={`w-full flex flex-col items-center gap-2 px-4 py-5 text-sm transition-all duration-300 ${activeFeature === 'generate' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <FileText className="w-6 h-6" />
              <span className="font-semibold text-base">文章生成</span>
            </button>
            <button
              onClick={() => setActiveFeature('translate')}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm transition-all duration-300 ${activeFeature === 'translate' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <Languages className="w-5 h-5" />
              <span className="font-medium">论文翻译</span>
            </button>
            <button
              onClick={() => setActiveFeature('ppt')}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm transition-all duration-300 ${activeFeature === 'ppt' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <Presentation className="w-5 h-5" />
              <span className="font-medium">AI PPT</span>
            </button>
            <button
              onClick={() => setActiveFeature('reduce')}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm transition-all duration-300 ${activeFeature === 'reduce' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <Scale className="w-5 h-5" />
              <span className="font-medium">降重降AI</span>
            </button>
            <button
              onClick={() => setActiveFeature('review')}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm transition-all duration-300 ${activeFeature === 'review' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <Brain className="w-5 h-5" />
              <span className="font-medium">复习资料</span>
            </button>
            <button
              onClick={() => setActiveFeature('search')}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm transition-all duration-300 ${activeFeature === 'search' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <Library className="w-5 h-5" />
              <span className="font-medium">文献搜索</span>
            </button>
            <button
              onClick={() => setActiveFeature('agent')}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm transition-all duration-300 ${activeFeature === 'agent' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white scale-105 shadow-lg' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              <Bot className="w-5 h-5" />
              <span className="font-medium">科研智能体</span>
            </button>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 md:ml-64 overflow-hidden">
        {/* 科研智能体聊天界面 */}
        {activeFeature === 'agent' && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 h-[calc(100vh-200px)] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">科研智能体</h3>
                <p className="text-xs text-slate-500">DeepSeek 模型驱动</p>
              </div>
            </div>

            {/* 聊天消息区 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center text-slate-400 mt-20">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>开始和科研智能体对话吧！</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'ai' && (
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-indigo-600" />
                    </div>
                  )}
                  <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <Bot className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="bg-slate-100 px-4 py-3 rounded-2xl">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 输入框 */}
            <div className="p-4 border-t border-slate-200">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                  placeholder="输入问题..."
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  disabled={chatLoading}
                />
                <button
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition disabled:opacity-50"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 步骤指示器 - 仅人机协作模式 */}
        {activeFeature === 'generate' && generateMode === 'collaborate' && (
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              {['选题', '文献搜索', '大纲', '写作'].map((label, i) => (
                <div key={i} className="flex items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shadow-lg ${
                    step > i + 1 ? 'bg-green-500 text-white' :
                    step === i + 1 ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' : 'bg-white text-slate-400 border-2 border-slate-200'
                  }`}>
                    {step > i + 1 ? <Check className="w-5 h-5" /> : i + 1}
                  </div>
                  <span className={`ml-3 text-base font-medium ${step === i + 1 ? 'text-indigo-700' : 'text-slate-400'}`}>
                    {label}
                  </span>
                  {i < 3 && <div className={`w-12 h-1 mx-3 rounded-full ${step > i + 1 ? 'bg-green-500' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 模式切换 */}
        {activeFeature === 'generate' && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setGenerateMode('collaborate')}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                  generateMode === 'collaborate'
                    ? 'bg-white text-indigo-700 shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                🤝 人机协作
              </button>
              <button
                onClick={() => setGenerateMode('oneclick')}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                  generateMode !== 'collaborate'
                    ? 'bg-white text-indigo-700 shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                ⚡ 一键生成
              </button>
            </div>
          </div>
        )}

        {/* Step 1: 输入论文信息 */}
        {step === 1 && activeFeature === 'generate' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">输入你的论文主题</h2>
              <p className="text-slate-600">告诉我们你的专业和研究方向，AI帮你细化选题</p>
            </div>

            {/* 人机协作模式 */}
            {generateMode === 'collaborate' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="space-y-6">
                {/* 论文类型 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">论文类型</label>
                  <div className="grid grid-cols-3 gap-3">
                    {PAPER_TYPES.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setPaperType(type.id)}
                        className={`p-4 rounded-xl border-2 text-left transition ${
                          paperType === type.id
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-medium text-slate-900">{type.label}</div>
                        <div className="text-sm text-slate-500">{type.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 专业选择 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    专业方向 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                    placeholder="输入你的专业方向"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {/* 案例行业 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    案例行业（选填）
                  </label>
                  <input
                    type="text"
                    value={caseIndustry}
                    onChange={(e) => setCaseIndustry(e.target.value)}
                    placeholder="例如：医疗、教育、金融"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                  <p className="text-xs text-slate-400 mt-1">指定案例所属行业，生成的论文将以该行业为例展开分析</p>
                </div>

                {/* 论文主题 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    论文主题（如果有的话）
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="例如：基于深度学习的图像去雾算法研究"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {/* 研究方向 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    感兴趣的研究方向（可选）
                  </label>
                  <input
                    type="text"
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    placeholder="例如：人工智能在医疗诊断中的应用"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-4 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 text-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      正在生成选题方向...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="w-5 h-5" />
                      {topic ? '基于主题生成建议' : '根据研究方向生成选题'}
                    </>
                  )}
                </button>
              </div>
            </div>
            )}

            {/* 一键生成模式 */}
            {(generateMode as string) === 'oneclick' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="space-y-6">
                {/* 标题 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    论文标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={oneClickTitle}
                    onChange={(e) => setOneClickTitle(e.target.value)}
                    placeholder="例如：基于深度学习的图像去雾算法研究"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {/* 学历 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">学历层次</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'bachelor', label: '本科', desc: '8000-15000字' },
                      { id: 'master', label: '硕士', desc: '15000-30000字' },
                      { id: 'doctoral', label: '博士', desc: '30000字以上' },
                    ].map((deg) => (
                      <button
                        key={deg.id}
                        onClick={() => setOneClickDegree(deg.id as any)}
                        className={`p-4 rounded-xl border-2 text-left transition ${
                          oneClickDegree === deg.id
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-semibold text-slate-900">{deg.label}</div>
                        <div className="text-xs text-slate-500">{deg.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自定义字数 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    目标字数：<span className="text-indigo-600 font-bold">{oneClickWords.toLocaleString()}</span> 字
                  </label>
                  <input
                    type="range"
                    min="3000"
                    max="50000"
                    step="1000"
                    value={oneClickWords}
                    onChange={(e) => setOneClickWords(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>3000字</span><span>50000字</span>
                  </div>
                </div>

                {/* 专业（选填） */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">专业（选填）</label>
                  <input
                    type="text"
                    value={oneClickMajor}
                    onChange={(e) => setOneClickMajor(e.target.value)}
                    placeholder="例如：计算机科学"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                {oneClickError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {oneClickError}
                  </div>
                )}

                {oneClickSuccess && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    ✅ 论文已加入生成队列！去「我的论文」查看进度
                  </div>
                )}

                <button
                  onClick={handleOneClickGenerate}
                  disabled={oneClickLoading}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {oneClickLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> 生成中...</>
                  ) : (
                    <><Sparkles className="w-5 h-5" /> 一键生成完整论文</>
                  )}
                </button>
                <p className="text-xs text-slate-400 text-center">消耗 10 金币，后台生成无需等待</p>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Step 2: 选择选题 & 文献搜索 */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">选择你的研究方向</h2>
              <p className="text-slate-600">点击选择一个，并搜索相关文献</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">AI 推荐的 {major} 论文选题：</h3>
              
              <TopicCards 
                result={result} 
                onSelect={(idx, topicTitle) => { 
                  setSelectedTopic(idx); 
                  setSelectedTopicTitle(topicTitle || ''); 
                }} 
                selectedTopic={selectedTopic} 
              />
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  文献搜索关键词（基于你的选题自动填充）
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="输入搜索关键词..."
                    className="flex-1 px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                  <button
                    onClick={handleGenerateSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <SearchIcon className="w-5 h-5" />}
                    搜索文献
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  {error}
                </div>
              )}

              {/* 搜索结果 */}
              {searchResults.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium text-slate-900 mb-3">搜索到 {searchResults.length} 篇相关文献（点击选择）：</h4>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {searchResults.map((paper, i) => (
                      <div 
                        key={i}
                        onClick={() => togglePaper(paper)}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition ${
                          selectedPapers.find(p => p.title === paper.title)
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h5 className="font-medium text-slate-900">{paper.title}</h5>
                            <p className="text-sm text-slate-600 mt-1">
                              {paper.authors.join(', ')} · {paper.year} · 引用: {paper.citations}
                            </p>
                            <p className="text-sm text-slate-500 mt-2 line-clamp-2">{paper.abstract}</p>
                            <p className="text-xs text-slate-400 mt-2">来源: {paper.source}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <a 
                              href={paper.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 text-slate-400 hover:text-indigo-600"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            {selectedPapers.find(p => p.title === paper.title) && (
                              <Star className="w-5 h-5 text-indigo-600 fill-indigo-600" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-500 mt-3">
                    已选择 {selectedPapers.length} 篇文献，将在写作时参考
                  </p>
                </div>
              )}

              <div className="mt-6 flex gap-4">
                <button 
                  onClick={() => { setStep(1); setResult(null); setSelectedTopic(null); setSelectedTopicTitle(''); }}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
                >
                  重新生成
                </button>
                <button 
                  onClick={handleGenerateOutline}
                  disabled={selectedTopic === null || outlineLoading}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {outlineLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      生成大纲中...
                    </>
                  ) : (
                    <>
                      {selectedTopic ? `选择第${selectedTopic}个，生成大纲` : '选择选题'}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 大纲生成中 */}
        {step === 3 && outlineLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">正在生成论文大纲...</h3>
            <p className="text-slate-600">AI 正在根据你的选题构建完整的论文结构</p>
          </div>
        )}

        {/* Step 4: 写作模式 */}
        {step === 4 && outline && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">{outline.title}</h2>
              <p className="text-slate-600">共 {chapters.length} 个章节 · 点击章节开始写作</p>
            </div>

            {/* 选中的文献 */}
            {selectedPapers.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-blue-900 mb-2">已参考的文献：</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedPapers.map((paper, i) => (
                    <span key={i} className="px-3 py-1 bg-white rounded-full text-sm text-blue-700 border border-blue-200">
                      {paper.title.slice(0, 30)}...
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 大纲概览 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Layout className="w-5 h-5 text-indigo-600" />
                论文大纲
              </h3>
              <div className="space-y-3">
                {chapters.map((chapter) => (
                  <div 
                    key={chapter.number}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition ${
                      currentChapter === chapter.number 
                        ? 'border-indigo-600 bg-indigo-50' 
                        : chapter.written 
                          ? 'border-green-500 bg-green-50'
                          : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => {
                      setCurrentChapter(chapter.number);
                      setChapterContent(chapter.content_generated || '');
                      setEditingChapter(chapter.number);
                      autoSetWordCount(chapter.title);
                    }}
                    onDoubleClick={() => {
                      setCurrentChapter(chapter.number);
                      setChapterContent(chapter.content_generated || '');
                      autoSetWordCount(chapter.title);
                      setEditingChapter(chapter.number);
                      document.getElementById('chapter-writing-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    title="双击直接跳转到写作区域"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          currentChapter === chapter.number 
                            ? 'bg-indigo-600 text-white' 
                            : chapter.written 
                              ? 'bg-green-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                        }`}>
                          {chapter.written ? <Check className="w-4 h-4" /> : chapter.number}
                        </span>
                        <span className="font-medium text-slate-900">{chapter.title}</span>
                      </div>
                      {chapter.written && (
                        <span className="text-sm text-green-600">已完成</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.number); }}
                        className="text-slate-400 hover:text-red-500 transition p-1"
                        title="删除章节"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 ml-11">{chapter.content}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 章节编辑区 */}
            {editingChapter && (
              <div id="chapter-writing-area" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-slate-900">
                    第{currentChapter}章：{chapters.find(c => c.number === currentChapter)?.title}
                  </h3>
                  <div className="flex items-center gap-3">
                    {chapters.find(c => c.number === currentChapter)?.title.toLowerCase().includes('关键词') || chapters.find(c => c.number === currentChapter)?.title.toLowerCase().includes('keyword')
                      ? (
                        <>
                          <span className="text-sm text-slate-500">关键词数量：</span>
                          <select
                            value={keywordCount}
                            onChange={(e) => setKeywordCount(Number(e.target.value))}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value={3}>3个</option>
                            <option value={4}>4个</option>
                            <option value={5}>5个</option>
                            <option value={6}>6个</option>
                            <option value={8}>8个</option>
                          </select>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-slate-500">目标字数：</span>
                          <select
                            value={targetWordCount}
                            onChange={(e) => setTargetWordCount(Number(e.target.value))}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value={300}>300字（摘要）</option>
                            <option value={500}>500字（摘要/引言）</option>
                            <option value={1000}>1000字（理论基础）</option>
                            <option value={1500}>1500字（引言/理论）</option>
                            <option value={2000}>2000字（问题分析）</option>
                            <option value={2500}>2500字（模型构建）</option>
                            <option value={3000}>3000字（实证分析）</option>
                            <option value={5000}>5000字（核心章节）</option>
                          </select>
                        </>
                      )
                    }
                  </div>
                </div>
                <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => {
                        if (chapterContent && confirm('确定要清空现有内容重新生成吗？')) {
                          setChapterContent('');
                          handleGenerateChapter(currentChapter);
                        } else if (!chapterContent) {
                          handleGenerateChapter(currentChapter);
                        }
                      }}
                      disabled={generatingChapter}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:from-indigo-700 hover:to-purple-700 transition flex items-center gap-2 disabled:opacity-50"
                    >
                      {generatingChapter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {generatingChapter ? '生成中...' : 'AI生成全文'}
                    </button>
                    <button
                      onClick={handlePolish}
                      disabled={!chapterContent || polishing}
                      className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {polishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      润色降AI率
                    </button>
                    <button
                      onClick={() => handleGenerateChapter(currentChapter)}
                      disabled={generatingChapter}
                      className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-medium hover:bg-indigo-200 transition flex items-center gap-2 disabled:opacity-50"
                    >
                      {generatingChapter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                      {generatingChapter ? '生成中...' : 'AI续写'}
                    </button>
                    <button
                      onClick={handleSaveChapter}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      保存章节
                    </button>
                </div>
                
                <div className={`relative ${generatingChapter ? 'select-none' : ''}`}>
                  <textarea
                    value={chapterContent}
                    onChange={(e) => setChapterContent(e.target.value)}
                    className={`w-full h-96 px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-none ${generatingChapter ? 'cursor-not-allowed select-none' : ''}`}
                    placeholder="在此输入或编辑章节内容... 点击「AI续写」让AI帮你生成内容"
                    disabled={generatingChapter}
                    onContextMenu={generatingChapter ? (e) => e.preventDefault() : undefined}
                    onCopy={generatingChapter ? (e) => e.preventDefault() : undefined}
                    onSelect={generatingChapter ? (e) => e.preventDefault() : undefined}
                  />
                  {generatingChapter && (
                    <div className="absolute inset-0 bg-white/70 rounded-lg flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                      <p className="text-slate-600">AI 正在撰写章节内容...</p>
                      <p className="text-sm text-slate-400 mt-1">预计需要 1-2 分钟</p>
                    </div>
                  )}
                </div>
                
                <div className="mt-4 flex justify-between items-center">
                  <div className="flex gap-2">
                    {currentChapter > 1 && (
                      <button
                        onClick={() => {
                          setCurrentChapter(currentChapter - 1);
                          const prev = chapters.find(c => c.number === currentChapter - 1);
                          setChapterContent(prev?.content_generated || '');
                          setEditingChapter(prev?.written ? currentChapter - 1 : null);
                        }}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition"
                      >
                        上一章
                      </button>
                    )}
                    {currentChapter < chapters.length && (
                      <button
                        onClick={() => {
                          setCurrentChapter(currentChapter + 1);
                          const next = chapters.find(c => c.number === currentChapter + 1);
                          setChapterContent(next?.content_generated || '');
                          setEditingChapter(next?.written ? currentChapter + 1 : null);
                        }}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition"
                      >
                        下一章
                      </button>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">
                    {chapterContent.length} 字
                  </span>
                </div>
              </div>
            )}

            {/* 完成提示 - 排版导出 */}
            {chapters.every(c => c.written) && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-8">
                <div className="text-center mb-6">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-green-900 mb-2">恭喜！论文初稿已完成！</h3>
                  <p className="text-green-700">所有章节已撰写完成，AI已排版好格式。</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 space-y-4 max-w-md mx-auto">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">学生姓名</label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="输入你的姓名，会自动填入文档"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-green-500 outline-none transition"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">选择导出格式</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleExport('word')}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition"
                      >
                        <FileDown className="w-8 h-8 text-indigo-600" />
                        <span className="text-sm font-medium text-indigo-700">Word 文档</span>
                        <span className="text-xs text-indigo-500">.docx 可编辑</span>
                      </button>
                      <button
                        onClick={() => handleExport('pdf')}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-white transition"
                      >
                        <FileDown className="w-8 h-8 text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">PDF 文件</span>
                        <span className="text-xs text-slate-400">.pdf 正式提交用</span>
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setShowExportPreview(true)}
                    className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition flex items-center justify-center gap-2"
                  >
                    <FileDown className="w-4 h-4" />
                    预览文档内容
                  </button>
                  
                  <p className="text-xs text-slate-400 text-center">
                    文档已按学术论文格式排版，包含封面、声明、目录、章节内容、参考文献等
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 文献搜索界面 */}
        {activeFeature === 'search' && (
          <div className="w-full max-h-[calc(100vh-180px)] overflow-y-auto space-y-4 pb-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">文献搜索</h3>
                  <p className="text-xs text-slate-500">OpenAlex · arXiv · CrossRef · PubMed · DOAJ · 免费</p>
                </div>
              </div>

              <div className="flex gap-3 mb-4">
                <div className="flex-1 relative">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="输入论文主题、关键词或研究问题..."
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm" />
                </div>
                <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                  {searching ? '搜索中...' : '搜索'}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                {['全部', 'OpenAlex', 'arXiv', 'CrossRef', 'PubMed', 'DOAJ'].map(src => (
                  <button key={src} onClick={() => setSearchFilter(src)}
                    className={'px-3 py-1.5 rounded-full text-xs font-medium transition ' + (searchFilter === src ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                    {src}
                  </button>
                ))}
                <span className="text-xs text-slate-400 ml-2">
                  {searching ? '搜索中...' : filteredResults.length + ' 条结果'}
                </span>
              </div>

              {searchError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{searchError}</div>
              )}

              {!searching && searched && filteredResults.length === 0 && !searchError && (
                <div className="text-center py-12 text-slate-500">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">未找到相关文献</p>
                  <p className="text-xs mt-1">试试更换关键词</p>
                </div>
              )}

              {!searching && !searched && (
                <div className="text-center py-10 text-slate-400">
                  <BookOpen className="w-14 h-14 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">输入关键词开始搜索</p>
                  <p className="text-xs mt-1">支持中英文，支持复杂研究问题</p>
                  <div className="flex gap-2 justify-center mt-3 flex-wrap">
                    {['深度学习', '气候变化', '人工智能', '可持续能源'].map(k => (
                      <button key={k} onClick={() => setSearchQuery(k)}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition">
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searching && (
                <div className="text-center py-12 text-slate-400">
                  <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">正在从多个学术数据库搜索...</p>
                </div>
              )}

              {!searching && filteredResults.length > 0 && (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredResults.map((paper, i) => {
                    const srcColor = paper.source === 'OpenAlex' ? 'bg-blue-100 text-blue-700' : paper.source === 'arXiv' ? 'bg-orange-100 text-orange-700' : paper.source === 'CrossRef' ? 'bg-slate-100 text-slate-700' : paper.source === 'PubMed' ? 'bg-green-100 text-green-700' : paper.source === 'DOAJ' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600';
                    return (
                      <div key={i} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className={'px-2 py-0.5 rounded text-xs font-medium ' + srcColor}>{paper.source}</span>
                              {paper.year && <span className="text-xs text-slate-400">{paper.year}</span>}
                              {paper.citations > 0 && <span className="text-xs text-amber-600">⭐ {paper.citations}</span>}
                            </div>
                            <h4 className="text-sm font-semibold text-slate-900 leading-snug mb-1">{paper.title}</h4>
                            {paper.authors && paper.authors.length > 0 && <p className="text-xs text-slate-500 mb-1">{paper.authors.slice(0,3).join(' · ')}{paper.authors.length > 3 ? '...' : ''}</p>}
                            <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{paper.abstract}</p>
                          </div>
                          <a href={paper.url} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 w-8 h-8 bg-slate-100 hover:bg-indigo-100 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 transition">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI PPT界面 */}
        {activeFeature === 'ppt' && (
          <div className="w-full max-h-[calc(100vh-180px)] overflow-y-auto space-y-4 pb-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Presentation className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">AI 答辩PPT</h3>
                  <p className="text-xs text-slate-500">输入信息，一键生成专业答辩PPT</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* 论文标题 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">论文标题 <span className="text-red-500">*</span></label>
                  <input value={pptTitle} onChange={e => setPptTitle(e.target.value)}
                    placeholder="例如：基于深度学习的图像识别技术研究"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>

                {/* 姓名 + 学校 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">姓名 <span className="text-red-500">*</span></label>
                    <input value={pptName} onChange={e => setPptName(e.target.value)} placeholder="张三"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">学校</label>
                    <input value={pptSchool} onChange={e => setPptSchool(e.target.value)} placeholder="某某大学"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  </div>
                </div>

                {/* 关键词 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">关键词</label>
                  <input value={pptKeywords} onChange={e => setPptKeywords(e.target.value)} placeholder="深度学习、图像识别、卷积神经网络"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>

                {/* 模板选择 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-slate-800">🎨 选择模板</label>
                    {pptSelectedTemplate && (
                      <button onClick={() => setPptSelectedTemplate(null)} className="text-xs text-red-400 hover:text-red-500">取消选择</button>
                    )}
                  </div>
                  {pptSelectedTemplate ? (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 border border-indigo-200 rounded-xl">
                      <div className="flex rounded-lg overflow-hidden flex-shrink-0">
                        <div className="w-4 h-10" style={{backgroundColor: '#' + pptSelectedTemplate.colors?.primary}} />
                        <div className="w-4 h-10" style={{backgroundColor: '#' + pptSelectedTemplate.colors?.secondary}} />
                        <div className="w-4 h-10" style={{backgroundColor: '#' + pptSelectedTemplate.colors?.accent}} />
                        <div className="w-4 h-10" style={{backgroundColor: '#' + pptSelectedTemplate.colors?.bg}} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">[{pptSelectedTemplate.index}] {pptSelectedTemplate.name}</div>
                        <div className="text-xs text-slate-400">{pptSelectedTemplate.slideCount}页 · {pptSelectedTemplate.category}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex gap-2 p-3 overflow-x-auto" style={{scrollbarWidth:'none'}}>
                        {pptTemplates.slice(0,20).map((t: any) => (
                          <button key={t.id} onClick={() => setPptSelectedTemplate(t)}
                            className="flex-shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-400 transition-all"
                            title={`[${t.index}] ${t.name}`}>
                            <div className="flex h-10">
                              <div className="w-5" style={{backgroundColor: '#' + t.colors?.primary}} />
                              <div className="w-5" style={{backgroundColor: '#' + t.colors?.secondary}} />
                              <div className="w-5" style={{backgroundColor: '#' + t.colors?.accent}} />
                              <div className="w-5" style={{backgroundColor: '#' + t.colors?.bg}} />
                            </div>
                            <div className="text-center text-xs font-bold text-indigo-600 px-0.5 py-0.5">{t.index}</div>
                          </button>
                        ))}
                      </div>
                      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
                        共 {pptTemplates.length} 个模板
                      </div>
                    </div>
                  )}
                </div>

                {/* 页数选择 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-slate-800">PPT页数</label>
                    <span className="text-xl font-bold text-indigo-600">{pptPages}<span className="text-sm text-slate-400 font-normal ml-1">页</span></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PPT_PAGE_OPTIONS.map(n => (
                      <button key={n} onClick={() => { setPptPages(n); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${pptPages === n ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                        {n}页
                      </button>
                    ))}
                  </div>
                  <input type="range" min={15} max={60} step={1} value={pptPages} onChange={e => setPptPages(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer" />
                  <p className="text-center text-xs text-slate-400 mt-1">建议演讲时长：<span className="text-indigo-600 font-semibold">{getPptTimeRange(pptPages).min}-{getPptTimeRange(pptPages).max} 分钟</span></p>
                </div>

                {pptError && (
                  <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">⚠️ {pptError}</div>
                )}

                {/* 生成按钮 */}
                <button onClick={handlePptGenerate} disabled={pptLoading}
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                  {pptLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{pptProgress || '生成中...'}</> : <><Presentation className="w-4 h-4" />一键生成答辩PPT</>}
                </button>

                {/* 成功下载区 */}
                {pptDownloadUrl && !pptLoading && (
                  <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl text-center">
                    <p className="text-base font-bold text-green-700 mb-1">✅ PPT生成成功！</p>
                    <p className="text-xs text-green-500 mb-3">文件已生成，可直接下载</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <a href={pptDownloadUrl.startsWith("/") ? "/api/ppt/download?file=" + encodeURIComponent(pptDownloadUrl.slice(1)) : pptDownloadUrl} download
                        className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2">
                        <Download className="w-4 h-4" />下载PPT
                      </a>
                      <button onClick={() => setPptShowPreview(!pptShowPreview)}
                        className="px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors">
                        {pptShowPreview ? "关闭预览" : "在线预览"}
                      </button>
                    </div>
                    {pptShowPreview && (
                      <iframe
                        src={'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent('https://pepperai.com.cn' + (pptDownloadUrl.startsWith('/') ? '/api/ppt/download?file=' + encodeURIComponent(pptDownloadUrl.slice(1)) : pptDownloadUrl))}
                        width="100%" height="400" frameBorder="0" className="rounded-xl border border-slate-200 mt-3"></iframe>
                    )}
                    <div className="flex gap-2 justify-center flex-wrap mt-2">
                      <button onClick={() => { setPptDownloadUrl(''); setPptTitle(''); }}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />重新生成
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 论文翻译界面 */}
        {activeFeature === 'translate' && (
          <div className="w-full max-h-[calc(100vh-180px)] overflow-y-auto space-y-4 pb-4">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Languages className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">论文翻译</h3>
                  <p className="text-xs text-slate-500">支持13种语言互译 · 保留文档格式</p>
                </div>
              </div>

              {/* 语言选择 */}
              <div className="flex items-center gap-3 mb-4">
                <select value={translateFrom} onChange={e => setTranslateFrom(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
                <button onClick={swapTranslateLang}
                  className="p-2 rounded-full hover:bg-slate-100 transition text-slate-500 hover:text-indigo-600"
                  title="交换语言">
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
                <select value={translateTo} onChange={e => setTranslateTo(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>

              {/* 原文输入区 */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 mb-4">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <FileText className="w-3.5 h-3.5" />
                    <span>原文 {translateInput ? `(${translateInput.length} 字符)` : ''}</span>
                    {translateFileName && <span className="text-indigo-600">📎 {translateFileName}</span>}
                  </div>
                  <div className="flex gap-2">
                    <input type="file" accept=".docx,.txt" ref={translateFileRef} onChange={handleTranslateFile} className="hidden" />
                    <button onClick={() => translateFileRef.current?.click()}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
                      <Upload className="w-3 h-3" /> 上传文件
                    </button>
                  </div>
                </div>
                <textarea
                  value={translateInput}
                  onChange={e => setTranslateInput(e.target.value)}
                  placeholder="粘贴要翻译的文本，或上传 .docx / .txt 文件..."
                  className="w-full p-4 h-40 text-sm resize-none focus:outline-none rounded-b-xl"
                  onCopy={e => e.preventDefault()}
                  onPaste={e => e.preventDefault()}
                  onCut={e => e.preventDefault()}
                />
              </div>

              {/* 翻译按钮 */}
              <div className="flex justify-center mb-4">
                <button onClick={handleTranslate} disabled={translateLoading}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                  {translateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                  {translateLoading ? '翻译中...' : '开始翻译'}
                </button>
              </div>

              {/* 错误提示 */}
              {translateError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4 text-center">{translateError}</div>
              )}

              {/* 译文区 */}
              {translateResult && (
                <div className="bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                    <span className="text-xs text-slate-500">译文 {translateResult.length} 字符</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(translateResult); alert('已复制到剪贴板'); }}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition">
                      <FileDown className="w-3 h-3" /> 复制
                    </button>
                  </div>
                  <textarea value={translateResult} readOnly
                    className="w-full p-4 h-40 text-sm resize-none focus:outline-none rounded-b-xl bg-slate-50"
                    onCopy={e => e.preventDefault()} onPaste={e => e.preventDefault()} onCut={e => e.preventDefault()}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 复习资料界面 */}
        {activeFeature === 'review' && (
          <div className="w-full max-h-[calc(100vh-180px)] overflow-y-auto space-y-4 pb-4">

            {/* 步骤指示 */}
            <div className="flex items-center justify-center gap-2 mb-2">
              {['上传资料', '预览确认', '生成结果'].map((s, i) => {
                const stepMap: Record<string, number> = { upload: 0, preview: 1, result: 2 };
                const cur = stepMap[reviewStep];
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${cur >= i ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</div>
                    <span className={`text-xs ${cur >= i ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>{s}</span>
                    {i < 2 && <div className={`w-8 h-px mx-1 ${cur > i ? 'bg-indigo-300' : 'bg-slate-200'}`} />}
                  </div>
                );
              })}
            </div>

            {reviewError && (
              <div className="flex items-start gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{reviewError}</span>
              </div>
            )}

            {/* 步骤1: 上传 */}
            {reviewStep === 'upload' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">输入课程名称</h3>
                  <input type="text" value={reviewCourseName} onChange={e => setReviewCourseName(e.target.value)}
                    placeholder="例如：计算机网络、数据结构、宏观经济学"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">上传课程资料</h3>
                  <p className="text-xs text-slate-500 mb-3">支持 TXT、Word（.docx）格式，推荐上传PPT课件或PDF</p>
                  <input ref={reviewFileRef} type="file" accept=".txt,.docx,.md"
                    onChange={handleReviewFileUpload} className="hidden" />
                  <button onClick={() => reviewFileRef.current?.click()} disabled={reviewFileLoading}
                    className="w-full py-6 border-2 border-dashed border-indigo-300 rounded-xl flex flex-col items-center gap-2 hover:border-indigo-500 hover:bg-indigo-50/50 transition disabled:opacity-50 cursor-pointer">
                    {reviewFileLoading ? (
                      <><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /><p className="text-sm text-slate-500">正在解析文件...</p></>
                    ) : (
                      <><Upload className="w-8 h-8 text-indigo-400" /><p className="text-sm text-slate-500">点击上传课程资料</p><p className="text-xs text-slate-400">TXT · DOCX · MD</p></>
                    )}
                  </button>
                  {reviewFileName && !reviewFileLoading && (
                    <p className="mt-2 text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" />已选择: {reviewFileName}</p>
                  )}
                </div>

                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-start gap-2">
                  <Coins className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <span className="font-semibold">生成费用：40金币/次</span>
                    <p className="mt-0.5 text-amber-700">包含：核心知识点 · 名词解释 · 简答题 · 填空题 · 知识框架图</p>
                  </div>
                </div>

                <button onClick={() => reviewExtractedText ? setReviewStep('preview') : null}
                  disabled={!reviewExtractedText || !reviewCourseName.trim()}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  下一步：预览内容
                </button>
              </div>
            )}

            {/* 步骤2: 预览 */}
            {reviewStep === 'preview' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">确认课程资料</h3>
                    <span className="text-xs text-slate-400">{reviewCourseName} ({reviewExtractedText.length}字)</span>
                  </div>
                  <textarea value={reviewExtractedText}
                    onChange={e => setReviewExtractedText(e.target.value.slice(0, 8000))}
                    className="w-full h-48 px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 resize-none"
                    placeholder="从文件中提取的文字会显示在这里，可以手动编辑删减..." />
                  <p className="mt-1 text-xs text-slate-400 text-right">最多8000字</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setReviewStep('upload')}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition">上一步</button>
                  <button onClick={handleReviewGenerate} disabled={reviewLoading}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {reviewLoading ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : '🚀 开始生成复习资料（40金币）'}
                  </button>
                </div>
              </div>
            )}

            {/* 步骤3: 结果 */}
            {reviewStep === 'result' && (
              <div className="space-y-3">
                {reviewLoading && (
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-3" />
                    <p className="text-slate-600 font-medium mb-1">正在生成复习资料...</p>
                    <p className="text-xs text-slate-400">预计需要10-30秒，请稍候</p>
                  </div>
                )}

                {!reviewLoading && reviewResult && (
                  <>
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-800">📚 {reviewCourseName} 复习资料</h3>
                        <div className="flex items-center gap-2">
                          <button onClick={handleReviewCopy}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
                            {reviewCopied ? <><CheckCircle className="w-3.5 h-3.5" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
                          </button>
                          <button onClick={handleReviewDownload}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
                            <Download className="w-3.5 h-3.5" />下载
                          </button>
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed bg-slate-50 p-4 rounded-xl overflow-auto max-h-80">
                        {reviewResult}
                      </pre>
                    </div>

                    <button onClick={handleReviewReset}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition">
                      🆕 生成新的复习资料
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 降重降AI界面 */}
        {activeFeature === 'reduce' && (
          <div className="relative z-10 w-full max-h-[calc(100vh-180px)] overflow-y-auto space-y-4 pb-4">
            <div className="bg-white/95 rounded-2xl shadow-lg border border-slate-200/60 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
                  <Scale className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">降重降AI</h3>
                  <p className="text-xs text-slate-500">上传论文文档，一键降低重复率 & AI率</p>
                </div>
              </div>

              {/* 模式选择 */}
              <div className="mb-4">
                <label className="text-sm font-semibold text-slate-800 block mb-2">处理模式</label>
                <div className="flex gap-2">
                  {[{ id: 'both', label: '双降', color: 'from-amber-400 to-orange-500' }, { id: 'plagiarism', label: '仅降重', color: 'from-blue-400 to-indigo-500' }, { id: 'ai', label: '仅降AI', color: 'from-emerald-400 to-teal-500' }].map(m => (
                    <button key={m.id}
                      onClick={() => setReduceMode(m.id as any)}
                      className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${reduceMode === m.id ? `bg-gradient-to-r ${m.color} text-white shadow` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 语言 + 平台 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">语言</label>
                  <div className="flex gap-1">
                    {[{ id: 'chinese', label: '中文' }, { id: 'english', label: '英文' }].map(l => (
                      <button key={l.id} onClick={() => { setReduceLang(l.id as any); setReducePlatform(l.id === 'chinese' ? 'zhiwang' : 'zhiwang'); }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${reduceLang === l.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{l.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">检测平台</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(reduceLang === 'chinese'
                      ? [
                          { id: 'zhiwang', label: '知网', color: 'bg-orange-50 border-orange-200 text-orange-700 active:ring-orange-400', active: 'bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-orange-200 shadow' },
                          { id: 'vip', label: '维普', color: 'bg-blue-50 border-blue-200 text-blue-700 active:ring-blue-400', active: 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-blue-200 shadow' },
                          { id: 'gezida', label: '格子达', color: 'bg-purple-50 border-purple-200 text-purple-700 active:ring-purple-400', active: 'bg-gradient-to-br from-purple-400 to-pink-500 text-white shadow-purple-200 shadow' },
                          { id: 'daya', label: '大雅', color: 'bg-green-50 border-green-200 text-green-700 active:ring-green-400', active: 'bg-gradient-to-br from-green-400 to-teal-500 text-white shadow-green-200 shadow' },
                          { id: 'wanfang', label: '万方', color: 'bg-teal-50 border-teal-200 text-teal-700 active:ring-teal-400', active: 'bg-gradient-to-br from-teal-400 to-cyan-500 text-white shadow-teal-200 shadow' },
                        ]
                      : [
                          { id: 'zhiwang', label: '知网', color: 'bg-orange-50 border-orange-200 text-orange-700 active:ring-orange-400', active: 'bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-orange-200 shadow' },
                          { id: 'vip', label: '维普', color: 'bg-blue-50 border-blue-200 text-blue-700 active:ring-blue-400', active: 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-blue-200 shadow' },
                          { id: 'turnitin', label: 'Turnitin', color: 'bg-red-50 border-red-200 text-red-700 active:ring-red-400', active: 'bg-gradient-to-br from-red-400 to-orange-500 text-white shadow-red-200 shadow' },
                        ]
                    ).map(p => (
                      <button key={p.id}
                        onClick={() => setReducePlatform(p.id)}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${reducePlatform === p.id ? p.active : p.color}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 费用说明 */}
              <div className="bg-amber-50 rounded-xl p-3 mb-4 border border-amber-100 flex items-start gap-2">
                <Coins className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <span className="font-semibold">计费：{Math.ceil(reduceCharCount / 1000) * 20}金币</span>
                  <p className="mt-0.5 text-amber-700">字数：{reduceCharCount} · 知网/维普/格子达/大雅/万方</p>
                </div>
              </div>

              {/* 文件上传 */}
              {reduceDocxStep === 'idle' && (
                <div>
                  <input ref={reduceFileRef} type="file" accept=".docx"
                    onChange={handleReduceFileUpload} className="hidden" />
                  <button onClick={() => reduceFileRef.current?.click()} disabled={reduceParsing}
                    className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/30 transition disabled:opacity-50 cursor-pointer">
                    {reduceParsing ? (
                      <><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /><p className="text-sm text-slate-500">正在解析文档...</p></>
                    ) : (
                      <><Upload className="w-8 h-8 text-slate-400" /><p className="text-sm text-slate-500">点击上传 Word 文档（.docx）</p><p className="text-xs text-slate-400">仅支持 Word 2007+ 格式（.docx）</p></>
                    )}
                  </button>
                  {reduceDocxFile && !reduceParsing && (
                    <p className="mt-2 text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" />已选择: {reduceDocxFile.name}</p>
                  )}
                </div>
              )}

              {/* 确认界面 */}
              {reduceDocxStep === 'confirm' && reduceDocxFile && (
                <div className="space-y-3">
                  <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-slate-800">{reduceDocxFile.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{reduceCharCount} 字</span>
                      <span className="text-amber-600 font-semibold">{reduceCost} 金币</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                    <p className="text-xs text-indigo-600 mt-1.5 font-medium">{reduceMode === 'both' ? '降重 + 降AI' : reduceMode === 'plagiarism' ? '仅降重' : '仅降AI'} · {reduceLang === 'chinese' ? '中文' : '英文'} · {reducePlatform === 'zhiwang' ? '知网' : reducePlatform}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleReduceReset}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition">重新选择</button>
                    <button onClick={handleReduceStart}
                      className="flex-1 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-semibold shadow hover:shadow-lg transition flex items-center justify-center gap-2">
                      <SparklesIcon className="w-4 h-4" />确认开始处理
                    </button>
                  </div>
                </div>
              )}

              {/* 处理中 */}
              {reduceDocxStep === 'processing' && (
                <div className="space-y-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-indigo-700">{reduceStatusMsg || '处理中...'}</p>
                      <div className="mt-2 h-2 bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${reduceProgress}%` }} />
                      </div>
                      <p className="text-xs text-indigo-500 mt-1">{reduceProgress}%</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 text-center">预计需30秒~3分钟，请勿关闭页面</p>
                </div>
              )}

              {/* 完成 */}
              {reduceDocxStep === 'done' && (
                <div className="space-y-3">
                  <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl text-center">
                    <p className="text-base font-bold text-green-700 mb-1">✅ 处理完成！</p>
                    <p className="text-xs text-green-500 mb-3">文件已生成，可直接下载</p>
                    <button onClick={handleReduceDownload}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition shadow flex items-center justify-center gap-2 mx-auto">
                      <Download className="w-4 h-4" />下载降AI文档
                    </button>
                  </div>
                  <button onClick={handleReduceReset}
                    className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2">
                    <RotateCcw className="w-4 h-4" />处理新的文档
                  </button>
                </div>
              )}

              {/* 错误 */}
              {reduceDocxStep === 'error' && reduceError && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{reduceError}</span>
                </div>
              )}
              {reduceDocxStep === 'error' && (
                <button onClick={handleReduceReset}
                  className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition">重新上传</button>
              )}
            </div>
          </div>
        )}

      </main>
      </div>

      {/* 导出预览弹窗 */}
      {showExportPreview && (() => {
        const written = chapters.filter(c => c.written && c.content_generated);
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExportPreview(false)}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">📄 文档预览</h2>
                <button onClick={() => setShowExportPreview(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
              </div>
              <div className="p-6 space-y-6">
                {/* 封面预览 */}
                <div className="text-center space-y-2 bg-slate-50 rounded-xl p-6">
                  <p className="text-2xl font-bold text-slate-900">{outline?.title || topic || interest || '毕业论文'}</p>
                  <p className="text-sm text-slate-500">专业：{major || '___________'}</p>
                  <p className="text-sm text-slate-500">姓名：{studentName || '___________'}</p>
                  <p className="text-sm text-slate-500">指导教师：___________</p>
                  <p className="text-xs text-slate-400 mt-4">封面</p>
                </div>

                {/* 声明页 */}
                <div className="border-t border-dashed border-slate-200 pt-4">
                  <p className="text-sm text-slate-400 mb-2">声明页</p>
                  <p className="text-sm text-slate-600">本论文是我在导师指导下进行的研究工作及取得的研究成果...</p>
                </div>

                {/* 摘要 */}
                <div className="border-t border-dashed border-slate-200 pt-4">
                  <p className="text-sm text-slate-400 mb-2">摘要 & 关键词</p>
                  <p className="text-sm text-slate-400 italic">[请在此填写中文摘要]</p>
                </div>

                {/* 目录 */}
                <div className="border-t border-dashed border-slate-200 pt-4">
                  <p className="text-sm text-slate-400 mb-2">目    录</p>
                  {written.map(ch => (
                    <p key={ch.number} className="text-sm text-slate-700">
                      {ch.number > 1 ? `第${['零','一','二','三','四','五','六','七','八','九','十'][ch.number]}章 ` : ''}{ch.title}
                    </p>
                  ))}
                  <p className="text-sm text-slate-700">参考文献</p>
                  <p className="text-sm text-slate-700">致    谢</p>
                </div>

                {/* 章节内容预览 */}
                {written.map(ch => (
                  <div key={ch.number} className="border-t border-dashed border-slate-200 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-slate-800">
                        {ch.number > 1 ? `第${['零','一','二','三','四','五','六','七','八','九','十'][ch.number]}章 ` : ''}{ch.title}
                      </p>
                      <span className="text-xs text-green-600">✓ {ch.content_generated?.length || 0} 字</span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">
                      {ch.content_generated?.slice(0, 200)}...
                    </p>
                  </div>
                ))}

                {/* 底部 */}
                <div className="border-t border-dashed border-slate-200 pt-4 space-y-2">
                  <p className="text-sm text-slate-400">参考文献 & 致谢占位</p>
                  <p className="text-xs text-slate-400">* 参考文献请在 Word 中手动添加，按 GB/T 7714 格式</p>
                </div>
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex gap-3">
                <button
                  onClick={() => setShowExportPreview(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition"
                >
                  关闭预览
                </button>
                <button
                  onClick={() => { setShowExportPreview(false); handleExport('word'); }}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  下载 Word
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    {/* 个人资料弹窗 */}
    {showProfileModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
          <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-8 pb-20">
            <button 
              onClick={() => setShowProfileModal(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-white/30 backdrop-blur rounded-full flex items-center justify-center mb-4 overflow-hidden">
                <img 
                  src={`https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(accountData?.email || accountData?.phone || 'user')}`} 
                  alt="avatar" 
                  className="w-full h-full"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {accountData?.name || accountData?.email?.split('@')[0] || accountData?.phone?.slice(-4) || '新用户'}
              </h2>
              <p className="text-white/80 text-sm">{accountData?.email ? '📧 邮箱账号' : '📱 手机账号'}</p>
            </div>
          </div>

          <div className="bg-white -mt-8 rounded-t-2xl p-6 space-y-4">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-600 mb-1">账户余额</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {accountData?.balance !== undefined && accountData?.balance !== null ? accountData.balance : '—'} 
                    <span className="text-sm font-normal">金币</span>
                  </p>
                  <p className="text-xs text-amber-500 mt-1">1元 = 10金币 · 千字100金币</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                    <span className="text-xl">💰</span>
                  </div>
                  <button onClick={() => window.location.href = '/topup'} className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium rounded-lg shadow hover:shadow-lg transition">
                    充值
                  </button>
                </div>
              </div>
            </div>

            {/* 签到卡片 */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  <span className="font-medium text-green-700">每日签到</span>
                </div>
                <div className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  连续{signInInfo.consecutive_days}天
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-green-600 mb-3">
                <span>签到规则：每日5金币</span>
                <span className="text-green-400">|</span>
                <span>连续3天+5金币</span>
                <span className="text-green-400">|</span>
                <span>连续7天+20金币</span>
              </div>
              <button
                onClick={async () => {
                  if (signInInfo.today_signed) {
                    alert('今日已签到，明天再来吧！');
                    return;
                  }
                  try {
                    const res = await fetch('/api/sign-in', { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    alert(data.message);
                    handleOpenAccount();
                  } catch (err: any) {
                    alert(err.message || '签到失败');
                  }
                }}
                className={`w-full py-2.5 rounded-xl font-medium shadow transition-all ${signInInfo.today_signed 
                  ? 'bg-green-100 text-green-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg hover:-translate-y-0.5'}`}
                disabled={signInInfo.today_signed}
              >
                {signInInfo.today_signed ? '✅ 今日已签到' : '🎁 立即签到'}
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">账号</span>
                <span className="text-slate-900 font-medium truncate max-w-[180px]">{accountData?.email || accountData?.phone || '加载中...'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">注册时间</span>
                <span className="text-slate-900">{accountData?.created_at ? new Date(accountData.created_at).toLocaleDateString('zh-CN') : '-'}</span>
              </div>
            </div>

            <button
              onClick={() => {
                const btn = document.getElementById('changePwBtn2');
                const form = document.getElementById('changePwForm2');
                if (form && btn) {
                  form.style.display = form.style.display === 'none' ? 'block' : 'none';
                  btn.style.display = form.style.display === 'none' ? 'flex' : 'none';
                }
              }}
              id="changePwBtn2"
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              🔑 修改密码
            </button>

            <div id="changePwForm2" style={{display: 'none'}} className="space-y-3">
              <div className="flex gap-2">
                <input type="text" id="pwCode2" placeholder="验证码" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"/>
                <button
                  id="sendPwCodeBtn2"
                  onClick={async () => {
                    const btn = document.getElementById('sendPwCodeBtn2') as HTMLButtonElement;
                    btn.disabled = true;
                    btn.textContent = '发送中...';
                    try {
                      const res = await fetch('/api/auth/send-change-pw-code', { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      alert('验证码已发送到您的邮箱');
                      let countdown = 60;
                      const timer = setInterval(() => {
                        countdown--;
                        if (countdown <= 0) {
                          clearInterval(timer);
                          btn.disabled = false;
                          btn.textContent = '发送验证码';
                        } else {
                          btn.textContent = `${countdown}秒`;
                        }
                      }, 1000);
                    } catch (err: any) {
                      alert(err.message || '发送失败');
                      btn.disabled = false;
                      btn.textContent = '发送验证码';
                    }
                  }}
                  className="px-3 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 whitespace-nowrap"
                >发送验证码</button>
              </div>
              <input type="password" id="newPw2" placeholder="新密码（至少6位）" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"/>
              <button
                onClick={async () => {
                  const pw = (document.getElementById('newPw2') as HTMLInputElement).value;
                  const code = (document.getElementById('pwCode2') as HTMLInputElement).value;
                  if (pw.length < 6) { alert('密码至少6位'); return; }
                  if (!code) { alert('请输入验证码'); return; }
                  const res = await fetch('/api/auth/set-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pw, code, email: accountData?.email }),
                  });
                  const data = await res.json();
                  if (!res.ok) { alert(data.error || '修改失败'); return; }
                  alert('密码修改成功！');
                  document.getElementById('changePwForm2')!.style.display = 'none';
                  document.getElementById('changePwBtn2')!.style.display = 'flex';
                  handleOpenAccount();
                }}
                className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm rounded-lg hover:opacity-90"
              >确认修改</button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* 关于我们弹窗 */}
    {false && ( // 暂时隐藏，等用户确认
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">关于我们</h2>
          <div className="space-y-4 text-slate-600 text-sm">
            <p><strong className="text-indigo-600">Pepper 智能论文助手</strong>是一款基于人工智能技术的论文写作辅助工具。</p>
            <p>我们致力于帮助学术研究者、学生快速生成高质量论文内容，降低AI检测率，提升论文通过率。</p>
            <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
              <p className="font-medium text-indigo-700">核心功能</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>AI论文生成与润色</li>
                <li>智能降重降AI率</li>
                <li>AIGC检测服务</li>
                <li>科研智能问答</li>
              </ul>
            </div>
            <p className="text-center text-xs text-slate-400 pt-4">© 2026 Pepper 版权所有</p>
          </div>
        </div>
      </div>
    )}

    {/* 我的论文历史弹窗 */}
    {showHistory && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">📁 我的论文</h2>
            <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-70px)]">
            {paperHistory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-slate-300" />
                </div>
                <p className="text-slate-500 text-lg mb-2">暂无历史文章</p>
                <p className="text-slate-400 text-sm">近7天内生成的文章会显示在这里</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paperHistory.map((paper: any) => (
                  <div
                    key={paper.id}
                    className="w-full p-4 bg-slate-50 hover:bg-indigo-50 rounded-xl transition group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-900 group-hover:text-indigo-700 mb-1">{paper.title || '无标题'}</h3>
                        <p className="text-xs text-slate-500">{paper.major || ''} · {paper.paper_type || ''}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {paper.created_at ? new Date(paper.created_at).toLocaleString('zh-CN') : ''}
                        </p>
                      </div>
                      {/* 状态标签 */}
                      {paper.status === 'generating' && (
                        <span className="flex-shrink-0 text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                          🔄 生成中 {paper.progress || 0}%
                        </span>
                      )}
                      {paper.status === 'completed' && (
                        <span className="flex-shrink-0 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                          ✅ 完成
                        </span>
                      )}
                      {paper.status === 'failed' && (
                        <span className="flex-shrink-0 text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">
                          ❌ 失败
                        </span>
                      )}
                    </div>

                    {/* 进度条 */}
                    {paper.status === 'generating' && (
                      <div className="mb-3">
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${paper.progress || 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          正在生成论文，预计需要3-5分钟，请稍候...
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {paper.status === 'generating' ? (
                        <>
                          <button
                            onClick={async () => {
                              // 查询最新状态
                              try {
                                const res = await fetch(`/api/papers/status?id=${paper.id}`);
                                const data = await res.json();
                                if (data.paper) {
                                  const updated = paperHistory.map(p => p.id === paper.id ? { ...p, ...data.paper } : p);
                                  setPaperHistory(updated);
                                }
                              } catch { /* ignore */ }
                            }}
                            className="flex-1 py-2 bg-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-300 transition flex items-center justify-center gap-1"
                          >
                            🔄 刷新进度
                          </button>
                        </>
                      ) : paper.status === 'completed' ? (
                        <>
                          <button
                            onClick={() => router.push(`/editor?id=${paper.id}`)}
                            className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-1"
                          >
                            <Edit3 className="w-4 h-4" />
                            编辑
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/export', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ paperId: paper.id }),
                                });
                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}));
                                  throw new Error(data.error || '导出失败');
                                }
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${paper.title || '论文'}.docx`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } catch (err: any) {
                                alert(err.message || '下载失败');
                              }
                            }}
                            className="flex-1 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-1"
                          >
                            <FileDown className="w-4 h-4" />
                            下载
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={async () => {
                            if (!confirm('确定删除这篇论文？删除后不可恢复。')) return;
                            try {
                              const res = await fetch(`/api/papers?id=${paper.id}`, { method: 'DELETE', credentials: 'include' });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error);
                              setPaperHistory(prev => prev.filter(p => p.id !== paper.id));
                            } catch (err: any) {
                              alert(err.message || '删除失败');
                            }
                          }}
                          className="flex-1 py-2 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200 transition"
                        >
                          🗑️ 删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* 登录弹窗 */}
    {showLoginModal && (
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0" onClick={() => setShowLoginModal(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* 密码设置弹窗 */}
          {needsPassword && (
            <div className="absolute inset-0 bg-white z-10 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">设置登录密码</h2>
                <p className="text-sm text-slate-500 mb-4">请设置一个密码来保护您的账户</p>
                <div className="space-y-3">
                  <input type="password" id="initPw" placeholder="输入密码（至少6位）"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm" />
                  <input type="password" id="initPwConfirm" placeholder="再次输入密码"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm" />
                  <button
                    onClick={() => {
                      const pw = (document.getElementById('initPw') as HTMLInputElement).value;
                      const pw2 = (document.getElementById('initPwConfirm') as HTMLInputElement).value;
                      if (pw.length < 6) { alert('密码至少6位'); return; }
                      if (pw !== pw2) { alert('两次密码不一致'); return; }
                      handleSetPassword(pw);
                    }}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition"
                  >设置密码并进入</button>
                </div>
              </div>
            </div>
          )}

          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">登录 Pepper</h2>
                  <p className="text-xs text-slate-500">低AI率论文助手</p>
                </div>
              </div>
              <button onClick={() => setShowLoginModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                {loginError}
              </div>
            )}

            <div className="space-y-3">
              {/* 登录方式切换 */}
              <div className="flex gap-2">
                <button disabled className="flex-1 py-2 rounded-xl border text-xs font-medium border-slate-200 text-slate-400 cursor-not-allowed">📱 手机（已关闭）</button>
                <button
                  onClick={() => { setLoginType('email'); setLoginCodeSent(false); setLoginDest(''); setLoginPasswordMode(false); }}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition ${loginType === 'email' && !loginPasswordMode ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >📧 邮箱</button>
              </div>

              {/* 邮箱输入 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">邮箱地址</label>
                <input type="email" value={loginDest}
                  onChange={(e) => setLoginDest(e.target.value)}
                  placeholder="请输入邮箱地址"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>

              {/* 验证码模式 */}
              {!loginPasswordMode && (
                <>
                  {!loginCodeSent ? (
                    <button onClick={handleSendLoginCode}
                      disabled={loginLoading || !loginDest}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-indigo-700 transition">
                      {loginLoading ? '发送中...' : '获取验证码'}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input type="text" value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="请输入6位验证码" maxLength={6}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                      <button onClick={handleVerifyLoginCode}
                        disabled={loginLoading || loginCode.length < 6}
                        className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition">
                        {loginLoading ? '验证中...' : '登录'}
                      </button>
                      <button onClick={() => { setLoginCodeSent(false); setLoginCode(''); }}
                        className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">重新获取验证码</button>
                    </div>
                  )}
                </>
              )}

              {/* 密码模式 */}
              {loginPasswordMode && (
                <div className="space-y-2">
                  <input type="password" placeholder="输入密码" value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm" />
                  <button onClick={handlePasswordLogin}
                    disabled={loginLoading || !loginDest || !loginPassword}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-indigo-700 transition">
                    {loginLoading ? '登录中...' : '登录'}
                  </button>
                </div>
              )}

              {/* 切换登录方式 */}
              <button onClick={() => { setLoginPasswordMode(!loginPasswordMode); setLoginCodeSent(false); }}
                className="w-full py-2 text-xs text-indigo-500 hover:text-indigo-700">
                {loginPasswordMode ? '切换验证码登录' : '🔐 密码登录'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}



// 解析选题结果的辅助组件
function TopicCards({ result, onSelect, selectedTopic }: { result: any; onSelect: (n: number, topicTitle?: string) => void; selectedTopic: number | null }) {
  // 尝试解析结构化 JSON
  let topics: any[] = [];
  if (result && typeof result === 'object' && Array.isArray(result)) {
    topics = result;
  } else if (result && typeof result === 'string') {
    try {
      const match = result.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // 兼容不同字段名格式
        topics = parsed.map((item: any) => ({
          title: item.title || item.TITLE || item.标题 || item.name || '',
          question: item.question || item.QUESTION || item.核心问题 || '',
          method: item.method || item.METHOD || item.研究方法 || ''
        }));
      }
    } catch { /* ignore */ }
  }

  // 如果解析后 topics 为空或没有有效标题，尝试直接从字符串提取
  if (!topics.length || topics.every((t: any) => !t.title)) {
    const strMatch = result?.match && result.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (strMatch) {
      try {
        const rawItems = JSON.parse(strMatch[0]);
        topics = rawItems.map((item: any) => {
          const keys = Object.keys(item);
          const titleKey = keys.find(k => /title|标题/i.test(k)) || keys[0];
          const questKey = keys.find(k => /question|问题/i.test(k)) || keys[1];
          const methodKey = keys.find(k => /method|方法/i.test(k)) || keys[2];
          return {
            title: item[titleKey] || '',
            question: item[questKey] || '',
            method: item[methodKey] || ''
          };
        });
      } catch { /* ignore */ }
    }
  }

  if (!topics || topics.length === 0) {
    return (
      <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed bg-slate-50 p-6 rounded-xl font-sans">
        {typeof result === 'string' ? result : '加载失败'}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      {topics.map((t: any, i: number) => (
        <button
          key={i}
          onClick={() => onSelect(i + 1, t.title || t.TITLE || `方向${i + 1}`)}
          className={`w-full p-6 rounded-2xl border-2 text-left transition ${
            selectedTopic === i + 1
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-slate-200 hover:border-indigo-300 bg-white hover:shadow-sm'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${
              selectedTopic === i + 1 ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-slate-900 mb-2 leading-snug">
                {t.title || t.TITLE || `方向${i + 1}`}
              </h4>
              {t.question && (
                <p className="text-sm text-slate-600 mb-1">
                  <span className="font-semibold text-slate-700">核心问题：</span>
                  {t.question}
                </p>
              )}
              {t.method && (
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-600">研究方法：</span>
                  {t.method}
                </p>
              )}
            </div>
            {selectedTopic === i + 1 && (
              <Check className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-1" />
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
