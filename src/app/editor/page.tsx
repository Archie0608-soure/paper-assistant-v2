import { Suspense } from 'react';
import EditorClient from './EditorClient';

export const dynamic = 'force-dynamic';

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-slate-400">加载中...</span></div>}>
      <EditorClient />
    </Suspense>
  );
}
