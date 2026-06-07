import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { i18n } from '@/lib/i18n';
import { inter, geist } from '@/lib/fonts';

export default async function LangLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <html lang={lang} className={`${inter.variable} ${geist.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <RootProvider i18n={{
          locale: lang,
          locales: [
            { locale: 'en', name: 'English' },
            { locale: 'zh', name: '中文' },
          ],
        }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
