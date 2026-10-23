import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/mobile/PwaRegister";
export const metadata: Metadata = {
  title: "紫微 · 观星 | 紫微斗数 AI",
  description:
    "十二宫排盘、星曜四化、大限流年与 AI 命盘解读。以传统文化为镜，探索自我。",
  applicationName: "紫微观星",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "紫微观星",
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101a1b",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
