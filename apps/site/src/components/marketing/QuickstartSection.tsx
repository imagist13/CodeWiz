import type { MarketingContent } from '../../../content/marketing/en';

export function QuickstartSection({
  content,
}: {
  content: MarketingContent['quickstart'];
}) {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[800px] px-6">
        <h2 className="text-2xl font-bold text-foreground md:text-3xl">
          {content.title}
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-4">
          {content.steps.map((step) => (
            <div
              key={step.step}
              className="flex gap-4 md:flex-col md:gap-0"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground md:mb-4">
                {step.step}
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
