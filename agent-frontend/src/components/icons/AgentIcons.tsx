import {
  ChefHat,
  Database,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { iconProps } from './icon-props.ts';

const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  ChefHat,
  Database,
  Library,
  Presentation,
};

const LEGACY_AGENT_ICONS: Record<string, LucideIcon> = {
  'smart-proposal': ChefHat,
  'generic-okf': Library,
};

export function AgentMenuIcon({
  name,
  icon,
  ...props
}: LucideProps & { name: string; icon?: string }) {
  const Icon =
    (icon && LUCIDE_BY_NAME[icon]) ?? LEGACY_AGENT_ICONS[name] ?? Library;
  return <Icon {...iconProps(props)} />;
}

export function IconSidenavCollapse(props: LucideProps) {
  return <PanelLeftClose {...iconProps(props)} />;
}

export function IconSidenavExpand(props: LucideProps) {
  return <PanelLeftOpen {...iconProps(props)} />;
}
