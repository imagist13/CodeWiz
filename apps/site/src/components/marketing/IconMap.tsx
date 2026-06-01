import {
  MessageSquare,
  Settings,
  Plug,
  Sparkles,
  Radio,
  FolderOpen,
  Layers,
  Shield,
  Brain,
  Bookmark,
  Compass,
  Code,
  KeyRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  MessageSquare,
  Settings,
  Plug,
  Sparkles,
  Radio,
  FolderOpen,
  Layers,
  Shield,
  Brain,
  Bookmark,
  Compass,
  Code,
  Key: KeyRound,
  Users,
};

export function CapabilityIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}
