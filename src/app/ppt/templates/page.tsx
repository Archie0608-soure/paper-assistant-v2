'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Upload, Palette, Trash2, Check, Image } from 'lucide-react';

const CATEGORIES = ['全部', '学术', '商务', '简约', '创意', '科技'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [category, setCategory] = useState('全部');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('学术');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { fetchTemplates(); }, []);

  useEffect(() => {
    if (category === '全部') setFiltered(templates);
    else setFiltered(templates.filter(t => t.category === category));
  }, [category, templates]);

  const fetchTemplates = async () => {
    const res = await fetch('/api/ppt/templates', { credentials: 'include' });
    const data = await res.json();
    setTemplates(data.templates || []);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleUpload = async () => {
    if (!uploadFile) { showToast('请选择PPTX文件'); return; }
    if (!uploadName.trim()) { showToast('请输入模板名称'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('name', uploadName);
      fd.append('category', uploadCategory);
      fd.append('description', uploadDesc);
      const res = await fetch('/api/ppt/templates', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (data.success) {
        showToast('上传成功！');
        setUploadOpen(false);
        setUploadName(''); setUploadDesc(''); setUploadFile(null);
        fetchTemplates();
      } else {
        showToast(data.error || '上传失败');
      }
    } catch { showToast('上传失败，请重试'); }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/ppt/templates?id=${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) { showToast('已删除'); fetchTemplates(); }
      else showToast(data.error || '删除失败');
    } catch { showToast('删除失败'); }
    setDeleting(false);
    setDeleteId(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const ColorSwatch = ({ color }: { color: string }) => (
    <div className="flex gap-1">
      {['primary', 'secondary', 'accent', 'bg'].map((k, i) => (
        <div key={k} className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: '#' + (color as any)[k] || 'ccc' }}
          title={k + ': ' + (color as any)[k]} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/ppt" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-600 hover:text-slate-800 transition-colors">
              ← 返回
            </a>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">🎨 PPT 模板库</h1>
              <p className="text-sm text-slate-500 mt-0.5">上传、管理你的专属PPT模板</p>
            </div>
          </div>
          <button onClick={() => setUploadOpen(true)}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-200">
            <Upload className="w-4 h-4" />上传模板
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Category tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${category === c
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'}`}>
              {c}
            </button>
          ))}
          <span className="ml-auto text-sm text-slate-400 self-center">{filtered.length} 个模板</span>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg">暂无模板</p>
            <p className="text-sm mt-1">点击右上角上传你的第一个PPT模板</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(tpl => (
              <div key={tpl.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all group">
                {/* Preview - click to embed */}
                <div className="h-36 relative flex items-center justify-center cursor-pointer overflow-hidden bg-slate-100"
                  onClick={() => window.open('https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent('https://pepperai.com.cn' + tpl.file), '_blank')}>
                  {tpl.thumbnail ? (
                    <img src={tpl.thumbnail} alt={tpl.name}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, #${tpl.colors.primary}44, #${tpl.colors.accent}44)` }}>
                      <div className="text-3xl">📄</div>
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/50 rounded text-white text-xs font-bold">#{tpl.index}</div>
                  {/* Category tag */}
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 rounded-full text-xs font-medium text-slate-600">
                    {tpl.category}
                  </div>
                  {/* Delete */}
                  <button onClick={() => setDeleteId(tpl.id)}
                    className="absolute top-2 left-2 p-1.5 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Info */}
                <div className="p-4">
                  <h3 className="font-bold text-slate-800 truncate">{tpl.name}</h3>
                  {tpl.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{tpl.description}</p>}
                  {/* Color palette strip */}
                  <div className="flex rounded-lg overflow-hidden mb-2">
                    <div className="flex-1 h-6" style={{ backgroundColor: '#' + tpl.colors.primary }} title="主色" />
                    <div className="flex-1 h-6" style={{ backgroundColor: '#' + tpl.colors.secondary }} title="副色" />
                    <div className="flex-1 h-6" style={{ backgroundColor: '#' + tpl.colors.accent }} title="强调色" />
                    <div className="flex-1 h-6" style={{ backgroundColor: '#' + tpl.colors.bg }} title="背景色" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{tpl.slideCount}页</span>
                    <span className="text-xs text-slate-400">{formatSize(tpl.fileSize)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">上传PPT模板</h2>
              <button onClick={() => setUploadOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* File select */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">选择PPTX文件</label>
                <label className="flex items-center gap-3 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    {uploadFile ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-indigo-600 truncate">{uploadFile.name}</span>
                        <span className="text-xs text-slate-400">{formatSize(uploadFile.size)}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">点击选择或拖拽PPTX文件到这里</span>
                    )}
                  </div>
                  <input type="file" accept=".pptx" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">模板名称 <span className="text-red-500">*</span></label>
                <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="如：学术蓝白风格"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">分类</label>
                <div className="flex gap-2 flex-wrap">
                  {['学术', '商务', '简约', '创意', '科技'].map(c => (
                    <button key={c} onClick={() => setUploadCategory(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${uploadCategory === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">描述（可选）</label>
                <textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="模板风格说明..."
                  rows={2} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3">
              <button onClick={() => setUploadOpen(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={handleUpload} disabled={uploading}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {uploading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />上传中</> : <><Upload className="w-4 h-4" />确认上传</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-lg font-bold text-slate-800">确认删除模板？</h3>
              <p className="text-sm text-slate-500 mt-1">删除后无法恢复</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-60">
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
