import type { ComponentType, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function IconProposalChef(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M3 11.5h10M5 11.5V8a3 3 0 0 1 6 0v3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 5.5c0-1.5 1-2.5 2-2.5s2 1 2 2.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path d="M2 11.5h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function IconOkfExplorer(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M3 3.5h10v9H3z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6.5h5M5.5 9h3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M6 3.5V2.5M10 3.5V2.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

const AGENT_ICONS: Record<string, ComponentType<IconProps>> = {
  'smart-proposal': IconProposalChef,
  'generic-okf': IconOkfExplorer,
};

export function AgentMenuIcon({ name, ...props }: IconProps & { name: string }) {
  const Icon = AGENT_ICONS[name] ?? IconOkfExplorer;
  return <Icon {...props} />;
}

export function IconSidenavCollapse(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <rect
        x="2.5"
        y="3"
        width="6.5"
        height="10"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M11.5 8H14M12.5 6l2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSidenavExpand(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <rect
        x="7"
        y="3"
        width="6.5"
        height="10"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M4.5 8H2M3.5 6l-2 2 2 2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
