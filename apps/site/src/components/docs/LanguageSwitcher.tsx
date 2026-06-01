'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LanguageSwitcher({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (newLocale: string | null) => {
    if (!newLocale) return;
    let newPath: string;
    if (locale === 'en') {
      newPath = `/${newLocale}${pathname}`;
    } else {
      newPath = newLocale === 'en'
        ? pathname.replace(`/${locale}`, '') || '/'
        : pathname.replace(`/${locale}`, `/${newLocale}`);
    }
    router.push(newPath);
  };

  return (
    <Select defaultValue={locale} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="h-7 gap-1.5 rounded-md border-border bg-transparent px-2 text-xs">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue>
          {locale === 'zh' ? '简体中文' : 'English'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="zh">简体中文</SelectItem>
      </SelectContent>
    </Select>
  );
}
