import type { LucideProps } from 'lucide-react';

export const ICON_SIZE = 16;
export const ICON_SIZE_LG = 18;
export const ICON_STROKE = 1.5;

export function iconProps(overrides?: LucideProps): LucideProps {
  return {
    size: ICON_SIZE,
    strokeWidth: ICON_STROKE,
    'aria-hidden': true,
    ...overrides,
  };
}
