import { Bot, PanelLeftClose, PanelLeftOpen, type LucideProps } from 'lucide-react';
import { iconProps } from './icon-props.ts';

/** Shared agent icon — matches Agent playground sidenav entry. */
export function AgentMenuIcon(props: LucideProps) {
  return <Bot {...iconProps(props)} />;
}

export function IconSidenavCollapse(props: LucideProps) {
  return <PanelLeftClose {...iconProps(props)} />;
}

export function IconSidenavExpand(props: LucideProps) {
  return <PanelLeftOpen {...iconProps(props)} />;
}
