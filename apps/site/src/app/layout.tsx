import './global.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site.config';

const title = {
  default: 'CodePilot — Desktop Workspace for Claude Code',
  template: '%s | CodePilot',
};

const description = siteConfig.description;

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(siteConfig.url),
  keywords: [
    'Claude Code',
    'AI coding',
    'desktop app',
    'MCP',
    'Claude',
    'Anthropic',
    'code assistant',
    'AI agent',
  ],
  authors: [{ name: 'CodePilot' }],
  creator: 'CodePilot',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: title.default,
    description,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CodePilot — Desktop Workspace for Claude Code',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: title.default,
    description,
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
