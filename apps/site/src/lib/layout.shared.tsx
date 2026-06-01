import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { siteConfig } from '@/lib/site.config';

/**
 * Shared options used by both HomeLayout and DocsLayout.
 */
export function baseOptions(locale: string): BaseLayoutProps {
  return {
    nav: {
      url: `/${locale === 'en' ? '' : locale}`,
    },
    links: [
      {
        text: 'Docs',
        url: `/${locale === 'en' ? '' : locale + '/'}docs`,
        active: 'nested-url',
      },
      {
        text: 'Download',
        url: `/${locale === 'en' ? '' : locale + '/'}docs/installation`,
      },
    ],
    githubUrl: siteConfig.repo.url,
    i18n: false,
    themeSwitch: { enabled: false },
  };
}

/**
 * Homepage-specific overrides: no nav (custom scroll-nav used instead), no search.
 */
export function homeOptions(locale: string): BaseLayoutProps {
  return {
    ...baseOptions(locale),
    nav: {
      enabled: false,
    },
    searchToggle: { enabled: false },
  };
}
