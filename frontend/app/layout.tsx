import type { Metadata } from "next";
import "./globals.css";
import "./super-agent.css";
import { AuthProvider } from "@/lib/auth-context";
import SuperAgentLayout from "@/components/super-agent/Layout";

export const metadata: Metadata = {
  title: "Super Agent - CodeWiz",
  description: "Super Agent - AI Powered Development Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <AuthProvider>
          <SuperAgentLayout>{children}</SuperAgentLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
