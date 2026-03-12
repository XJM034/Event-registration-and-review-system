import type { Metadata } from "next";
import AdminApiSessionBridge from "@/components/admin-api-session-bridge";
import AppThemeProvider from "@/components/app-theme-provider";
import AdminSessionTabSync from "@/components/admin-session-tab-sync";
import { Agentation } from "agentation";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "体育比赛报名管理系统",
  description: "专业的体育赛事报名和管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AppThemeProvider>
          <AdminApiSessionBridge />
          <AdminSessionTabSync />
          {children}
          {process.env.NODE_ENV === "development" && <Agentation />}
        </AppThemeProvider>
      </body>
    </html>
  );
}
