/**
 * ErrorBoundary.jsx - Catches and displays React errors
 * Prevents white screen when errors occur
 */

import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="vx-overlay err-screen" role="alert">
          <section className="vx-frame err-screen__panel">
            <h1 className="vx-sign-title">Something broke</h1>
            <p className="err-screen__lead">
              The game hit an error it couldn&apos;t recover from. Reloading usually fixes it; your last save is safe.
            </p>
            <pre className="err-screen__msg">{this.state.error?.message || 'Unknown error'}</pre>
            <details className="err-screen__details">
              <summary>Technical details</summary>
              <pre>{this.state.error?.stack || 'No stack trace available'}</pre>
            </details>
            <button type="button" className="vx-pbtn vx-pbtn--block" onClick={() => window.location.reload()}>
              Reload game
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
