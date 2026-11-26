import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  moduleKey: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class DeckErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error in this module.',
    };
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.moduleKey !== this.props.moduleKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="hud-panel rounded-xl p-8 max-w-lg mx-auto my-8 border border-rose-400/40 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <div className="text-sm font-bold text-white">Module Encountered an Unexpected Error</div>
          <p className="text-xs font-mono text-rose-200 break-words">{this.state.errorMessage}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
