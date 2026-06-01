import { en } from './en';
import { zh } from './zh';
import type { MarketingContent } from './en';

const content: Record<string, MarketingContent> = { en, zh };

export function getMarketingContent(locale: string): MarketingContent {
  return content[locale] ?? content.en;
}

export type { MarketingContent };
