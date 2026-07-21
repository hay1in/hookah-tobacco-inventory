import StrengthIndicator from "./StrengthIndicator";
import {
  getStrengthLabel,
  STRENGTH_OPTIONS,
} from "../constants/strength";

function BrandStrengthSettings({
  editor,
  isSaving,
  onChange,
  onClose,
  onSave,
}) {
  if (!editor) {
    return null;
  }

  return (
    <div
      className="choice-modal-backdrop"
      onClick={onClose}
    >
      <section
        className="choice-modal brand-strength-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="choice-modal-close"
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
        >
          ×
        </button>

        <span className="choice-modal-eyebrow">
          Настройки бренда
        </span>

        <h2>{editor.brand}</h2>

        <div className="brand-strength-current">
          <span>Текущий стандарт</span>

          <strong>
            {getStrengthLabel(editor.strength)}
          </strong>

          <StrengthIndicator
            strength={editor.strength}
            inherited={false}
          />
        </div>

        <label>
          Стандартная крепость бренда

          <select
            value={editor.strength}
            onChange={(event) => onChange(event.target.value)}
          >
            {STRENGTH_OPTIONS.map((option) => (
              <option
                value={option.value}
                key={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>

          <span className="form-hint">
            Этот стандарт применяется ко всем вкусам бренда без индивидуального
            отклонения.
          </span>
        </label>

        <div className="choice-modal-actions horizontal">
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
          >
            {isSaving ? "Сохраняем..." : "Сохранить"}
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </section>
    </div>
  );
}

export default BrandStrengthSettings;
