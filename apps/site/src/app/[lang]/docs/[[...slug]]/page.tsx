import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { DownloadButton } from '@/components/docs/DownloadButton';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

interface MDXPageData {
  title?: string;
  description?: string;
  body: (props: { components: Record<string, unknown> }) => ReactNode;
  toc: { title: string; url: string; depth: number }[];
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[]; lang: string }>;
}) {
  const { slug, lang } = await params;
  const page = source.getPage(slug, lang);

  if (!page) notFound();

  // fumadocs-mdx provides body/toc at runtime; typed locally to bridge version gap
  const { body: MDXContent, toc } = page.data as unknown as MDXPageData;

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDXContent components={{ ...defaultMdxComponents, DownloadButton }} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[]; lang: string }>;
}): Promise<Metadata> {
  const { slug, lang } = await params;
  const page = source.getPage(slug, lang);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
