import {
  Mic,
  Boxes,
  Bot,
  ClipboardCheck,
  Combine,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  Highlighter,
  KeyRound,
  Library,
  ListChecks,
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
  'judge-dimensions': ListChecks,
  'builtin-agents': Bot,
  'asr-hotwords': Highlighter,
  storage: Database,
  documents: FileText,
  audio: Mic,
  knowledge: Library,
  users: Users,
  roles: ShieldCheck,
  permissions: KeyRound,
  'hybrid-search': Combine,
  'evaluation-dataset': FlaskConical,
  'evaluation-run': ClipboardCheck,
};

export function NavPageIcon({ name, ...props }: LucideProps & { name: NavPageIcon }) {
  const Icon = NAV_ICONS[name];
  return <Icon {...iconProps(props)} />;
}
