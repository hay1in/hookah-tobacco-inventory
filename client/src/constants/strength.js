export const STRENGTH_OPTIONS = Object.freeze([
  { value: "unknown", label: "Не указана" },
  { value: "light", label: "Лёгкая" },
  { value: "medium", label: "Средняя" },
  { value: "strong", label: "Крепкая" },
  { value: "extra_strong", label: "Очень крепкая" },
]);

export const STRENGTH_LEVELS = Object.freeze({
  unknown: 0,
  light: 1,
  medium: 2,
  strong: 3,
  extra_strong: 4,
});

export const getStrengthLabel = (value) => {
  return (
    STRENGTH_OPTIONS.find((option) => option.value === value)?.label ||
    "Не указана"
  );
};
