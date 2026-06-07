import type { MarketingContent } from '../../../content/marketing/en';

export function SiteFooter({
  content,
}: {
  content: MarketingContent['footer'];
}) {
  return (
    <footer>
      <div className="mx-auto flex max-w-[800px] flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <span>{content.copyright}</span>
        <nav className="flex gap-6">
          {content.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              className="transition-colors hover:text-foreground"
              {...(link.url.startsWith('http')
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              {link.text}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
