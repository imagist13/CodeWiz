'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { MarketingContent } from '../../../content/marketing/en';

type ScreenshotItem = MarketingContent['hero']['screenshots'][number];

export function ScreenshotCarousel({
  items,
}: {
  items: ScreenshotItem[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isPaused = useRef(false);

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const slide = container.children[index] as HTMLElement | undefined;
    if (!slide) return;
    container.scrollTo({
      left: slide.offsetLeft - (container.offsetWidth - slide.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Array.from(container.children).indexOf(entry.target as HTMLElement);
            if (idx >= 0) setActiveIndex(idx);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPaused.current) return;
      setActiveIndex((prev) => {
        const next = (prev + 1) % items.length;
        scrollToIndex(next);
        return next;
      });
    }, 5500);
    return () => clearInterval(interval);
  }, [items.length, scrollToIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') scrollToIndex(Math.max(0, activeIndex - 1));
    else if (e.key === 'ArrowRight') scrollToIndex(Math.min(items.length - 1, activeIndex + 1));
  };

  return (
    <div>
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onMouseEnter={() => { isPaused.current = true; }}
        onMouseLeave={() => { isPaused.current = false; }}
        onFocus={() => { isPaused.current = true; }}
        onBlur={() => { isPaused.current = false; }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Screenshot carousel"
      >
        {items.map((item, i) => (
          <figure
            key={item.src}
            className="w-full flex-shrink-0 snap-center"
          >
            <div className="overflow-hidden rounded-t-xl bg-card shadow-sm">
              <Image
                src={item.src}
                alt={item.alt}
                width={800}
                height={348}
                className="h-auto w-full"
                priority={i === 0}
                loading={i === 0 ? undefined : 'lazy'}
              />
            </div>
          </figure>
        ))}
      </div>

      {/* Dots only — dark gray active */}
      <div className="mt-4 flex items-center justify-center gap-1.5 pb-8">
        {items.map((item, i) => (
          <button
            key={item.src}
            type="button"
            onClick={() => scrollToIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === activeIndex ? 'w-5 bg-foreground' : 'w-1.5 bg-muted-foreground/25'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
