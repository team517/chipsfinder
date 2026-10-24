import { Component, type ReactNode } from "react";

// Si una sección falla, se muestra un aviso con "Reintentar" en vez de dejar la pantalla en negro.
export default class ErrorBoundary extends Component<{ children: ReactNode; es: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[panel]", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const es = this.props.es;
    return (
      <div className="state state--empty" role="alert" style={{ marginTop: 24 }}>
        <span className="state__code">ERR</span>
        <p className="state__text">{es ? "Algo ha fallado en esta pantalla." : "Something went wrong on this screen."}</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => this.setState({ error: null })}>
          {es ? "Reintentar" : "Retry"}
        </button>
      </div>
    );
  }
}
