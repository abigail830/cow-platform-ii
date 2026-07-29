import { ChefHat, Library, PanelLeftClose, PanelLeftOpen, type LucideIcon, type LucideProps } from 'lucide-react';
import { iconProps } from './icon-props.ts';

const AGENT_ICONS: Record<string, LucideIcon> = {
  'smart-proposal': ChefHat,
  'generic-okf': Library,
};

export function AgentMenuIcon({ name, ...props }: LucideProps & { name: string }) {
  const Icon = AGENT_ICONS[name] ?? Library;
  return <Icon {...iconProps(props)} />;
}

export function IconSidenavCollapse(props: LucideProps) {
  return <PanelLeftClose {...iconProps(props)} />;
}

export function IconSidenavExpand(props: LucideProps) {
  return <PanelLeftOpen {...iconProps(props)} />;
}
