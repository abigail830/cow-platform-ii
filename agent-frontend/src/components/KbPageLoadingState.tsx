import { Loader2 } from 'lucide-react';
import { iconProps } from './icons/icon-props.ts';

type KbPageLoadingStateProps = {
  label: string;
};

export function KbPageLoadingState({ label }: KbPageLoadingStateProps) {
  return (
    <div className="kb-page-loading">
      <p className="session-explorer-loading" role="status" aria-live="polite">
        <Loader2 {...iconProps({ size: 18, className: 'session-explorer-loading-icon' })} aria-hidden />
        {label}
      </p>
    </div>
  );
}
