import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort crash screen. Without it, any uncaught render error unmounts
 * the whole tree and leaves the user staring at a black page with the camera
 * light still on.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#020205] p-6 text-center">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
          Something went wrong
        </span>
        <h1 className="text-xl font-extrabold text-zinc-100">
          The coach hit an unexpected error
        </h1>
        <p className="max-w-md text-sm text-zinc-400">
          Your workout history and calibration are saved on this device.
          Reload the page to get back to training.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-red-600 hover:bg-red-500 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-md active:scale-95"
        >
          Reload App
        </button>
        <code className="mt-2 max-w-md overflow-x-auto rounded-lg bg-zinc-900/60 px-3 py-2 text-[10px] text-zinc-500">
          {this.state.error.message}
        </code>
      </div>
    );
  }
}
