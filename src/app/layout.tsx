import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import NavLoadingBar from "@/components/NavLoadingBar";

export const metadata: Metadata = {
  title: "Pepper - 智能论文助手",
  description: "AI驱动的论文润色、改写、检测工具",
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
