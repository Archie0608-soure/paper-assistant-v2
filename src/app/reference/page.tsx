'use client';
import { useState, useEffect } from 'react';
import { Upload, X, FileText, ArrowLeft, Check } from 'lucide-react';

export default function ReferencePage() {
  const [refDocs, setRefDocs] = useState<any[]>([]);
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [refUploading, setRefUploading] = useState(false);
  const [showRefPanel, setShowRefPanel] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/reference/upload', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.docs) setRefDocs(data.docs); })
      .catch(() => {});
  }, []);

  const handleRefUpload = async (e: any) => {
    const files = e.target.files;
    if (!files?.length) return;
    setRefUploading(true);
    setMessage('');
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    try {
      const res = await fetch('/api/reference/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (data.results) {
        const ok = data.results.filter((r: any) => r.status === 'ok');
        if (ok.length > 0) {
          setMessage(`成功上传 ${ok.length} 个文件`);
          const listRes = await fetch('/api/reference/upload', { credentials: 'include' });
          const listData = await listRes.json();
          if (listData.docs) setRefDocs(listData.docs);
        } else {
          setMessage(data.message || '上传失败');
        }
      }
    } catch { setMessage('上传失败'); }
    finally { setRefUploading(false); e.target.value = ''; }
  };

  const handleRefDelete = async (id: string) => {
    if (!confirm('确定删除这篇文献？')) return;
    try {
      await fetch(`/api/reference/upload?id=${id}`, { method: 'DELETE', credentials: 'include' });
      setRefDocs(refDocs.filter(d => d.id !== id));
      setSelectedRefIds(selectedRefIds.filter(i => i !== id));
    } catch { setMessage('删除失败'); }
  };

  const toggleRef = (id: string) => {
    if (selectedRefIds.includes(id)) {
      setSelectedRefIds(selectedRefIds.filter(i => i !== id));
    } else {
      setSelectedRefIds([...selectedRefIds, id]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <a href="/" className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition">
            <ArrowLeft className="w-4 h-4" /> 返回首页
          </a>
          <h1 className="text-2xl font-bold text-white">参考文献管理</h1>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-200 text-sm">
            {message}
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 space-y-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-amber-400" />
            <span className="text-white font-semibold">上传参考文献</span>
            {selectedRefIds.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">
                已选 {selectedRefIds.length} 篇
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className={`flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl cursor-pointer transition font-medium text-sm ${refUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Upload className="w-4 h-4" />
              {refUploading ? '上传中...' : '选择文件'}
              <input type="file" accept=".pdf,.doc,.docx,.txt" multiple className="hidden" onChange={handleRefUpload} disabled={refUploading} />
            </label>
            <span className="text-white/60 text-xs">PDF、DOCX、TXT 格式（CAJ 需先转 PDF），单文件最大 5MB，最多 40 个文件</span>
          </div>

          <div className="space-y-2">
            {refDocs.length === 0 ? (
              <p className="text-white/50 text-sm text-center py-6">暂无参考文献，请上传</p>
            ) : (
              refDocs.map(doc => {
                const isSelected = selectedRefIds.includes(doc.id);
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition">
                    <button
                      onClick={() => toggleRef(doc.id)}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-white/30 hover:border-white/50'}`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{doc.name || doc.filename}</p>
                      <p className="text-white/40 text-xs">{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''}</p>
                    </div>
                    <button onClick={() => handleRefDelete(doc.id)} className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {selectedRefIds.length > 0 && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-amber-300 text-sm">
                ✅ 已选择 {selectedRefIds.length} 篇参考文献。生成论文时系统将自动引用这些资料。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
