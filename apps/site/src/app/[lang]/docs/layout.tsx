import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { DocsTopNav } from '@/components/docs/DocsTopNav';

export default async function DocsLayoutWrapper({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <div className="flex min-h-screen flex-col">
      <DocsTopNav locale={lang} />
      <DocsLayout
        {...baseOptions(lang)}
        tree={source.pageTree[lang]}
        nav={{ enabled: false }}
        links={[]}
        githubUrl={undefined}
        sidebar={{ collapsible: false }}
      >
        {children}
      </DocsLayout>
    </div>
  );
}
