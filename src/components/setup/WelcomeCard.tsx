'use client';

import { useTranslation } from '@/hooks/useTranslation';

export function WelcomeCard() {
  const { t } = useTranslation();
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-medium">{t('setup.welcome.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('setup.welcome.description')}</p>
      <p className="text-[10px] text-muted-foreground/50">v{version}</p>
    </div>
  );
}
