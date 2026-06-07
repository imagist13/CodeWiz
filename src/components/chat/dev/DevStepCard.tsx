'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { dispatchDevStepConfirm } from '@/lib/dev-step-event';
import {
  CheckCircle,
  XCircle,
  Circle,
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
  confirmed?: string[];
  confirmedAnswers?: Record<string, string>;
  techChoices?: string[];
  files?: Array<{ path: string; op: string; desc: string }>;
  steps?: string[];
  risks?: string[];
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

export interface DevPipelineProps {
  steps: DevStep[];
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

// ─── Icons ─────────────────────────────────────────────────────────────────────

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

// ─── ConfirmFooter (shared across all step types) ───────────────────────────────

interface ConfirmFooterProps {
  stepType: DevStepType;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm?: () => void;
  confirmLabel?: string;
}

function ConfirmFooter({ stepType, confirmed, disabled, onConfirm, confirmLabel }: ConfirmFooterProps) {
  const { t } = useTranslation();
  const Icon = STEP_ICONS[stepType];

  if (confirmed) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30 bg-green-500/5">
        <CheckCircle size={16} className="text-green-500 shrink-0" />
        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
          {t('dev.stepConfirmed' as TranslationKey)}
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs">{t(STEP_LABEL_KEY[stepType] as TranslationKey)}</span>
      </div>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => onConfirm?.()}
        className="gap-1.5"
      >
        {confirmLabel ?? t('dev.confirmAndProceed' as TranslationKey)}
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}

// ─── ClarifyContent ────────────────────────────────────────────────────────────

interface ClarifyContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function ClarifyContent({ step, onConfirm }: ClarifyContentProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>(step.confirmedAnswers ?? {});
  const [confirmed, setConfirmed] = useState(false);

  const handleAnswer = (q: string, option: string) => {
    setAnswers(prev => ({ ...prev, [q]: option }));
  };

  const allAnswered = step.questions?.every(q => answers[q.q]) ?? true;
  const confirmedItems = step.confirmed ?? [];

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm(answers);
  };

  return (
    <div className="space-y-4 px-4 py-3">
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
                        'text-xs px-2.5 py-1 rounded-md border transition-all duration-150',
                        answers[q.q] === opt
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'border-border bg-muted/50 text-muted-foreground hover:border-blue-500/50 hover:text-foreground'
                      )}
                    >
                      {answers[q.q] === opt && <Check size={10} className="inline mr-0.5" />}
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmFooter
        stepType="clarify"
        confirmed={confirmed}
        disabled={!allAnswered}
        onConfirm={handleConfirm}
      />
      {!allAnswered && (
        <p className="text-[10px] text-muted-foreground -mt-2 text-center">
          {t('dev.answerAll' as TranslationKey)}
        </p>
      )}
    </div>
  );
}

// ─── PlanContent ───────────────────────────────────────────────────────────────

interface PlanContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function PlanContent({ step, onConfirm }: PlanContentProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);
  const [editableFiles, setEditableFiles] = useState(step.files ?? []);

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm({});
  };

  const toggleOp = (index: number) => {
    const ops: Array<'新增' | '修改' | '删除'> = ['新增', '修改', '删除'];
    const curOp = editableFiles[index].op as typeof ops[number];
    const nextIdx = (ops.indexOf(curOp) + 1) % ops.length;
    const nextOp = ops[nextIdx];
    setEditableFiles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], op: nextOp };
      return next;
    });
  };

  return (
    <div className="space-y-4 px-4 py-3">
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

      {(step.files ?? []).length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.fileChanges' as TranslationKey)}
          </p>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">{t('dev.file' as TranslationKey)}</th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground w-14">{t('dev.op' as TranslationKey)}</th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">{t('dev.desc' as TranslationKey)}</th>
                </tr>
              </thead>
              <tbody>
                {editableFiles.map((f, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="px-2 py-1.5 font-mono text-[11px] text-foreground break-all">{f.path}</td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => toggleOp(i)}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors',
                          f.op === '新增' ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20' :
                          f.op === '修改' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20' :
                          'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        )}
                      >
                        {f.op}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{f.desc}</td>
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
                <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-[10px] font-medium mt-0.5">
                  {i + 1}
                </span>
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

      <ConfirmFooter
        stepType="plan"
        confirmed={confirmed}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

// ─── LocateContent ─────────────────────────────────────────────────────────────

interface LocateContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function LocateContent({ step, onConfirm }: LocateContentProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-4 px-4 py-3">
      {step.filesFound && step.filesFound.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            {t('dev.modifyFiles' as TranslationKey)}
          </p>
          <div className="space-y-1.5">
            {step.filesFound.map((f, i) => (
              <div key={i} className="text-xs border border-border/50 rounded-md px-2.5 py-2">
                <div className="font-mono text-[11px] text-foreground mb-0.5 break-all">{f.path}</div>
                <div className="text-muted-foreground">{f.summary}</div>
                {f.note && (
                  <div className="text-cyan-600 dark:text-cyan-400 mt-0.5 text-[10px]">
                    {f.note}
                  </div>
                )}
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

      <ConfirmFooter
        stepType="locate"
        confirmed={confirmed}
        onConfirm={() => { setConfirmed(true); onConfirm({}); }}
      />
    </div>
  );
}

// ─── GenerateContent ───────────────────────────────────────────────────────────

interface GenerateContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function GenerateContent({ step, onConfirm }: GenerateContentProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-3 px-4 py-3">
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
        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground italic">{t('dev.generatingCode' as TranslationKey)}</p>
        </div>
      )}

      <ConfirmFooter
        stepType="generate"
        confirmed={confirmed}
        onConfirm={() => { setConfirmed(true); onConfirm({}); }}
      />
    </div>
  );
}

// ─── WriteContent ─────────────────────────────────────────────────────────────

interface WriteContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function WriteContent({ step, onConfirm }: WriteContentProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-3 px-4 py-3">
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
                <span className="font-mono text-[11px] break-all">{r.path}</span>
                <span className="text-muted-foreground text-[10px]">— {r.op}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmFooter
        stepType="write"
        confirmed={confirmed}
        onConfirm={() => { setConfirmed(true); onConfirm({}); }}
      />
    </div>
  );
}

// ─── VerifyContent ─────────────────────────────────────────────────────────────

interface VerifyContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function VerifyContent({ step, onConfirm }: VerifyContentProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  const lintStatus = step.lintPassed === true ? 'pass' : step.lintPassed === false ? 'fail' : 'pending';
  const testStatus = step.testPassed === true ? 'pass' : step.testPassed === false ? 'fail' : 'pending';
  const allPassed = step.lintPassed !== false && step.testPassed !== false;

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        {/* Lint */}
        <div className={cn(
          'rounded-md border px-3 py-2',
          lintStatus === 'pass' ? 'border-green-500/30 bg-green-500/5' :
          lintStatus === 'fail' ? 'border-red-500/30 bg-red-500/5' :
          'border-border bg-muted/20'
        )}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Lint</p>
          {lintStatus === 'pass' && (
            <div className="flex items-center justify-center gap-1">
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">{t('dev.pass' as TranslationKey)}</span>
            </div>
          )}
          {lintStatus === 'fail' && (
            <div className="flex items-center justify-center gap-1">
              <XCircle size={16} className="text-red-500" />
              <span className="text-xs text-red-500">{t('dev.fail' as TranslationKey)}</span>
            </div>
          )}
          {lintStatus === 'pending' && (
            <div className="flex items-center justify-center gap-1">
              <Circle size={16} className="text-muted-foreground animate-pulse" />
              <span className="text-xs text-muted-foreground">{t('dev.running' as TranslationKey)}</span>
            </div>
          )}
        </div>

        {/* Unit Test */}
        <div className={cn(
          'rounded-md border px-3 py-2',
          testStatus === 'pass' ? 'border-green-500/30 bg-green-500/5' :
          testStatus === 'fail' ? 'border-red-500/30 bg-red-500/5' :
          'border-border bg-muted/20'
        )}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Unit Test</p>
          {testStatus === 'pass' && (
            <div className="flex items-center justify-center gap-1">
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">{t('dev.pass' as TranslationKey)}</span>
            </div>
          )}
          {testStatus === 'fail' && (
            <div className="flex items-center justify-center gap-1">
              <XCircle size={16} className="text-red-500" />
              <span className="text-xs text-red-500">{t('dev.fail' as TranslationKey)}</span>
            </div>
          )}
          {testStatus === 'pending' && (
            <div className="flex items-center justify-center gap-1">
              <Circle size={16} className="text-muted-foreground animate-pulse" />
              <span className="text-xs text-muted-foreground">{t('dev.running' as TranslationKey)}</span>
            </div>
          )}
        </div>
      </div>

      {step.testSummary && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
          {step.testSummary}
        </p>
      )}

      <ConfirmFooter
        stepType="verify"
        confirmed={confirmed}
        disabled={!allPassed}
        onConfirm={() => { setConfirmed(true); onConfirm({}); }}
      />
    </div>
  );
}

// ─── PRContent ─────────────────────────────────────────────────────────────────

interface PRContentProps {
  step: DevStep;
  onConfirm: (answers: Record<string, string>) => void;
}

function PRContent({ step, onConfirm }: PRContentProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  const gitCommands = step.branch ? [
    { cmd: `git checkout -b ${step.branch}`, label: t('dev.createBranch' as TranslationKey) },
    { cmd: 'git add .', label: t('dev.stageFiles' as TranslationKey) },
    { cmd: `git commit -m "..."`, label: t('dev.commit' as TranslationKey) },
    { cmd: `git push -u origin ${step.branch}`, label: t('dev.pushBranch' as TranslationKey) },
  ] : [];

  const hasAllInfo = step.branch && step.commitMsg && step.prDescription;

  return (
    <div className="space-y-4 px-4 py-3">
      {step.branch && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {t('dev.gitCommands' as TranslationKey)}
          </p>
          <div className="space-y-1.5">
            {gitCommands.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-[10px] text-muted-foreground flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{item.label}</p>
                  <code className="text-[11px] font-mono bg-muted/70 px-2 py-1 rounded border border-border/40 block break-all">
                    {item.cmd}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step.commitMsg && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {t('dev.commitMessage' as TranslationKey)}
          </p>
          <code className="text-xs font-mono bg-muted/60 px-3 py-2 rounded border border-border/50 block whitespace-pre-wrap text-foreground/80">
            {step.commitMsg}
          </code>
        </div>
      )}

      {step.prDescription && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {t('dev.prDescription' as TranslationKey)}
          </p>
          <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/40 rounded-md px-3 py-2 border border-border/30 max-h-40 overflow-y-auto">
            {step.prDescription}
          </div>
        </div>
      )}

      <ConfirmFooter
        stepType="pr"
        confirmed={confirmed}
        disabled={!hasAllInfo}
        onConfirm={() => { setConfirmed(true); onConfirm({}); }}
      />
    </div>
  );
}

// ─── DevStepCard ───────────────────────────────────────────────────────────────

interface DevStepCardProps {
  stepData: DevStep;
  stepNumber: number;
  onConfirm?: (stepType: DevStepType, answers: Record<string, string>) => void;
}

function DevStepCard({ stepData, stepNumber, onConfirm }: DevStepCardProps) {
  const { t } = useTranslation();
  const { step, status } = stepData;
  const accentClass = STEP_ACCENT[step];
  const headerBg = STEP_HEADER_BG[step];
  const Icon = STEP_ICONS[step];
  const stepIndex = STEP_ORDER.indexOf(step);

  const handleConfirm = (answers: Record<string, string>) => {
    onConfirm?.(step, answers);
  };

  const renderContent = () => {
    const props = { step: stepData, onConfirm: handleConfirm };
    switch (step) {
      case 'clarify':  return <ClarifyContent {...props} />;
      case 'plan':     return <PlanContent {...props} />;
      case 'locate':   return <LocateContent {...props} />;
      case 'generate': return <GenerateContent {...props} />;
      case 'write':    return <WriteContent {...props} />;
      case 'verify':   return <VerifyContent {...props} />;
      case 'pr':       return <PRContent {...props} />;
      default:         return null;
    }
  };

  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', accentClass)}>
      <StepProgressBar current={stepIndex} />

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

      {renderContent()}
    </div>
  );
}

// ─── DevPipeline ───────────────────────────────────────────────────────────────

export function DevPipeline({ steps }: DevPipelineProps) {
  if (steps.length === 0) return null;

  const handleStepConfirm = (stepType: DevStepType, answers: Record<string, string>) => {
    dispatchDevStepConfirm({ step: stepType, answers });
  };

  return (
    <div className="space-y-3">
      {steps.map((stepData, i) => (
        <DevStepCard
          key={stepData.step}
          stepData={stepData}
          stepNumber={i + 1}
          onConfirm={handleStepConfirm}
        />
      ))}
    </div>
  );
}
