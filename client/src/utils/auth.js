export const AUTH_REQUEST_TIMEOUT_MS = 30000;
export const AUXILIARY_REQUEST_TIMEOUT_MS = 10000;

const AUTH_STORAGE_KEY = "hookahInventoryAuth";
const AUTH_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error(
        "Сервер долго не отвечает. Проверьте, что backend и база данных запущены."
      );

      timeoutError.code = "AUTH_REQUEST_TIMEOUT";
      throw timeoutError;
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const getAuthErrorMessage = (error) => {
  if (error?.code === "AUTH_REQUEST_TIMEOUT") {
    return error.message;
  }

  if (error instanceof TypeError) {
    return "Не удалось подключиться к серверу. Проверьте backend и интернет-соединение.";
  }

  return error?.message || "Не удалось войти";
};

export const readSavedAuth = () => {
  try {
    const rawValue = localStorage.getItem(AUTH_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const savedAuth = JSON.parse(rawValue);

    if (!savedAuth?.password || !savedAuth?.expiresAt) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (Date.now() > savedAuth.expiresAt) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return savedAuth;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const saveAuth = (password, role) => {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      password,
      role,
      expiresAt: Date.now() + AUTH_TTL_MS,
    })
  );
};

export const clearSavedAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};
