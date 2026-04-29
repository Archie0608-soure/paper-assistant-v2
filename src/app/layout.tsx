import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import NavLoadingBar from "@/components/NavLoadingBar";

export const metadata: Metadata = {
  title: "论文助手-降重降AI-Pepper智能论文助手",
  description: "论文助手，降重降AI，智能论文润色、改写、检测工具，支持降低重复率、规避AI检测、论文翻译、复习资料生成",
  keywords: "论文助手,降重降AI,AI论文生成,论文降重,论文润色,AI降重,智能改写,论文翻译,AIGC检测,复习资料生成",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#7c3aed" />
      </head>
      <body className="min-h-full flex flex-col">
      <NavLoadingBar />
      {children}
      <footer className="bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-gray-400">
          <p>© 2026 Pepper · 智能论文助手 &nbsp;|&nbsp; <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener" className="hover:text-indigo-500">京ICP备25009920号</a></p>
        </div>
      </footer>
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="lazyOnload" />
      <Script id="paddle-init" strategy="lazyOnload">
        {`
          window.addEventListener('load', function() {
            if (typeof Paddle !== 'undefined') {
              Paddle.Environment.set('production');
              Paddle.Initialize({ token: 'live_efb23d8bd4afde8c870c9d67d19' });
            }
          });
        `}
      </Script>
      </body>
    </html>
  );
}
