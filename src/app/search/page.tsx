'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, ExternalLink, BookOpen, Loader2, Filter, ArrowLeft } from 'lucide-react';

interface Paper {
  title: string;
  authors: string[];
  abstract: string;
  year: number | null;
  citations: number;
  url: string;
  source: string;
}

const SOURCES = ['全部', 'OpenAlex', 'arXiv', 'CrossRef', 'PubMed', 'DOAJ', 'Semantic Scholar'];
const SOURCE_COLORS: Record<string, string> = {
  OpenAlex: 'bg-blue-100 text-blue-700',
  arXiv: 'bg-orange-100 text-orange-700',
  CrossRef: 'bg-slate-100 text-slate-700',
  PubMed: 'bg-green-100 text-green-700',
  DOAJ: 'bg-teal-100 text-teal-700',
  'Semantic Scholar': 'bg-purple-100 text-purple-700',
};

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), limit: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '搜索失败');
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message || '搜索失败，请稍后重试');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === '全部' ? results : results.filter(r => r.source === filter);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-medium transition flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />返回
          </button>
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">文献搜索</h1>
            <p className="text-xs text-slate-500">OpenAlex · arXiv · CrossRef · PubMed · DOAJ · Semantic Scholar · 免费</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* 搜索框 */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="输入论文主题、关键词或研究问题..."
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-base"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-base hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <SearchIcon className="w-5 h-5" />}
              {loading ? '搜索中...' : '搜索'}
            </button>
          </div>

          {/* 来源标签 */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400" />
            {SOURCES.map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  filter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
            <span className="text-xs text-slate-400 ml-2">
              {loading ? '搜索中...' : `${filtered.length} 条结果${filter !== '全部' ? `（共 ${results.length} 条）` : ''}`}
            </span>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* 空状态 */}
        {!loading && searched && filtered.length === 0 && !error && (
          <div className="text-center py-16 text-slate-500">
            <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">未找到相关文献</p>
            <p className="text-sm mt-1">试试更换关键词，或者扩大搜索范围</p>
          </div>
        )}

        {/* 初始状态 */}
        {!loading && !searched && (
          <div className="text-center py-16 text-slate-400">
            <BookOpen className="w-20 h-20 mx-auto mb-5 opacity-30" />
            <p className="text-lg font-medium">输入关键词开始搜索</p>
            <p className="text-sm mt-2">支持中英文，支持复杂研究问题</p>
            <div className="flex gap-2 justify-center mt-4 flex-wrap">
              {['深度学习', '气候变化', '区块链', '人工智能', '可持续能源'].map(k => (
                <button
                  key={k}
                  onClick={() => { setQuery(k); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 加载中 */}
        {loading && (
          <div className="text-center py-16 text-slate-400">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" />
            <p className="text-base">正在从 6 个学术数据库搜索...</p>
          </div>
        )}

        {/* 搜索结果 */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map((paper, i) => (
              <div key={i} className="bg-white rounded-2xl shadow border border-slate-200 p-5 hover:shadow-md transition group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[paper.source] || 'bg-slate-100 text-slate-600'}`}>
                        {paper.source}
                      </span>
                      {paper.year && (
                        <span className="text-xs text-slate-400">{paper.year}</span>
                      )}
                      {paper.citations > 0 && (
                        <span className="text-xs text-amber-600 font-medium">⭐ {paper.citations} 引用</span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 leading-snug mb-1 group-hover:text-indigo-700 transition">
                      {paper.title}
                    </h3>
                    {paper.authors.length > 0 && (
                      <p className="text-sm text-slate-500 mb-2">{paper.authors.join(' · ')}</p>
                    )}
                    <p className="text-sm text-slate-600 leading-relaxed">{paper.abstract}</p>
                  </div>
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-9 h-9 bg-slate-100 hover:bg-indigo-100 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 transition"
                    title="查看原文"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
