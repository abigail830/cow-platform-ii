import type { ComponentType, SVGProps } from 'react';
import type { NavPageIcon } from '../../shared/admin-nav.ts';

type IconProps = SVGProps<SVGSVGElement>;

function IconModels(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <circle cx="8" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="4" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M7 5.2L4.6 9.5M9 5.2l2.4 4.3M5.5 11h5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDocuments(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M4 1.5h5.5L13 5v9.5H4z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M8.5 2.5V5.5H12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M6 8.5h4M6 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconStorage(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <ellipse cx="8" cy="4.25" rx="5" ry="1.75" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M3 4.25v3.5c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75v-3.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M3 7.75v3.5c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75v-3.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function IconUsers(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <circle cx="5.5" cy="5.25" r="1.75" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M2 12.75c0-2.1 1.6-3.5 3.5-3.5s3.5 1.4 3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="11" cy="5.75" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8.5 12.75c.2-1.6 1.3-2.75 2.75-2.75 1.1 0 2 .55 2.5 1.4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRoles(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M8 2.5l4.5 1.65v3.85c0 2.35-1.75 4.05-4.5 5.5-2.75-1.45-4.5-3.15-4.5-5.5V4.15L8 2.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 8.25L7.5 9.5 10 7"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPermissions(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <circle cx="6" cy="9.5" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8.5 9.5H13v1.75a1.25 1.25 0 0 1-1.25 1.25H11"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M6 6.5V5.25a1.75 1.75 0 1 1 3.5 0V6.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

const NAV_ICONS: Record<NavPageIcon, ComponentType<IconProps>> = {
  models: IconModels,
  storage: IconStorage,
  documents: IconDocuments,
  users: IconUsers,
  roles: IconRoles,
  permissions: IconPermissions,
};

export function NavPageIcon({ name, ...props }: IconProps & { name: NavPageIcon }) {
  const Icon = NAV_ICONS[name];
  return <Icon {...props} />;
}
