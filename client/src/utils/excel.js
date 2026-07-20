let xlsxModulePromise = null;

export const loadXlsx = async () => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }

  return await xlsxModulePromise;
};

export const getExcelValue = (row, names) => {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }

  return "";
};

export const parseExcelNumber = (value, fallback = 0) => {
  const normalizedValue = String(value).replace(",", ".").trim();
  const number = Number(normalizedValue);

  return Number.isFinite(number) ? number : fallback;
};

export const parseImportedStrength = (
  value,
  { allowByBrand = false } = {}
) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (
    allowByBrand &&
    ["", "по бренду", "наследовать", "by brand"].includes(normalizedValue)
  ) {
    return "";
  }

  const strengthAliases = {
    unknown: "unknown",
    "не указана": "unknown",
    "не указано": "unknown",
    light: "light",
    "лёгкая": "light",
    "легкая": "light",
    medium: "medium",
    "средняя": "medium",
    strong: "strong",
    "крепкая": "strong",
    extra_strong: "extra_strong",
    "очень крепкая": "extra_strong",
  };

  return strengthAliases[normalizedValue] || (allowByBrand ? "" : "unknown");
};

export const parseExcelDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(
      excelEpoch.getTime() + value * 24 * 60 * 60 * 1000
    );

    return Number.isNaN(date.getTime())
      ? ""
      : date.toISOString().slice(0, 10);
  }

  const cleanValue = String(value).trim();

  if (!cleanValue) {
    return "";
  }

  const date = new Date(cleanValue);

  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const dateParts = cleanValue.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/
  );

  if (dateParts) {
    const [, day, month, year] = dateParts;
    const fullYear = year.length === 2 ? `20${year}` : year;

    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return cleanValue;
};
