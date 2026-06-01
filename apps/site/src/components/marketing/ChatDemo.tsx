'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChatCircle,
  Lightning,
  Plug,
  Image,
  WifiHigh,
  Gear,
  MagnifyingGlass,
  Plus,
  FolderOpen,
  ArrowUp,
  CaretDown,
  Terminal,
  UserCircle,
  ShieldCheck,
} from '@phosphor-icons/react';
import { Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


/* ------------------------------------------------------------------ */
/*  Chat message data                                                  */
/* ------------------------------------------------------------------ */

interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  delay: number;
  badge?: { icon: 'skill' | 'mcp' | 'bridge' | 'agent'; label: string };
  tool?: { name: string; status: 'done' };
}

const MESSAGES: ChatMsg[] = [
  {
    id: 1,
    role: 'user',
    text: 'Refactor the auth module to use JWT. Follow the team conventions.',
    delay: 800,
    badge: { icon: 'skill', label: '/refactor' },
  },
  {
    id: 2,
    role: 'assistant',
    text: 'Reading project conventions from persona memory\u2026',
    delay: 1400,
  },
  {
    id: 3,
    role: 'assistant',
    text: 'Refactored src/auth/ to JWT. Updated 4 files, added refresh-token rotation, kept the existing middleware contract.',
    delay: 2000,
    tool: { name: 'Edit 4 files', status: 'done' },
  },
  {
    id: 4,
    role: 'user',
    text: "Connect the Figma MCP server \u2014 I need design tokens.",
    delay: 1400,
    badge: { icon: 'mcp', label: 'Figma MCP' },
  },
  {
    id: 5,
    role: 'assistant',
    text: "Connected to Figma MCP. Pulled 48 tokens \u2192 src/theme/tokens.ts updated.",
    delay: 1800,
    tool: { name: 'figma:pull-tokens', status: 'done' },
  },
  {
    id: 6,
    role: 'user',
    text: "I'm heading out. Forward replies to Telegram.",
    delay: 1400,
    badge: { icon: 'bridge', label: 'Telegram' },
  },
  {
    id: 7,
    role: 'assistant',
    text: "Bridge active \u2014 I'll keep working and send updates to Telegram.",
    delay: 1600,
  },
  {
    id: 8,
    role: 'user',
    text: 'Generate a hero section with the new tokens.',
    delay: 1800,
    badge: { icon: 'agent', label: 'Design Agent' },
  },
  {
    id: 9,
    role: 'assistant',
    text: 'Created src/app/hero/ with responsive layout and the new palette. Preview ready.',
    delay: 2200,
    tool: { name: 'Create 3 files', status: 'done' },
  },
];

const SESSIONS = [
  { name: 'Auth JWT refactor', active: true, time: 'now' },
  { name: 'API rate limiting', active: false, time: '2h' },
  { name: 'Dashboard redesign', active: false, time: '5h' },
  { name: 'CI pipeline fix', active: false, time: '1d' },
  { name: 'Onboarding flow', active: false, time: '2d' },
];

const WORKSPACE_FILES = [
  { name: 'src/auth/jwt.ts', status: 'modified' },
  { name: 'src/auth/middleware.ts', status: 'modified' },
  { name: 'src/auth/refresh.ts', status: 'added' },
  { name: 'src/theme/tokens.ts', status: 'modified' },
  { name: 'src/app/hero/page.tsx', status: 'added' },
];

/*
 * The demo uses the real product's purple primary color via CSS custom
 * properties scoped to the demo container, so it visually matches the
 * actual CodePilot app regardless of the site's blue brand primary.
 */
const DEMO_THEME_VARS = {
  '--primary': 'oklch(0.546 0.245 262.881)',
  '--primary-foreground': 'oklch(0.985 0.001 106.423)',
  '--ring': 'oklch(0.546 0.245 262.881)',
} as React.CSSProperties;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function BadgeIcon({ type }: { type: string }) {
  const cls = 'h-3 w-3';
  switch (type) {
    case 'skill': return <Lightning size={12} />;
    case 'mcp': return <Plug size={12} />;
    case 'bridge': return <WifiHigh size={12} />;
    case 'agent': return <UserCircle size={12} />;
    default: return null;
  }
}

function Badge({ badge }: { badge: NonNullable<ChatMsg['badge']> }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-[2px] text-[10px] font-medium text-primary">
      <BadgeIcon type={badge.icon} />
      {badge.label}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-[3px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-[4px] w-[4px] rounded-full bg-muted-foreground/40"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Icon sidebar — real: NavRail.tsx w-14, h-9 w-9 buttons, gap-1     */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { icon: ChatCircle, label: 'Chats', active: true },
  { icon: Lightning, label: 'Skills', active: false },
  { icon: Plug, label: 'MCP', active: false },
  { icon: Image, label: 'Gallery', active: false },
  { icon: WifiHigh, label: 'Bridge', active: false },
];

function IconSidebar() {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center bg-sidebar pb-3 pt-10">
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            size="icon"
            className={`h-9 w-9 ${
              item.active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground/50'
            }`}
          >
            <item.icon size={16} />
          </Button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-2">
        <div className="relative">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground/50">
            <Gear size={16} />
          </Button>
          <span className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary" />
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Session sidebar — real: ChatListPanel 240px, bg-sidebar            */
/* ------------------------------------------------------------------ */

function SessionSidebar() {
  return (
    <div className="hidden w-[190px] shrink-0 flex-col bg-sidebar sm:flex">
      {/* Top spacing for macOS traffic lights area */}
      <div className="h-10 mt-3" />

      {/* New chat button — real: h-8 outline with PlusSignIcon */}
      <div className="px-2.5">
        <Button variant="outline" size="sm" className="w-full justify-start gap-1.5 rounded-md pl-2 text-[10px]">
          <Plus size={12} />
          New Chat
        </Button>
      </div>

      {/* Search */}
      <div className="relative mt-2 px-2.5">
        <MagnifyingGlass size={12} className="absolute left-[1.15rem] top-1/2 z-10 -translate-y-1/2 text-muted-foreground/40" />
        <Input className="h-7 rounded-md pl-7 !text-[10px]" placeholder="Search..." readOnly />
      </div>

      {/* Project folder — real: FolderOpenIcon, text-[13px] font-medium */}
      <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5">
        <FolderOpen size={16} className="text-muted-foreground/60" />
        <span className="text-[13px] font-medium text-sidebar-foreground">My-Project</span>
      </div>

      {/* Session list — real: text-[13px], active=bg-sidebar-accent */}
      <div className="mt-1 flex-1 overflow-hidden pl-4 pr-1.5">
        {SESSIONS.map((s) => (
          <div
            key={s.name}
            className={`flex items-center justify-between rounded-md px-2 py-2 ${
              s.active
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/60'
            }`}
          >
            <span className="truncate text-[13px] leading-tight">{s.name}</span>
            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground/40">{s.time}</span>
          </div>
        ))}
      </div>

      <div className="shrink-0" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Right workspace panel — real: RightPanel 288px, bg-background      */
/* ------------------------------------------------------------------ */

function WorkspacePanel({ fileCount }: { fileCount: number }) {
  const visible = WORKSPACE_FILES.slice(0, fileCount);

  return (
    <div className="hidden w-[180px] shrink-0 flex-col bg-background lg:flex">
      {/* Section title — real: text-[11px] font-semibold uppercase tracking-wider */}
      <div className="px-4 pb-2 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tasks</span>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2">
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-foreground bg-foreground text-background">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span className="text-[11px] text-muted-foreground line-through">Auth refactor</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-input" />
            <span className="text-[11px] text-muted-foreground">Hero generation</span>
          </label>
        </div>
      </div>

      {/* Files */}
      <div className="px-4 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Files</span>
      </div>
      <div className="flex-1 overflow-hidden px-3">
        <AnimatePresence>
          {visible.map((f) => (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              <span className="truncate text-[11px] text-muted-foreground">{f.name}</span>
              <span className={`ml-auto shrink-0 text-[10px] ${
                f.status === 'added' ? 'text-green-500' : 'text-amber-500'
              }`}>
                {f.status === 'added' ? '+' : 'M'}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main ChatDemo                                                      */
/* ------------------------------------------------------------------ */

export function ChatDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingId, setTypingId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fileCount = Math.min(
    WORKSPACE_FILES.length,
    visibleCount >= 9 ? 5 : visibleCount >= 5 ? 4 : visibleCount >= 3 ? 2 : 0,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          playMessages();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playMessages() {
    let elapsed = 0;
    MESSAGES.forEach((msg, i) => {
      elapsed += msg.delay;
      if (msg.role === 'assistant') {
        setTimeout(() => setTypingId(msg.id), elapsed - 600);
      }
      setTimeout(() => {
        setTypingId(null);
        setVisibleCount(i + 1);
      }, elapsed);
    });
    setTimeout(() => {
      setVisibleCount(0);
      setTypingId(null);
      hasStarted.current = false;
      const el = containerRef.current;
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !hasStarted.current) {
            hasStarted.current = true;
            playMessages();
          }
        },
        { threshold: 0.2 },
      );
      obs.observe(el);
    }, elapsed + 4000);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleCount, typingId]);

  const visible = MESSAGES.slice(0, visibleCount);

  return (
    <div
      ref={containerRef}
      className="flex overflow-hidden rounded-t-2xl bg-background shadow-[0_-2px_20px_0_rgb(0_0_0/0.06),0_4px_24px_0_rgb(0_0_0/0.08)]"
      style={{ height: 520, ...DEMO_THEME_VARS }}
    >
      {/* Left: icon bar — real NavRail */}
      <IconSidebar />

      {/* Left: session sidebar — real ChatListPanel */}
      <SessionSidebar />

      {/* Center: chat area */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Chat header — real: h-11 border-b border-border/50 */}
        <div className="flex h-11 items-center justify-between px-4">
          <span className="text-[13px] font-medium text-foreground">Auth JWT refactor</span>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {visible.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {msg.badge && (
                    <div className="mb-1">
                      <Badge badge={msg.badge} />
                    </div>
                  )}
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[12px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {msg.text}
                    {msg.tool && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-green-600">
                        <Check className="h-2.5 w-2.5" />
                        {msg.tool.name}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {typingId !== null && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start"
                >
                  <div className="rounded-2xl px-3.5 py-2">
                    <TypingDots />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Input bar — real: InputGroup rounded-2xl border-input shadow-md dark:bg-input/30 */}
        <div className="px-3 pb-1.5">
          <div className="rounded-xl border border-input shadow-sm dark:bg-input/30">
            {/* Textarea row */}
            <div className="flex items-center px-3.5 py-3">
              <span className="flex-1 text-xs text-muted-foreground/50">Message Claude...</span>
              <Button size="icon-xs" className="shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/80">
                <ArrowUp size={14} />
              </Button>
            </div>
            {/* PromptInputFooter — real: gap-1, icon buttons h-6 w-6 */}
            <div className="flex items-center justify-between gap-1 px-2.5 pb-2.5">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground/50">
                  <Plus size={14} />
                </Button>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground/50">
                  <Terminal size={14} />
                </Button>
                <div className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10px] text-muted-foreground/60">
                  claude-sonnet-4
                  <CaretDown size={10} />
                </div>
              </div>
            </div>
          </div>
          {/* ChatComposerActionBar — below input */}
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
            <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-muted-foreground/50">
              <UserCircle size={14} />
              Design Agent
            </span>
            <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-muted-foreground/50">
              <ShieldCheck size={14} />
              Default
            </span>
          </div>
        </div>
      </div>

      {/* Right: workspace panel — real RightPanel */}
      <WorkspacePanel fileCount={fileCount} />
    </div>
  );
}
