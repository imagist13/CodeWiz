'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  XCircle,
  Circle,
  Lightning,
  ChatCircle,
  PencilLine,
  MagnifyingGlass,
  Code,
  FloppyDisk,
  Check,
  GitCommit,
  ArrowRight,
  Warning,
} from '@/components/ui/icon';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DevStepType =
  | 'clarify'
  | 'plan'
  | 'locate'
  | 'generate'
  | 'write'
  | 'verify'
  | 'pr';

export type DevStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface DevQuestion {
  q: string;
  options?: string[];
}

export interface DevStep {
  step: DevStepType;
  status: DevStepStatus;
  title?: string;
  questions?: DevQuestion[];
  confirmed?: string[];      // clarify: 已确认项
  techChoices?: string[];   // plan: 技术选型
  files?: Array<{ path: string; op: '新增' | '修改' | '删除'; desc: string }>;
  steps?: string[];          // plan: 实现步骤
  risks?: string[];          // plan: 风险
  filesFound?: Array<{ path: string; summary: string; note: string }>;
  newFiles?: Array<{ path: string; desc: string }>;
  codeBlocks?: Array<{ file: string; language: string; code: string }>;
  writeResults?: Array<{ path: string; op: string; status: 'ok' | 'conflict' | 'error' }>;
  lintPassed?: boolean;
  testPassed?: boolean;
  testSummary?: string;
  branch?: string;
  commitMsg?: string;
  prDescription?: string;
  summary?: string;
}

interface DevStepCardProps {
  stepData: DevStep;
  stepNumber: number;
  onConfirm?: (answers: Record<string, string>) => void;
  onProceed?: () => void;
  onRetry?: () => void;
}

// ─── Step config ───────────────────────────────────────────────────────────────

const STEP_ORDER: DevStepType[] = [
  'clarify', 'plan', 'locate', 'generate', 'write', 'verify', 'pr',
];

const STEP_ICONS: Record<DevStepType, React.ComponentType<{ size?: number; className?: string }>> = {
  clarify: ChatCircle,
  plan: PencilLine,
  locate: MagnifyingGlass,
  generate: Code,
  write: FloppyDisk,
  verify: CheckCircle,
  pr: GitCommit,
};

const STEP_ACCENT: Record<DevStepType, string> = {
  clarify: 'border-blue-500/30',
  plan: 'border-indigo-500/30',
  locate: 'border-cyan-500/30',
  generate: 'border-violet-500/30',
  write: 'border-emerald-500/30',
  verify: 'border-amber-500/30',
  pr: 'border-green-500/30',
};

const STEP_HEADER_BG: Record<DevStepType, string> = {
  clarify: 'bg-blue-500/5',
  plan: 'bg-indigo-500/5',
  locate: 'bg-cyan-500/5',
  generate: 'bg-violet-500/5',
  write: 'bg-emerald-500/5',
  verify: 'bg-amber-500/5',
  pr: 'bg-green-500/5',
};

const STEP_LABEL_KEY: Record<DevStepType, TranslationKey> = {
  clarify: 'dev.clarify',
  plan: 'dev.plan',
  locate: 'dev.locate',
  generate: 'dev.generate',
  write: 'dev.write',
  verify: 'dev.verify',
  pr: 'dev.pr',
};

function StatusIcon({ status }: { status: DevStepStatus }) {
  if (status === 'completed') return <CheckCircle size={16} className="text-green-500 shrink-0" />;
  if (status === 'failed') return <XCircle size={16} className="text-red-500 shrink-0" />;
  if (status === 'in_progress') return <Circle size={16} className="text-blue-500 animate-pulse shrink-0" />;
  return <Circle size={16} className="text-muted-foreground shrink-0" />;
}

// ─── Step progress bar ─────────────────────────────────────────────────────────

function StepProgressBar({ current }: { current: number }) {
  return (
    <div className="flex gap-1 px-4 pt-3">
      {STEP_ORDER.map((s, i) => (
        <div
          key={s}
          className={cn(
            'h-1 flex-1 rounded-full transition-all',
            i < current ? 'bg-green-500' :
            i === current ? 'bg-blue-500' :
            'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

// ─── Question answer state ─────────────────────────────────────────────────────

function ClarifyContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);

  const handleAnswer = (q: string, option: string) => {
    setAnswers(prev => ({ ...prev, [q]: option }));
  };

  const allAnswered = step.questions?.every(q => answers[q.q]) ?? true;
  const confirmedItems = step.confirmed ?? [];

  return (
    <div className="space-y-4">
      {/* Confirmed items */}
      {confirmedItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1">
            <Check size={12} /> {t('dev.confirmed' as TranslationKey)}
          </p>
          <ul className="space-y-1">
            {confirmedItems.map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-green-500/30">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions */}
      {step.questions && step.questions.length > 0 && (
        <div className="space-y-3">
          {step.questions.map((q, qi) => (
            <div key={qi}>
              <p className="text-sm font-medium mb-1.5">{q.q}</p>
              {q.options && (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => handleAnswer(q.q, opt)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-md border transition-colors',
                        answers[q.q] === opt
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'border-border bg-muted/50 text-muted-foreground hover:border-blue-500/50'
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Proceed button */}
      {!confirmed && (
        <div className="pt-1">
          <Button
            size="sm"
            disabled={!allAnswered}
            onClick={() => setConfirmed(true)}
            className="w-full"
          >
            {t('dev.confirmAndProceed' as TranslationKey)}
            <ArrowRight size={14} className="ml-1" />
          </Button>
          {!allAnswered && (
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              {t('dev.answerAll' as TranslationKey)}
            </p>
          )}
        </div>
      )}
      {confirmed && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle size={14} />
          {t('dev.answersConfirmed' as TranslationKey)}
        </div>
      )}
    </div>
  );
}

// ─── Plan content ───────────────────────────────────────────────────────────────

function PlanContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-4">
      {step.techChoices && step.techChoices.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.techChoices' as TranslationKey)}
          </p>
          <ul className="space-y-1">
            {step.techChoices.map((c, i) => (
              <li key={i} className="text-xs text-foreground flex items-center gap-1.5">
                <Check size={11} className="text-indigo-500 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step.files && step.files.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.fileChanges' as TranslationKey)}
          </p>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">{t('dev.file' as TranslationKey)}</th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">{t('dev.op' as TranslationKey)}</th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">{t('dev.desc' as TranslationKey)}</th>
                </tr>
              </thead>
              <tbody>
                {step.files.map((f, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="px-2 py-1 font-mono text-[11px] text-foreground">{f.path}</td>
                    <td className="px-2 py-1">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        f.op === '新增' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                        f.op === '修改' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                        'bg-red-500/10 text-red-500'
                      )}>{f.op}</span>
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step.steps && step.steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.implementationSteps' as TranslationKey)}
          </p>
          <ol className="space-y-1">
            {step.steps.map((s, i) => (
              <li key={i} className="text-xs text-foreground flex items-start gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-[10px] font-medium mt-0.5">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      {step.risks && step.risks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide flex items-center gap-1">
            <Warning size={12} className="text-amber-500" />
            {t('dev.risks' as TranslationKey)}
          </p>
          <ul className="space-y-1">
            {step.risks.map((r, i) => (
              <li key={i} className="text-xs text-amber-600 dark:text-amber-400 pl-1">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {!confirmed && (
        <div className="pt-1">
          <Button size="sm" onClick={() => setConfirmed(true)} className="w-full">
            {t('dev.confirmPlan' as TranslationKey)}
            <ArrowRight size={14} className="ml-1" />
          </Button>
        </div>
      )}
      {confirmed && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle size={14} />
          {t('dev.planConfirmed' as TranslationKey)}
        </div>
      )}
    </div>
  );
}

// ─── Locate content ────────────────────────────────────────────────────────────

function LocateContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {step.filesFound && step.filesFound.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.modifyFiles' as TranslationKey)}
          </p>
          <div className="space-y-1.5">
            {step.filesFound.map((f, i) => (
              <div key={i} className="text-xs border border-border/50 rounded-md px-2.5 py-2">
                <div className="font-mono text-[11px] text-foreground mb-0.5">{f.path}</div>
                <div className="text-muted-foreground">{f.summary}</div>
                {f.note && <div className="text-cyan-600 dark:text-cyan-400 mt-0.5 text-[10px]">{f.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {step.newFiles && step.newFiles.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.newFiles' as TranslationKey)}
          </p>
          <div className="space-y-1">
            {step.newFiles.map((f, i) => (
              <div key={i} className="text-xs flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-green-600 dark:text-green-400">+ {f.path}</span>
                <span className="text-muted-foreground">— {f.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Generate content ──────────────────────────────────────────────────────────

function GenerateContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-3">
      {step.codeBlocks && step.codeBlocks.length > 0 && (
        <div className="space-y-2">
          {step.codeBlocks.map((block, i) => (
            <div key={i} className="rounded-md border border-border/50 overflow-hidden">
              <button
                className="w-full px-3 py-1.5 flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors"
                onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
              >
                <span className="text-[11px] font-mono text-muted-foreground">{block.file}</span>
                <span className="text-[10px] text-muted-foreground">{expanded[i] ? '▲' : '▼'}</span>
              </button>
              {expanded[i] && (
                <pre className="px-3 py-2 text-[11px] font-mono overflow-x-auto bg-muted/20 border-t border-border/30">
                  <code>{block.code}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {!step.codeBlocks && (
        <p className="text-xs text-muted-foreground italic">{t('dev.generatingCode' as TranslationKey)}</p>
      )}
    </div>
  );
}

// ─── Write content ─────────────────────────────────────────────────────────────

function WriteContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      {step.writeResults && step.writeResults.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.writeResults' as TranslationKey)}
          </p>
          <div className="space-y-1">
            {step.writeResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {r.status === 'ok' ? (
                  <CheckCircle size={14} className="text-green-500 shrink-0" />
                ) : r.status === 'conflict' ? (
                  <Warning size={14} className="text-amber-500 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red-500 shrink-0" />
                )}
                <span className="font-mono text-[11px]">{r.path}</span>
                <span className="text-muted-foreground text-[10px]">— {r.op}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Verify content ─────────────────────────────────────────────────────────────

function VerifyContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={cn(
          'rounded-md border px-3 py-2 text-center',
          step.lintPassed
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-red-500/30 bg-red-500/5'
        )}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Lint</p>
          {step.lintPassed !== undefined ? (
            step.lintPassed
              ? <CheckCircle size={20} className="mx-auto text-green-500" />
              : <XCircle size={20} className="mx-auto text-red-500" />
          ) : (
            <Circle size={20} className="mx-auto text-muted-foreground animate-pulse" />
          )}
        </div>
        <div className={cn(
          'rounded-md border px-3 py-2 text-center',
          step.testPassed
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        )}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Unit Test</p>
          {step.testPassed !== undefined ? (
            step.testPassed
              ? <CheckCircle size={20} className="mx-auto text-green-500" />
              : <XCircle size={20} className="mx-auto text-red-500" />
          ) : (
            <Circle size={20} className="mx-auto text-muted-foreground animate-pulse" />
          )}
        </div>
      </div>
      {step.testSummary && (
        <p className="text-xs text-muted-foreground">{step.testSummary}</p>
      )}
    </div>
  );
}

// ─── PR content ────────────────────────────────────────────────────────────────

function PRContent({ step }: { step: DevStep }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {step.branch && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {t('dev.branch' as TranslationKey)}
          </p>
          <code className="text-xs font-mono bg-muted/60 px-2 py-1 rounded border border-border/50 block">
            git checkout -b {step.branch}
          </code>
        </div>
      )}

      {step.commitMsg && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {t('dev.commit' as TranslationKey)}
          </p>
          <code className="text-xs font-mono bg-muted/60 px-2 py-1.5 rounded border border-border/50 block whitespace-pre-wrap">
            {step.commitMsg}
          </code>
        </div>
      )}

      {step.prDescription && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {t('dev.prDescription' as TranslationKey)}
          </p>
          <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/40 rounded-md px-3 py-2 border border-border/30">
            {step.prDescription}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────────

export function DevStepCard({ stepData, stepNumber }: DevStepCardProps) {
  const { t } = useTranslation();
  const { step, status } = stepData;
  const accentClass = STEP_ACCENT[step];
  const headerBg = STEP_HEADER_BG[step];
  const Icon = STEP_ICONS[step];
  const stepIndex = STEP_ORDER.indexOf(step);

  const renderContent = () => {
    switch (step) {
      case 'clarify': return <ClarifyContent step={stepData} />;
      case 'plan':    return <PlanContent step={stepData} />;
      case 'locate':  return <LocateContent step={stepData} />;
      case 'generate': return <GenerateContent step={stepData} />;
      case 'write':   return <WriteContent step={stepData} />;
      case 'verify':  return <VerifyContent step={stepData} />;
      case 'pr':      return <PRContent step={stepData} />;
      default:        return null;
    }
  };

  return (
    <div className={cn(
      'rounded-xl border bg-card overflow-hidden',
      accentClass
    )}>
      <StepProgressBar current={stepIndex} />

      {/* Header */}
      <div className={cn('px-4 py-2.5 border-b border-border/30', headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon status={status} />
            <div className="flex items-center gap-1.5">
              <Icon size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                {stepNumber}. {t(STEP_LABEL_KEY[step] as TranslationKey)}
              </span>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {stepIndex + 1}/{STEP_ORDER.length}
          </span>
        </div>
        {stepData.title && (
          <p className="text-xs text-muted-foreground mt-1 pl-[22px]">{stepData.title}</p>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {renderContent()}
      </div>
    </div>
  );
}

// ─── DevStepCard container (renders multiple steps) ────────────────────────────

interface DevPipelineProps {
  steps: DevStep[];
}

export function DevPipeline({ steps }: DevPipelineProps) {
  if (steps.length === 0) return null;

  // Find the current (in-progress or first pending) step index
  const activeIndex = steps.findIndex(s => s.status === 'in_progress' || s.status === 'pending');

  return (
    <div className="space-y-3">
      {steps.map((stepData, i) => (
        <DevStepCard
          key={stepData.step}
          stepData={stepData}
          stepNumber={i + 1}
        />
      ))}
    </div>
  );
}
