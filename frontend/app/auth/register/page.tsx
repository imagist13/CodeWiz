"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient, type User } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FormState = "idle" | "loading" | "success";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [registeredUser, setRegisteredUser] = useState<User | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (password.length < 6) {
      setError("密码长度至少为 6 个字符");
      return;
    }

    setFormState("loading");

    try {
      const { user } = await apiClient.register(email, password, name || undefined);
      setUser(user);
      setRegisteredUser(user);
      setFormState("success");
      timerRef.current = setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
      setFormState("idle");
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">

        {formState === "success" ? (
          <SuccessState user={registeredUser} />
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">创建账号</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                立即开始使用 CodeWiz
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  姓名 <span className="text-muted-foreground">(选填)</span>
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="你的姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  disabled={formState === "loading"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  邮箱
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={formState === "loading"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  密码
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少 6 个字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={formState === "loading"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  确认密码
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={formState === "loading"}
                />
              </div>

              <Button type="submit" className="w-full" disabled={formState === "loading"}>
                {formState === "loading" ? "正在创建账号…" : "创建账号"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              已有账号？{" "}
              <Link
                href="/auth/login"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                登录
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessState({ user }: { user: User | null }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center animate-[fadeIn_0.3s_ease-out]">
      <div className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-[ping_1s_ease-out_1]" />
        <div className="relative flex size-16 items-center justify-center rounded-full bg-emerald-500/15">
          <svg
            className="size-8 text-emerald-500 animate-[drawCheck_0.5s_ease-out_0.1s_both]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold text-foreground">
          {user ? `欢迎，${user.name || user.email}！` : "账号创建成功"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">正在跳转…</p>
      </div>
    </div>
  );
}
