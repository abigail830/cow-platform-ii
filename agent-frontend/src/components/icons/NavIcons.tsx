import {
  Boxes,
  Database,
  FileText,
  GitBranch,
  KeyRound,
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
  storage: Database,
  documents: FileText,
  users: Users,
  roles: ShieldCheck,
  permissions: KeyRound,
};

export function NavPageIcon({ name, ...props }: LucideProps & { name: NavPageIcon }) {
  const Icon = NAV_ICONS[name];
  return <Icon {...iconProps(props)} />;
}
