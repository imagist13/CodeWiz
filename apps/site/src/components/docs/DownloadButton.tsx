import { siteConfig } from '@/lib/site.config';

export function DownloadButton({ label = 'Download Latest Release' }: { label?: string }) {
  return (
    <a
      href={`${siteConfig.repo.releases}/latest`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 mb-6 inline-flex items-center gap-2 rounded-full bg-[#121213] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-[#121213]"
    >
      {label}
      <span aria-hidden="true">→</span>
    </a>
  );
}
