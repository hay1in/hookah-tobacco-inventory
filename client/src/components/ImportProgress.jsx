function ImportProgress({ importProgress }) {
  if (!importProgress) {
    return null;
  }

  const total = Number(importProgress.total || 0);
  const current = Number(importProgress.current || 0);
  const percent = total > 0
    ? Math.round((current / total) * 100)
    : 0;

  return (
    <div className="import-progress-overlay">
      <section className="import-progress-card">
        <span className="import-progress-label">
          {importProgress.stage || "Импортируем"}
        </span>

        <h2>
          {current.toLocaleString("ru-RU")} /{" "}
          {total.toLocaleString("ru-RU")}
        </h2>

        <div className="import-progress-bar">
          <span
            style={{
              width: `${Math.min(100, Math.max(0, percent))}%`,
            }}
          />
        </div>

        <strong>{percent}%</strong>

        {importProgress.currentItem && (
          <p>{importProgress.currentItem}</p>
        )}

        <em>Не закрывай страницу до завершения импорта</em>
      </section>
    </div>
  );
}

export default ImportProgress;
