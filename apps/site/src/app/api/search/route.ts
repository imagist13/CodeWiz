import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const { GET } = createFromSource(source, {
  localeMap: {
    // Orama does not have a Chinese stemmer; use English tokenizer as fallback
    zh: 'english',
  },
});
