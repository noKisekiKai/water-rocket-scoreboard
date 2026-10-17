import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "水火箭定點射擊記錄站",
  description: "小學科學體驗日・老師共用成績記錄工具",
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
    <html lang="zh-Hant-HK">
      <body className="antialiased">{children}</body>
    </html>
  );
}
