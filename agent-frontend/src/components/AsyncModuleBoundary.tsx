import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  message?: string;
};

type State = {
  error: Error | null;
};

export class AsyncModuleBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="document-detail-panel-empty">
          <p>{this.props.message ?? 'Failed to load this view.'}</p>
          <p className="document-detail-panel-hint">
            A new version may have been deployed. Refresh the page and try again.
          </p>
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
