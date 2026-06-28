import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="crash-screen">
          <section className="crash-card">
            <span className="crash-eyebrow">Приложение остановилось</span>

            <h1>Что-то сломалось, но теперь экран не будет пустым</h1>

            <p>
              Ниже показана ошибка. Её можно скопировать и отправить в чат,
              чтобы быстро понять причину.
            </p>

            <pre>
              {this.state.error?.message || "Неизвестная ошибка"}
            </pre>

            <div className="crash-actions">
              <button onClick={() => window.location.reload()}>
                Перезагрузить
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(
                    this.state.error?.message || "Неизвестная ошибка"
                  );
                }}
              >
                Скопировать ошибку
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
