import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { MarketingContent } from '../../../content/marketing/en';

export function DocsEntrySection({
  content,
  locale,
}: {
  content: MarketingContent['docs'];
  locale: string;
}) {
  const prefix = locale === 'en' ? '' : `/${locale}`;

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[800px] px-6">
        <h2 className="mb-8 text-2xl font-bold text-foreground md:text-3xl">
          {content.title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {content.cards.map((card) => (
            <Link
              key={card.href}
              href={`${prefix}${card.href}`}
              className="group flex items-start justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div>
                <h3 className="font-semibold text-foreground">{card.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {card.description}
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
