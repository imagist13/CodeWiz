import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';

const mdxSource = docs.toFumadocsSource();

// fumadocs-mdx v11 returns `files` as a function at runtime,
// while fumadocs-core v15 expects a plain array. Unwrap at runtime,
// cast via `any` to bridge the version mismatch.
/* eslint-disable @typescript-eslint/no-explicit-any */
const files: any = typeof mdxSource.files === 'function'
  ? (mdxSource.files as any)()
  : mdxSource.files;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const source = loader({
  baseUrl: '/docs',
  source: { ...mdxSource, files },
  i18n,
});
