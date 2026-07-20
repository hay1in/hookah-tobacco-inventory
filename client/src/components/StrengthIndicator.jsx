import {
  getStrengthLabel,
  STRENGTH_LEVELS,
} from "../constants/strength";

function StrengthIndicator({
  strength = "unknown",
  inherited = false,
  className = "",
}) {
  const normalizedStrength =
    Object.prototype.hasOwnProperty.call(STRENGTH_LEVELS, strength)
      ? strength
      : "unknown";

  const level = STRENGTH_LEVELS[normalizedStrength];
  const segments = `${"▰".repeat(level)}${"▱".repeat(4 - level)}`;
  const label = getStrengthLabel(normalizedStrength);

  return (
    <span
      className={`strength-indicator strength-${normalizedStrength} ${
        inherited ? "inherited" : "custom"
      } ${className}`.trim()}
      title={inherited ? `${label} — по бренду` : label}
      aria-label={inherited ? `${label}, по бренду` : label}
    >
      {segments}
    </span>
  );
}

export default StrengthIndicator;
