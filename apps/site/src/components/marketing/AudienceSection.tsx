import type { MarketingContent } from '../../../content/marketing/en';

export function AudienceSection({
  content,
}: {
  content: MarketingContent['audience'];
}) {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[800px] px-6">
        <h2 className="text-2xl font-bold text-foreground md:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-muted-foreground">{content.subtitle}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.items.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
