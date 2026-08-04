import {
  Boxes,
  Bot,
  Combine,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  Library,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { NavPageIcon } from '../../shared/admin-nav.ts';
import { iconProps } from './icon-props.ts';

const NAV_ICONS: Record<NavPageIcon, LucideIcon> = {
  models: Boxes,
  pipelines: GitBranch,
  'builtin-agents': Bot,
  storage: Database,
  documents: FileText,
  knowledge: Library,
  users: Users,
  roles: ShieldCheck,
  permissions: KeyRound,
  playground: Bot,
  'session-explorer': Search,
  'hybrid-search': Combine,
};

export function NavPageIcon({ name, ...props }: LucideProps & { name: NavPageIcon }) {
  const Icon = NAV_ICONS[name];
  return <Icon {...iconProps(props)} />;
}
