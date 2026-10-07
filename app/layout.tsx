import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "你的专属小教练",
  description: "用自己的 AI 制定计划，记录每一组训练。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
