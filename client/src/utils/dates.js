export const getTodayInputDate = () => {
  return new Date().toISOString().slice(0, 10);
};

export const getCurrentTimestamp = () => Date.now();

export const getDateInputValue = (value) => {
  if (!value) {
    return getTodayInputDate();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};
