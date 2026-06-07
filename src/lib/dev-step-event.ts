'use client';

/**
 * Custom event bus for Dev pipeline confirmations.
 * DevPipeline fires `dev-step-confirm` on window when user confirms a step.
 * ChatView listens and injects the confirmation into the chat.
 */

export interface DevStepConfirmDetail {
  step: string;
  answers: Record<string, string>;
}

export function dispatchDevStepConfirm(detail: DevStepConfirmDetail) {
  window.dispatchEvent(new CustomEvent<DevStepConfirmDetail>('dev-step-confirm', { detail }));
}

export function listenDevStepConfirm(handler: (detail: DevStepConfirmDetail) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<DevStepConfirmDetail>).detail);
  window.addEventListener('dev-step-confirm', listener);
  return () => window.removeEventListener('dev-step-confirm', listener);
}
