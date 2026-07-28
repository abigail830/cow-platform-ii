import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function IconPaperclip(props: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden {...props}>
      <path
        d="M11.2 4.2 6.4 9.6a2.25 2.25 0 0 0 3.2 3.2l5.4-5.8a3.75 3.75 0 0 0-5.3-5.3L4.3 7.4a5.25 5.25 0 0 0 7.4 7.4l6.1-6.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M8 12.5V3.5M8 3.5 4.5 7M8 3.5 11.5 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconNewSession(props: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden {...props}>
      <rect
        x="3"
        y="3"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M9 6.25v5.5M6.25 9h5.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSessionHistory(props: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden {...props}>
      <path
        d="M4 5.25h10M4 9h10M4 12.75h6.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="m4.5 4.5 7 7M11.5 4.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
