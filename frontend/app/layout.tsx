import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WorkspaceFrame } from "./workspace-frame";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Adorable",
  description: "Build beautiful apps with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden overscroll-none antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <WorkspaceFrame>{children}</WorkspaceFrame>
        </AuthProvider>
      </body>
    </html>
  );
}
