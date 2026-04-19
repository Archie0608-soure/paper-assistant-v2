'use client';
import { useState, useEffect } from 'react';
import { Upload, X, FileText } from 'lucide-react';

function RefUploader({ refDocs, setRefDocs, selectedRefIds, setSelectedRefIds, refUploading, setRefUploading, showRefPanel, setShowRefPanel }: any) {
  const handleRefUpload = async (e: any) => {
    const files = e.target.files;
    if (!files?.length) return;
    setRefUploading(true);
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    try {
      const res = await fetch('/api/reference/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (data.results) {
        const ok = data.results.filter((r: any) => r.status === 'ok');
        if (ok.length > 0) {
          const listRes = await fetch('/api/reference/upload', { credentials: 'include' });
          const listData = await listRes.json();
          if (listData.docs) setRefDocs(listData.docs);
        }
        if (data.message) alert(data.message);
      }
    } catch { alert('上传失败'); }
    finally { setRefUploading(false); e.target.value = ''; }
  };

  const handleRefDelete = async (id: string) => {
    if (!confirm('确定删除这篇文献？')) return;
    try {
      await fetch(`/api/reference/upload?id=${id}`, { method: 'DELETE', credentials: 'include' });
      setRefDocs(refDocs.filter((d: any) => d.id !== id));
      setSelectedRefIds(selectedRefIds.filter((i: any) => i !== id));
    } catch { alert('删除失败'); }
  };

  const toggleRef = (id: string) => {
    if (selectedRefIds.includes(id)) {
      setSelectedRefIds(selectedRefIds.filter((i: any) => i !== id));
    } else {
      setSelectedRefIds([...selectedRefIds, id]);
    }
  };

  useEffect(() => {
    if (!showRefPanel) return;
    fetch('/api/reference/upload', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.docs) setRefDocs(data.docs); })
      .catch(() => {});
  }, [showRefPanel]);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">参考文献（可选）</span>
          {selectedRefIds.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full">
              已选 {selectedRefIds.length} 篇
            </span>
          )}
        </div>
        <button onClick={() => setShowRefPanel(!showRefPanel)} className="text-xs text-amber-600 hover:text-amber-800 underline">
          {showRefPanel ? '收起' : '管理文献'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg cursor-pointer transition ${refUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <Upload className="w-3.5 h-3.5" />
          {refUploading ? '上传中...' : '上传文献'}
          <input type="file" accept=".pdf,.doc,.docx,.txt" multiple className="hidden" onChange={handleRefUpload} disabled={refUploading} />
        </label>
        <span className="text-xs text-amber-700">PDF/Word/TXT，最大10个文件，每个5MB内</span>
      </div>

      {showRefPanel && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {refDocs.length === 0 ? (
            <p className="text-xs text-amber-600 text-center py-2">暂无参考文献，请上传</p>
          ) : (
            refDocs.map((doc: any) => {
              const isSelected = selectedRefIds.includes(doc.id);
              return (
                <div key={doc.id} className="flex items-center gap-2">
                  <button onClick={() => toggleRef(doc.id)}
                    className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left transition ${isSelected ? 'bg-amber-200 ring-1 ring-amber-400' : 'bg-white hover:bg-amber-100'}`}>
                    <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="truncate text-amber-900">{doc.name || doc.filename || '文档'}</span>
                    {isSelected && <span className="text-amber-600 ml-auto text-[10px]">已选</span>}
                  </button>
                  <button onClick={() => handleRefDelete(doc.id)} className="p-1 text-red-400 hover:text-red-600 transition">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default RefUploader;
