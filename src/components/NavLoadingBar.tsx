'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function NavLoadingBar() {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // 页面切换时显示加载条
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      className="fixed top-0 left-0 z-[9999] h-1 bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg pointer-events-none"
      style={{
        width: loading ? '88%' : '100%',
        opacity: loading ? 1 : 0,
        transition: loading
          ? 'width 1s cubic-bezier(0.2, 0.4, 0.3, 1)'
          : 'width 0.3s ease-out, opacity 0.35s ease-out 0.05s',
      }}
    />
  );
}
