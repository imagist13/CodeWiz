"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient, type User } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FormState = "idle" | "loading" | "success";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="mx-auto mt-3 h-4 w-56 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="h-9 animate-pulse rounded-md bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const { setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormState("loading");

    try {
      const { user } = await apiClient.login(email, password);
      // Pre-populate AuthContext so the next page already knows who the user is
      setUser(user);
      setLoggedInUser(user);
      setFormState("success");
      timerRef.current = setTimeout(() => {
        router.push(redirectTo);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setFormState("idle");
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">

        {formState === "success" ? (
          <SuccessState user={loggedInUser} />
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">欢迎回来</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                登录你的 CodeWiz 账号
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

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
                  placeholder="你的密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={formState === "loading"}
                />
              </div>

              <Button type="submit" className="w-full" disabled={formState === "loading"}>
                {formState === "loading" ? "登录中…" : "登录"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              还没有账号？{" "}
              <Link
                href="/auth/register"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                立即注册
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
          {user ? `欢迎回来，${user.name || user.email}` : "登录成功"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">正在跳转…</p>
      </div>
    </div>
  );
}
