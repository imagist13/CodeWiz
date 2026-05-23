import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceFrame } from "./workspace-frame";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "CodeWiz",
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
        className="h-full overflow-hidden overscroll-none antialiased"
        suppressHydrationWarning
      >
        <AuthProvider>
          <WorkspaceFrame>{children}</WorkspaceFrame>
        </AuthProvider>
      </body>
    </html>
  );
}
