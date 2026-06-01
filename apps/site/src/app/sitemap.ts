import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { siteConfig } from '@/lib/site.config';

export default function sitemap(): MetadataRoute.Sitemap {
  const url = siteConfig.url;

  const staticPages: MetadataRoute.Sitemap = [
    { url, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${url}/zh`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  ];

  const docPages: MetadataRoute.Sitemap = source.getPages().map((page) => {
    const lang = page.locale ?? 'en';
    const slugPath = page.slugs.join('/');
    const prefix = lang === 'en' ? '' : `/${lang}`;
    return {
      url: `${url}${prefix}/docs/${slugPath}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    };
  });

  return [...staticPages, ...docPages];
}
