import localFont from 'next/font/local';

export const inter = localFont({
  src: '../app/fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
});

export const geist = localFont({
  src: '../app/fonts/GeistVF.woff2',
  variable: '--font-sans',
  display: 'swap',
});
