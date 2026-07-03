import { useEffect, useState } from "react";
import "./App.css";

let xlsxModulePromise = null;

const loadXlsx = async () => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }

  return await xlsxModulePromise;
};


const API_URL = import.meta.env.VITE_API_URL || "";

const AUTH_STORAGE_KEY = "hookahInventoryAuth";
const AUTH_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const readSavedAuth = () => {
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

const saveAuth = (password, role) => {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      password,
      role,
      expiresAt: Date.now() + AUTH_TTL_MS,
    })
  );
};

const clearSavedAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

const getTodayInputDate = () => {
  return new Date().toISOString().slice(0, 10);
};

const scrollToPageTop = () => {
  window.setTimeout(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, 0);
};

function App() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentView, setCurrentView] = useState("inventory");
  const [analyticsFilter, setAnalyticsFilter] = useState("all");
  const [deadstockFilter, setDeadstockFilter] = useState("all");
  const [isMainTagsExpanded, setIsMainTagsExpanded] = useState(false);
  const [isOtherTagsExpanded, setIsOtherTagsExpanded] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [accessRole, setAccessRole] = useState("admin");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [actionLogs, setActionLogs] = useState([]);
  const [historyActionFilter, setHistoryActionFilter] = useState("all");
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState("all");
  const [historySearchText, setHistorySearchText] = useState("");
  const [aliases, setAliases] = useState([]);
  const [aliasForm, setAliasForm] = useState({
    type: "brand",
    alias: "",
    canonical: "",
  });

  const isDemoMode = accessRole === "test";

  const [flavors, setFlavors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [notifications, setNotifications] = useState([]);

  const [isSupplyFormOpen, setIsSupplyFormOpen] = useState(false);
  const [supplyForm, setSupplyForm] = useState({
    brand: "",
    name: "",
    weight: "",
    quantity: 1,
    supplyDate: getTodayInputDate(),
    supplier: "",
    price: "",
    tags: "",
    minStock: 1,
  });

  const [editingFlavorId, setEditingFlavorId] = useState(null);
  const [editForm, setEditForm] = useState({
    brand: "",
    name: "",
    packsText: "",
    tags: "",
    minStock: 1,
  });

  const showNotification = (message, type = "success") => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setNotifications((currentNotifications) => [
      ...currentNotifications,
      {
        id,
        message,
        type,
      },
    ]);

    window.setTimeout(() => {
      setNotifications((currentNotifications) =>
        currentNotifications.filter((notification) => notification.id !== id)
      );
    }, 3600);
  };

  const closeNotification = (notificationId) => {
    setNotifications((currentNotifications) =>
      currentNotifications.filter(
        (notification) => notification.id !== notificationId
      )
    );
  };

  const renderNotifications = () => {
    if (notifications.length === 0) {
      return null;
    }

    return (
      <div className="notification-stack">
        {notifications.map((notification) => (
          <div
            className={`notification-toast ${notification.type}`}
            key={notification.id}
          >
            <span>{notification.message}</span>

            <button onClick={() => closeNotification(notification.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderImportProgress = () => {
    if (!importProgress) {
      return null;
    }

    const total = Number(importProgress.total || 0);
    const current = Number(importProgress.current || 0);
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    return (
      <div className="import-progress-overlay">
        <section className="import-progress-card">
          <span className="import-progress-label">
            {importProgress.stage || "Импортируем"}
          </span>

          <h2>{current.toLocaleString("ru-RU")} / {total.toLocaleString("ru-RU")}</h2>

          <div className="import-progress-bar">
            <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>

          <strong>{percent}%</strong>

          {importProgress.currentItem && (
            <p>{importProgress.currentItem}</p>
          )}

          <em>Не закрывай страницу до завершения импорта</em>
        </section>
      </div>
    );
  };

  const apiFetch = (path, options = {}) => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "x-admin-password": adminPassword,
        ...(options.headers || {}),
      },
    });
  };

  const loadFlavorsWithPassword = async (password) => {
    const response = await fetch(`${API_URL}/api/flavors`, {
      headers: {
        "x-admin-password": password,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || "Не удалось войти");
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Backend вернул некорректные данные");
    }

    return data;
  };

  const loadActionLogsWithPassword = async (password) => {
    const response = await fetch(`${API_URL}/api/action-logs`, {
      headers: {
        "x-admin-password": password,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    return Array.isArray(data) ? data : [];
  };

  useEffect(() => {
    const savedAuth = readSavedAuth();

    if (!savedAuth) {
      return;
    }

    const loginWithSavedPassword = async () => {
      try {
        setIsLoading(true);
        setAuthError("");

        const data = await loadFlavorsWithPassword(savedAuth.password);
        const logs = await loadActionLogsWithPassword(savedAuth.password);

        setActionLogs(logs);
        setAdminPassword(savedAuth.password);
        setAccessRole(savedAuth.role || (savedAuth.password === "test" ? "test" : "admin"));
        setFlavors(data);
        setIsAuthorized(true);
        setErrorText("");
      } catch (error) {
        console.error(error);
        clearSavedAuth();
        setAuthError("Сохранённый вход истёк. Введите пароль заново.");
      } finally {
        setIsLoading(false);
      }
    };

    loginWithSavedPassword();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();

    const trimmedPassword = passwordInput.trim();

    if (!trimmedPassword) {
      setAuthError("Введите пароль");
      return;
    }

    try {
      setIsLoading(true);
      setAuthError("");

      const data = await loadFlavorsWithPassword(trimmedPassword);
      const logs = await loadActionLogsWithPassword(trimmedPassword);

      setActionLogs(logs);

      const role = trimmedPassword === "test" ? "test" : "admin";

      saveAuth(trimmedPassword, role);

      setAdminPassword(trimmedPassword);
      setAccessRole(role);
      setFlavors(data);
      setIsAuthorized(true);
      setPasswordInput("");
      setErrorText("");
    } catch (error) {
      console.error(error);
      setAuthError(error.message || "Не удалось войти");
    } finally {
      setImportProgress(null);
      setIsLoading(false);
    }
  };


  const addActionLog = async ({ action, flavor, details = {}, refreshLogs = true }) => {
    if (isDemoMode) {
      return;
    }

    try {
      await apiFetch("/api/action-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          flavorId: flavor?.id || null,
          brand: flavor?.brand || "",
          name: flavor?.name || "",
          details,
        }),
      });

      if (refreshLogs) {
        const updatedLogs = await loadActionLogsWithPassword(adminPassword);
        setActionLogs(updatedLogs);
      }
    } catch (error) {
      console.error("Action log error:", error);
    }
  };

  const loadActionLogs = async () => {
    try {
      const response = await apiFetch("/api/action-logs");

      if (!response.ok) {
        throw new Error("Не удалось загрузить историю");
      }

      const data = await response.json();
      setActionLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось загрузить историю");
    }
  };

  const openHistory = async () => {
    setCurrentView("history");

    try {
      await loadActionLogs();
    } catch (error) {
      console.error(error);
      showNotification("История открыта, но логи не удалось обновить", "error");
    }
  };

  const handleLogout = () => {
    clearSavedAuth();
    setIsAuthorized(false);
    setAdminPassword("");
    setAccessRole("admin");
    setPasswordInput("");
    setFlavors([]);
    setActionLogs([]);
    setErrorText("");
    setAuthError("");
  };

  const refreshFlavors = async () => {
    try {
      const response = await apiFetch(`/api/flavors?ts=${Date.now()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось обновить вкусы");
      }

      const data = await response.json();
      setFlavors(Array.isArray(data) ? data : []);
      setErrorText("");
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось подключиться к серверу");
    } finally {
      setImportProgress(null);
      setIsLoading(false);
    }
  };

  const getPacksArray = (packsOrFlavor = []) => {
    if (Array.isArray(packsOrFlavor)) {
      return packsOrFlavor;
    }

    return Array.isArray(packsOrFlavor?.packs) ? packsOrFlavor.packs : [];
  };

  const getTotalQuantity = (packsOrFlavor = []) => {
    return getPacksArray(packsOrFlavor).reduce((sum, pack) => {
      return sum + Number(pack.quantity || 0);
    }, 0);
  };

  const getTotalPurchasedQuantity = (packsOrFlavor = []) => {
    return getPacksArray(packsOrFlavor).reduce((sum, pack) => {
      return (
        sum +
        Number(
          pack.purchasedQuantity ??
            pack.purchased_quantity ??
            pack.quantity ??
            0
        )
      );
    }, 0);
  };

  const getStatus = (flavor) => {
    const total = getTotalQuantity(flavor.packs || []);
    const isLowStock = Boolean(flavor.lowStock || flavor.low_stock);

    if (flavor.archived) {
      return {
        text: "Архив",
        className: "status archived",
      };
    }

    if (total === 0) {
      return {
        text: "Отсутствует",
        className: "status need-buy",
      };
    }

    if (isLowStock) {
      return {
        text: "Мало осталось",
        className: "status low-stock",
      };
    }

    return {
      text: "В наличии",
      className: "status in-stock",
    };
  };

  const openSupplyLogFromAnalytics = (logId) => {
    const log = actionLogs.find((item) => String(item.id) === String(logId));

    if (!log) {
      showNotification("Поставка не найдена в истории", "error");
      return;
    }

    editSupplyLog(log);
  };


  const openFlavorFromAnalytics = (flavorId) => {
    const flavor = flavors.find((item) => String(item.id) === String(flavorId));

    if (!flavor) {
      showNotification("Вкус не найден на складе", "error");
      return;
    }

    setCurrentView("inventory");
    setSearchText(flavor.name || "");
    setSelectedTag("all");
    setStatusFilter("all");
    setOpenBrandName(flavor.brand || "");
    setOpenFlavorId(flavor.id);
    highlightFlavor(flavor.id);
    openEditForm(flavor);
  };

  const handleDataQualityItemClick = (item) => {
    if (item.type === "flavor") {
      openFlavorFromAnalytics(item.id);
      return;
    }

    openSupplyLogFromAnalytics(item.id);
  };

  const highlightFlavor = (flavorId) => {
    if (!flavorId) {
      return;
    }

    setHighlightedFlavorId(flavorId);

    window.setTimeout(() => {
      setHighlightedFlavorId((currentId) =>
        String(currentId) === String(flavorId) ? null : currentId
      );
    }, 2600);
  };

  const adjustPackQuantity = async (flavorId, packIndex, delta) => {
    try {
      const flavor = flavors.find((item) => item.id === flavorId);
      const pack = (flavor?.packs || [])[packIndex];

      const response = await apiFetch(
        `/api/flavors/${flavorId}/packs/${packIndex}/adjust`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ delta }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось изменить фасовку");
      }

      const currentTotal = getTotalQuantity(flavor?.packs || []);
      const nextTotal = Math.max(0, currentTotal + delta);
      const isLowStock = Boolean(flavor?.lowStock || flavor?.low_stock);

      if (delta > 0 && isLowStock && nextTotal >= 2) {
        const lowStockResponse = await apiFetch(
          `/api/flavors/${flavorId}/low-stock`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              lowStock: false,
            }),
          }
        );

        if (!lowStockResponse.ok) {
          throw new Error("Пачка добавлена, но не удалось снять статус “мало осталось”");
        }

        await addActionLog({
          action: "low_stock_off",
          flavor,
          details: {
            reason: "Автоматически снято после пополнения остатка до 2+ пачек",
          },
        });
      }

      await addActionLog({
        action: delta === 1 ? "pack_plus" : "pack_minus",
        flavor,
        details: {
          weight: pack?.weight || "",
          delta,
        },
      });

      await refreshFlavors();
      highlightFlavor(flavorId);

      if (delta > 0) {
        showNotification(
          isLowStock && nextTotal >= 2
            ? "Пачка добавлена. Статус “мало осталось” снят."
            : "Пачка добавлена",
          "success"
        );
      } else {
        showNotification("Пачка списана", "success");
      }
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось изменить фасовку", "error");
      setErrorText(error.message || "Не удалось изменить фасовку");
    }
  };


  const clearFlavor = async (flavorId) => {
    try {
      const response = await apiFetch(`/api/flavors/${flavorId}/clear`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Не удалось выбить вкус");
      }

      const flavor = flavors.find((item) => item.id === flavorId);

      await addActionLog({
        action: "clear",
        flavor,
      });

      await refreshFlavors();
      showNotification("Вкус выбит", "success");
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось выбить вкус", "error");
      setErrorText(error.message || "Не удалось выбить вкус");
    }
  };

  const archiveFlavor = async (flavorId) => {
    const isConfirmed = window.confirm(
      "Отправить вкус в архив? Его можно будет вернуть позже."
    );

    if (!isConfirmed) {
      return;
    }

    try {
      const response = await apiFetch(`/api/flavors/${flavorId}/archive`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить вкус в архив");
      }

      const flavor = flavors.find((item) => item.id === flavorId);

      await addActionLog({
        action: "archive",
        flavor,
      });

      await refreshFlavors();
      showNotification("Вкус отправлен в архив", "success");
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось отправить вкус в архив", "error");
      setErrorText(error.message || "Не удалось отправить вкус в архив");
    }
  };

  const restoreFlavor = async (flavorId) => {
    try {
      const response = await apiFetch(`/api/flavors/${flavorId}/restore`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Не удалось вернуть вкус из архива");
      }

      const flavor = flavors.find((item) => item.id === flavorId);

      await addActionLog({
        action: "restore",
        flavor,
      });

      await refreshFlavors();
      showNotification("Вкус возвращён из архива", "success");
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось вернуть вкус из архива", "error");
      setErrorText(error.message || "Не удалось вернуть вкус из архива");
    }
  };


  const toggleLowStock = async (flavor) => {
    const currentValue = Boolean(flavor.lowStock || flavor.low_stock);

    try {
      const response = await apiFetch(`/api/flavors/${flavor.id}/low-stock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lowStock: !currentValue,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось изменить статус вкуса");
      }

      await addActionLog({
        action: currentValue ? "low_stock_off" : "low_stock_on",
        flavor,
      });

      await refreshFlavors();
      highlightFlavor(flavor.id);
      showNotification(
        currentValue
          ? "Статус “мало осталось” снят"
          : "Вкус отмечен как “мало осталось”",
        "success"
      );
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось изменить статус вкуса", "error");
      setErrorText(error.message || "Не удалось изменить статус вкуса");
    }
  };

  const handleSupplyChange = (event) => {
    const { name, value } = event.target;

    setSupplyForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const submitSupply = async (event) => {
    event.preventDefault();

    const payload = {
      brand: supplyForm.brand,
      name: supplyForm.name,
      weight: supplyForm.weight,
      quantity: Number(supplyForm.quantity),
      supplyDate: supplyForm.supplyDate || getTodayInputDate(),
      supplier: normalizeSupplierName(supplyForm.supplier),
      price: supplyForm.price === "" ? null : Number(supplyForm.price),
      tags: supplyForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      minStock: Number(supplyForm.minStock),
    };

    try {
      const response = await apiFetch("/api/flavors/supply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Не удалось добавить поставку");
      }

      const savedFlavor = await response.json();

      await addActionLog({
        action: "supply",
        flavor: savedFlavor,
        details: {
          weight: payload.weight,
          quantity: payload.quantity,
          suppliedAt: payload.supplyDate,
          supplier: payload.supplier,
          price: payload.price,
        },
      });

      await refreshFlavors();
      showNotification("Поставка добавлена и учтена на складе", "success");

      setSupplyForm({
        brand: "",
        name: "",
        weight: "",
        quantity: 1,
        supplyDate: getTodayInputDate(),
        supplier: "",
        price: "",
        tags: "",
        minStock: 1,
      });

      setIsSupplyFormOpen(false);
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось добавить поставку", "error");
      setErrorText(error.message || "Не удалось добавить поставку");
    }
  };

  const openEditForm = (flavor) => {
    setEditingFlavorId(flavor.id);

    scrollToPageTop();
    setEditForm({
      brand: flavor.brand || "",
      name: flavor.name || "",
      packsText: (flavor.packs || [])
        .map((pack) => `${pack.weight}: ${pack.quantity}`)
        .join("\\n"),
      tags: (flavor.tags || []).join(", "),
      minStock: flavor.minStock || 1,
    });
  };

  const closeEditForm = () => {
    setEditingFlavorId(null);

    setEditForm({
      brand: "",
      name: "",
      packsText: "",
      tags: "",
      minStock: 1,
    });
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;

    setEditForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const parsePacksText = (packsText) => {
    return packsText
      .split("\\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.lastIndexOf(":");

        if (separatorIndex === -1) {
          return null;
        }

        const weight = line.slice(0, separatorIndex).trim();
        const quantity = Number(line.slice(separatorIndex + 1).trim());

        if (!weight || Number.isNaN(quantity) || quantity < 0) {
          return null;
        }

        return {
          weight,
          quantity,
        };
      })
      .filter(Boolean);
  };

  const submitEdit = async (event) => {
    event.preventDefault();

    const packs = parsePacksText(editForm.packsText);

    if (packs.length === 0) {
      setErrorText("Добавьте хотя бы одну фасовку в формате 100 г: 2");
      return;
    }

    const payload = {
      brand: editForm.brand,
      name: editForm.name,
      packs,
      tags: editForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      minStock: Number(editForm.minStock),
    };

    try {
      const response = await apiFetch(`/api/flavors/${editingFlavorId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Не удалось сохранить изменения");
      }

      closeEditForm();
      await refreshFlavors();
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось сохранить изменения");
    }
  };

  const startSupplyForFlavor = (flavor) => {
    const firstPack = (flavor.packs || [])[0];

    setSupplyForm({
      brand: flavor.brand || "",
      name: flavor.name || "",
      weight: firstPack?.weight || "",
      quantity: 1,
      supplyDate: getTodayInputDate(),
      supplier: "",
      price: "",
      tags: (flavor.tags || []).join(", "),
      minStock: flavor.minStock || 1,
    });

    setIsSupplyFormOpen(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const brandSuggestions = Array.from(
    new Set(flavors.map((flavor) => flavor.brand).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const selectedBrand = supplyForm.brand.trim().toLowerCase();

  const flavorsForSelectedBrand = selectedBrand
    ? flavors.filter((flavor) =>
        flavor.brand.toLowerCase().includes(selectedBrand)
      )
    : flavors;

  const flavorSuggestions = Array.from(
    new Set(flavorsForSelectedBrand.map((flavor) => flavor.name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const weightSuggestions = Array.from(
    new Set(
      flavorsForSelectedBrand
        .flatMap((flavor) => flavor.packs || [])
        .map((pack) => pack.weight)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const parseActionDetails = (details) => {
    if (!details) {
      return {};
    }

    if (typeof details === "string") {
      try {
        return JSON.parse(details);
      } catch {
        return {};
      }
    }

    return details;
  };

  const isCancelledSupplyLog = (log) => {
    if (!log || log.action !== "supply") {
      return false;
    }

    const details = parseActionDetails(log.details);

    return Boolean(details.cancelled || details.cancelledAt);
  };

  const normalizeSupplierName = (value) => {
    const originalValue = String(value || "").trim();

    if (!originalValue) {
      return "";
    }

    const key = originalValue
      .normalize("NFKC")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[«»"']/g, "")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const keyWithoutLegalForm = key
      .replace(/^ооо\s+/, "")
      .replace(/^ип\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

    const compactKey = keyWithoutLegalForm.replace(/\s+/g, "");

    if (
      key === "ооо табачная дистрибуционная компания" ||
      key === "ооо тдк" ||
      keyWithoutLegalForm === "табачная дистрибуционная компания" ||
      keyWithoutLegalForm === "тдк"
    ) {
      return "OSHISHA";
    }

    if (key === "ооо омега" || keyWithoutLegalForm === "омега") {
      return "ЦТД";
    }

    if (key === "ооо биг смок" || keyWithoutLegalForm === "биг смок") {
      return "Биг Смок";
    }

    if (
      compactKey === "хукамаркет" ||
      compactKey === "хукаmarket" ||
      compactKey === "hookahmarket" ||
      compactKey === "hookamarket"
    ) {
      return "Хукамаркет";
    }

    return originalValue;
  };


  const supplierSuggestions = Array.from(
    new Set(
      actionLogs
        .map((log) => {
          const details = log.details || {};

          if (typeof details === "string") {
            try {
              return JSON.parse(details).supplier;
            } catch {
              return "";
            }
          }

          return details.supplier;
        })
        .map((supplier) => normalizeSupplierName(supplier))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const normalizePriceSuggestionValue = (value) => {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  };

  const priceSuggestions = Array.from(
    new Set(
      actionLogs
        .filter((log) => log.action === "supply" && !isCancelledSupplyLog(log))
        .map((log) => {
          const details = log.details || {};
          const parsedDetails =
            typeof details === "string"
              ? (() => {
                  try {
                    return JSON.parse(details);
                  } catch {
                    return {};
                  }
                })()
              : details;

          const logBrand = normalizePriceSuggestionValue(log.brand);
          const logName = normalizePriceSuggestionValue(log.name);
          const logWeight = normalizePriceSuggestionValue(parsedDetails.weight);

          const formBrand = normalizePriceSuggestionValue(supplyForm.brand);
          const formName = normalizePriceSuggestionValue(supplyForm.name);
          const formWeight = normalizePriceSuggestionValue(supplyForm.weight);

          const matchesBrand = !formBrand || logBrand === formBrand;
          const matchesName = !formName || logName === formName;
          const matchesWeight = !formWeight || logWeight === formWeight;

          if (!matchesBrand || !matchesName || !matchesWeight) {
            return "";
          }

          return parsedDetails.price;
        })
        .map((price) => Number(price || 0))
        .filter((price) => price > 0)
        .map((price) => String(price))
    )
  ).sort((a, b) => Number(b) - Number(a));

  const tagSuggestions = Array.from(
    new Set(
      flavors
        .flatMap((flavor) => flavor.tags || [])
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const addTagToSupplyForm = (tag) => {
    setSupplyForm((currentForm) => {
      const currentTags = currentForm.tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const tagAlreadyExists = currentTags.some(
        (item) => item.toLowerCase() === tag.toLowerCase()
      );

      if (tagAlreadyExists) {
        return currentForm;
      }

      return {
        ...currentForm,
        tags: [...currentTags, tag].join(", "),
      };
    });
  };


  const clearDatabase = async () => {
    const confirmation = window.prompt(
      "Это полностью очистит базу вкусов. Для подтверждения напиши: ОЧИСТИТЬ"
    );

    if (confirmation !== "ОЧИСТИТЬ") {
      return;
    }

    createBackupExcel("before-clear-database");
    await createFullBackupJson("before-clear-database");

    try {
      const response = await apiFetch("/api/admin/clear-database", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось очистить базу");
      }

      setFlavors([]);
      setActionLogs([]);
      setSearchText("");
      setSelectedTag("all");
      setStatusFilter("all");

      showNotification("База очищена. Теперь можно загружать историю закупа.", "success");
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось очистить базу");
    }
  };

  const exportToExcel = async () => {
    const XLSX = await loadXlsx();

    const rows = flavors.flatMap((flavor) => {
      const packs =
        Array.isArray(flavor.packs) && flavor.packs.length > 0
          ? flavor.packs
          : [{ weight: "", quantity: 0 }];

      return packs.map((pack) => ({
        "Бренд": flavor.brand || "",
        "Вкус": flavor.name || "",
        "Фасовка": pack.weight || "",
        "Количество": Number(pack.quantity || 0),
        "Закуплено": Number(pack.purchasedQuantity ?? pack.purchased_quantity ?? pack.quantity ?? 0),
        "Теги": (flavor.tags || []).join(", "),
        "Мало осталось": Boolean(flavor.lowStock || flavor.low_stock) ? "да" : "нет",
        "Не считать залежью": Boolean(
          flavor.excludedFromDeadstock || flavor.excluded_from_deadstock
        )
          ? "да"
          : "нет",
        "Архив": flavor.archived ? "да" : "нет",
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 34 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Склад");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `sklad-tabaka-${today}.xlsx`);
  };

  const exportPurchaseToExcel = async () => {
    const XLSX = await loadXlsx();

    if (purchaseFlavors.length === 0) {
      showNotification("Сейчас нет позиций, которые требуется закупить.", "info");
      return;
    }

    const rows = purchaseFlavors.map((flavor) => {
      const total = getTotalQuantity(flavor.packs || []);
      const status = getStatus(flavor).text;
      const specificTags = getSpecificTags(flavor);
      const analogs = getAnalogFlavors(flavor);
      const isPurchaseConfirmed = Boolean(
        flavor.purchaseConfirmed || flavor.purchase_confirmed
      );

      return {
        "Бренд": flavor.brand || "",
        "Вкус": flavor.name || "",
        "Фасовки": (flavor.packs || [])
          .map((pack) => `${pack.weight}: ${pack.quantity} пач.`)
          .join("\n"),
        "Остаток": total,
        "Статус": status,
        "Подтверждено": isPurchaseConfirmed ? "да" : "нет",
        "Специфичные теги": specificTags.map((tag) => `#${tag}`).join(", "),
        "Аналоги": analogs.length
          ? analogs
              .map(({ flavor: analog, matchedTags, totalQuantity }) => {
                return `${analog.brand} — ${analog.name} (${totalQuantity} пач.; ${matchedTags
                  .map((tag) => `#${tag}`)
                  .join(", ")})`;
              })
              .join("\n")
          : "нет",
        "Все теги": (flavor.tags || []).map((tag) => `#${tag}`).join(", "),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 30 },
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 30 },
      { wch: 55 },
      { wch: 45 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Закупка");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `zakupka-tabaka-${today}.xlsx`);
  };


  const exportHistoryToExcel = async () => {
    const XLSX = await loadXlsx();

    const historyRows = actionLogs.map((log) => {
      const details = parseActionDetails(log.details);
      const flavorId = log.flavorId || log.flavor_id;
      const flavorFromStock = flavors.find(
        (item) => String(item.id) === String(flavorId)
      );

      const brand =
        log.brand ||
        log.flavorBrand ||
        log.flavor_brand ||
        flavorFromStock?.brand ||
        "";

      const name =
        log.name ||
        log.flavorName ||
        log.flavor_name ||
        flavorFromStock?.name ||
        "";

      const actionTitle = getHistoryActionTitle(log.action, log);
      const createdAt = log.createdAt || log.created_at || log.date || "";

      return {
        "Дата": createdAt ? new Date(createdAt).toLocaleString("ru-RU") : "",
        "Действие": actionTitle,
        "Бренд": brand,
        "Вкус": name,
        "Фасовка": details.weight || "",
        "Количество": details.quantity || "",
        "Цена": details.price || "",
        "Поставщик": details.supplier || "",
        "Источник": details.source || "",
        "Статус": isCancelledSupplyLog(log) ? "Отменена" : "Активна",
        "Детали": formatActionDetails(log),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(historyRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "История");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `istoriya-tabaka-${today}.xlsx`);
  };

  const exportAnalyticsToExcel = async () => {
    const XLSX = await loadXlsx();

    const workbook = XLSX.utils.book_new();

    const brandRows = purchaseFinanceData.byBrand.map((item) => ({
      "Бренд": item.name,
      "Сумма закупки": item.total,
      "Пачек": item.quantity,
      "Вес": formatWeight(item.grams),
      "Средняя цена за грамм": item.averagePricePerGram
        ? Number(item.averagePricePerGram.toFixed(2))
        : "",
      "Поставок": item.supplyCount,
    }));

    const supplierRows = purchaseFinanceData.bySupplier.map((item) => ({
      "Поставщик": item.name,
      "Сумма закупки": item.total,
      "Пачек": item.quantity,
      "Вес": formatWeight(item.grams),
      "Средняя цена за грамм": item.averagePricePerGram
        ? Number(item.averagePricePerGram.toFixed(2))
        : "",
      "Поставок": item.supplyCount,
    }));

    const priceChangeRows = [
      ...purchaseFinanceData.priceIncreases,
      ...purchaseFinanceData.priceDecreases,
    ].map((row) => ({
      "Бренд": row.brand,
      "Вкус": row.name,
      "Фасовка": row.weight,
      "Дата поставки": row.suppliedAt
        ? new Date(row.suppliedAt).toLocaleDateString("ru-RU")
        : "",
      "Предыдущая цена": row.priceChange?.previousPrice || "",
      "Новая цена": row.price,
      "Разница": row.priceChange?.difference || "",
      "Изменение %": row.priceChange?.percent
        ? Number(row.priceChange.percent.toFixed(2))
        : "",
      "Направление": row.priceChange?.direction === "up"
        ? "подорожало"
        : row.priceChange?.direction === "down"
          ? "подешевело"
          : "без изменений",
    }));

    const purchaseRows = purchaseFinanceData.rows.map((row) => ({
      "Дата поставки": row.suppliedAt
        ? new Date(row.suppliedAt).toLocaleDateString("ru-RU")
        : "",
      "Бренд": row.brand,
      "Вкус": row.name,
      "Фасовка": row.weight,
      "Поставщик": row.supplier,
      "Количество": row.quantity,
      "Цена за пачку": row.price,
      "Сумма": row.total,
      "Изменение цены": row.priceChange
        ? `${Math.round(row.priceChange.difference)} ₽ / ${Math.round(
            row.priceChange.percent
          )}%`
        : "первая цена",
    }));

    const dataQualityRows = visibleDataQualityIssues.map((issue) => ({
      "Проблема": issue.title,
      "Количество": issue.items.length,
    }));

    const sheets = [
      ["Финансы по брендам", brandRows],
      ["Финансы по поставщикам", supplierRows],
      ["Изменение цен", priceChangeRows],
      ["Закупки с ценой", purchaseRows],
      ["Проблемные данные", dataQualityRows],
    ];

    sheets.forEach(([sheetName, rows]) => {
      const worksheet = XLSX.utils.json_to_sheet(
        rows.length > 0 ? rows : [{ "Нет данных": "" }]
      );

      worksheet["!cols"] = Array.from({ length: 10 }, () => ({ wch: 24 }));

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `analitika-tabaka-${today}.xlsx`);
  };


  const openExportChoice = () => {
    setActiveChoiceModal("export");
  };

  const startExcelImport = (mode) => {
    setImportMode(mode);
    document.getElementById("import-excel-input")?.click();
  };


  const downloadImportTemplate = async () => {
    const XLSX = await loadXlsx();

    const rows = [
      {
        "Бренд": "Musthave",
        "Вкус": "Ванильный крем",
        "Фасовка": "100 г",
        "Количество": 2,
        "Дата поставки": getTodayInputDate(),
        "Поставщик": "Опт РФ",
        "Цена за пачку": 850,
        "Теги": "десерт, сливочный",
        "Мало осталось": "нет",
        "Не считать залежью": "нет",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 30 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 },
      { wch: 16 },
      { wch: 34 },
      { wch: 18 },
      { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Импорт закупки");
    XLSX.writeFile(workbook, "shablon-importa-zakupki.xlsx");
  };


  const openImportChoice = () => {
    setActiveChoiceModal("import");
  };

  const downloadJsonFile = (filename, data) => {
    const jsonText = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonText], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const createFullBackupJson = async (reason = "manual") => {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(":", "-");

    const generatedAt = new Date().toISOString();

    const backup = {
      app: "hookah-tobacco-inventory",
      generatedAt,
      reason,
      flavors,
      actionLogs,
      aliases,
    };

    downloadJsonFile(`backup-full-${reason}-${timestamp}.json`, backup);

    try {
      await addActionLog({
        action: "backup_created",
        details: {
          reason,
          flavorsCount: flavors.length,
          actionLogsCount: actionLogs.length,
          createdAt: generatedAt,
        },
      });

      await loadActionLogs();
    } catch (error) {
      console.error("Backup log error:", error);
    }

    showNotification("JSON backup скачан", "info");
  };

  const restoreFromJsonBackup = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsLoading(true);
      setErrorText("");

      const fileText = await file.text();
      const backup = JSON.parse(fileText);

      const flavorsCount = Array.isArray(backup.flavors)
        ? backup.flavors.length
        : 0;

      const actionLogsCount = Array.isArray(backup.actionLogs)
        ? backup.actionLogs.length
        : 0;

      if (!Array.isArray(backup.flavors)) {
        throw new Error("В JSON backup не найден массив flavors");
      }

      const confirmationText = window.prompt(
        `Восстановление заменит текущую базу. В backup: ${flavorsCount} вкусов, ${actionLogsCount} действий. Чтобы продолжить, введите: ВОССТАНОВИТЬ`
      );

      if (confirmationText !== "ВОССТАНОВИТЬ") {
        showNotification("Восстановление отменено", "info");
        return;
      }

      await createFullBackupJson("before-restore");

      const response = await apiFetch("/api/admin/restore-backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(backup),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.message || "Не удалось восстановить backup");
      }

      await addActionLog({
        action: "backup_restored",
        details: {
          fileName: file.name,
          restoredFlavors: result.restoredFlavors || 0,
          restoredActionLogs: result.restoredActionLogs || 0,
        },
      });

      await refreshFlavors();
      await loadActionLogs();

      setSearchText("");
      setSelectedTag("all");
      setStatusFilter("all");
      setOpenBrandName("");
      setOpenFlavorId(null);
      setCurrentView("inventory");

      showNotification(
        `Backup восстановлен: ${result.restoredFlavors || 0} вкусов, ${result.restoredActionLogs || 0} действий`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось восстановить JSON backup", "error");
      setErrorText(error.message || "Не удалось восстановить JSON backup");
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  };

  const createBackupExcel = async (reason = "backup") => {
    const XLSX = await loadXlsx();

    if (!Array.isArray(flavors) || flavors.length === 0) {
      return;
    }

    const rows = flavors.flatMap((flavor) => {
      const packs =
        Array.isArray(flavor.packs) && flavor.packs.length > 0
          ? flavor.packs
          : [{ weight: "", quantity: 0 }];

      return packs.map((pack) => ({
        "Бренд": flavor.brand || "",
        "Вкус": flavor.name || "",
        "Фасовка": pack.weight || "",
        "Количество": Number(pack.quantity || 0),
        "Закуплено": Number(
          pack.purchasedQuantity ??
            pack.purchased_quantity ??
            pack.quantity ??
            0
        ),
        "Теги": (flavor.tags || []).join(", "),
        "Мало осталось": Boolean(flavor.lowStock || flavor.low_stock)
          ? "да"
          : "нет",
        "Не считать залежью": Boolean(
          flavor.excludedFromDeadstock || flavor.excluded_from_deadstock
        )
          ? "да"
          : "нет",
        "Закупка подтверждена": Boolean(
          flavor.purchaseConfirmed || flavor.purchase_confirmed
        )
          ? "да"
          : "нет",
        "Архив": flavor.archived ? "да" : "нет",
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 30 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 42 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Backup");

    const timestamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(":", "-");

    XLSX.writeFile(workbook, `backup-${reason}-${timestamp}.xlsx`);
    showNotification("Backup скачан", "info");
  };

  const getExcelValue = (row, names) => {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
        return row[name];
      }
    }

    return "";
  };

  const cleanImportedFlavorName = (value) => {
    return String(value || "")
      .replace(/кальянная\s+смесь/gi, "")
      .replace(/табак\s+для\s+кальяна/gi, "")
      .replace(/смесь\s+для\s+кальяна/gi, "")
      .replace(/с\s+ароматом/gi, "")
      .replace(/со\s+вкусом/gi, "")
      .replace(/аромат/gi, "")
      .replace(/[«»"]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[-–—:,.;\s]+|[-–—:,.;\s]+$/g, "")
      .trim();
  };

  const parseExcelNumber = (value, fallback = 0) => {
    const normalizedValue = String(value).replace(",", ".").trim();
    const number = Number(normalizedValue);

    return Number.isFinite(number) ? number : fallback;
  };

  const parseExcelBoolean = (value) => {
    const normalizedValue = String(value).trim().toLowerCase();

    return ["да", "true", "1", "yes", "архив"].includes(normalizedValue);
  };

  const parseExcelDate = (value) => {
    if (value === undefined || value === null || value === "") {
      return "";
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);

      return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    }

    const cleanValue = String(value).trim();

    if (!cleanValue) {
      return "";
    }

    const date = new Date(cleanValue);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }

    const dateParts = cleanValue.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);

    if (dateParts) {
      const [, day, month, year] = dateParts;
      const fullYear = year.length === 2 ? `20${year}` : year;

      return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    return cleanValue;
  };

  const importFromExcel = async (event) => {
    const XLSX = await loadXlsx();

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsLoading(true);
      setErrorText("");

      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
      });

      const rows = rawRows
        .map((row) => {
          const brand = String(
            getExcelValue(row, ["Бренд", "brand", "Brand"])
          ).trim();

          const rawName = String(
            getExcelValue(row, [
              "Вкус",
              "Название",
              "Название товара",
              "Товар",
              "name",
              "Name",
            ])
          ).trim();

          const name = cleanImportedFlavorName(rawName);

          const weight = String(
            getExcelValue(row, ["Фасовка", "Вес", "weight", "Weight"])
          ).trim();

          const quantity = parseExcelNumber(
            getExcelValue(row, [
              "Количество",
              "Кол-во",
              "Кол-во.",
              "Остаток",
              "quantity",
              "Quantity",
            ]),
            0
          );

          const tags = String(
            getExcelValue(row, ["Теги", "tags", "Tags"])
          ).trim();

          const supplyDate = parseExcelDate(
            getExcelValue(row, [
              "Дата поставки",
              "Дата",
              "date",
              "Date",
              "supplyDate",
              "Supply date",
            ])
          );

          const supplier = normalizeSupplierName(
            String(
              getExcelValue(row, [
                "Поставщик",
                "supplier",
                "Supplier",
              ])
            ).trim()
          );

          const price = parseExcelNumber(
            getExcelValue(row, [
              "Цена",
              "Цена за пачку",
              "price",
              "Price",
            ]),
            0
          );

          return {
            brand,
            name,
            originalName: rawName,
            weight,
            quantity,
            tags,
            supplyDate,
            supplier,
            price,
          };
        })
        .filter((row) => row.brand && row.name && row.weight);

      if (rows.length === 0) {
        throw new Error(
          "В Excel не найдено строк с обязательными колонками: Бренд, Вкус, Фасовка"
        );
      }

      setPendingImportRows(rows);
      setPendingImportFileName(file.name || "Excel-файл");
      setShowOnlyImportProblems(false);
      setIsImportPreviewOpen(true);
      setCurrentView("inventory");
      setErrorText("");
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось импортировать Excel");
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  };

  const confirmImportPreview = async () => {
    if (pendingImportRows.length === 0) {
      return;
    }

    if (importMode !== "supply") {
      showNotification("Доступен только импорт закупки.", "error");
      return;
    }

    const hasInvalidSupplyQuantity = pendingImportRows.some((row) => {
      const quantity = Number(row.quantity || 0);
      return !Number.isFinite(quantity) || quantity <= 0;
    });

    if (hasInvalidSupplyQuantity) {
      showNotification(
        "В импорте закупки есть строки с количеством 0. Исправь файл или убери эти строки.",
        "error"
      );
      setShowOnlyImportProblems(true);
      return;
    }

    if (importPreviewProblemCount > 0) {
      const isConfirmed = window.confirm(
        `В импорте есть проблемные строки: ${importPreviewProblemCount}. Всё равно продолжить?`
      );

      if (!isConfirmed) {
        setShowOnlyImportProblems(true);
        return;
      }
    }

    const confirmationText = window.prompt(
      `Импорт закупки изменит данные в базе. Строк к импорту: ${pendingImportRows.length}. Чтобы продолжить, введите: ИМПОРТ`
    );

    if (confirmationText !== "ИМПОРТ") {
      showNotification("Импорт отменён", "info");
      return;
    }

    try {
      setIsLoading(true);
      setErrorText("");

      setImportProgress({
        stage: "Подготовка backup",
        current: 0,
        total: pendingImportRows.length,
        currentItem: pendingImportFileName,
      });

      await createBackupExcel("before-import");
      await createFullBackupJson("before-import");

      const result = { importedCount: 0 };

      for (let index = 0; index < pendingImportRows.length; index += 1) {
        const row = pendingImportRows[index];

        setImportProgress({
          stage: "Импортируем закупку",
          current: index,
          total: pendingImportRows.length,
          currentItem: `${row.brand} — ${row.name}`,
        });

        const response = await apiFetch("/api/flavors/supply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand: row.brand,
            name: row.name,
            weight: row.weight,
            quantity: row.quantity,
            supplyDate: row.supplyDate || getTodayInputDate(),
            supplier: row.supplier || "",
            price: row.price || null,
            tags: row.tags,
            minStock: 0,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(errorText || "Не удалось импортировать поставку");
        }

        const savedFlavor = await response.json();

        await addActionLog({
          action: "supply",
          flavor: savedFlavor,
          details: {
            weight: row.weight,
            quantity: row.quantity,
            suppliedAt: row.supplyDate || getTodayInputDate(),
            supplier: row.supplier || "",
            price: row.price || null,
            source: "Импорт закупки",
          },
          refreshLogs: false,
        });

        result.importedCount += 1;

        setImportProgress({
          stage: "Импортируем закупку",
          current: index + 1,
          total: pendingImportRows.length,
          currentItem: `${row.brand} — ${row.name}`,
        });
      }

      await refreshFlavors();
      await loadActionLogs();

      setPendingImportRows([]);
      setPendingImportFileName("");
      setShowOnlyImportProblems(false);
      setIsImportPreviewOpen(false);

      setSearchText("");
      setSelectedTag("all");
      setStatusFilter("all");
      setCurrentView("inventory");

      showNotification(
        `Закупка импортирована. Обновлено вкусов: ${result.importedCount}`,
        "success"
      );
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось импортировать Excel");
      showNotification(error.message || "Не удалось импортировать Excel", "error");
    } finally {
      setImportProgress(null);
      setIsLoading(false);
    }
  };


  const cancelImportPreview = () => {
    setPendingImportRows([]);
    setPendingImportFileName("");
    setShowOnlyImportProblems(false);
    setIsImportPreviewOpen(false);
  };

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const applyInventoryQuickFilter = (nextStatus, nextTag = "all") => {
  setStatusFilter(nextStatus);
  setSelectedTag(nextTag);
  setSearchText("");
  setOpenBrandName("");
  setOpenFlavorId(null);
  clearSelectedFlavors();
};
  const [selectedTag, setSelectedTag] = useState("all");
  const [openBrandName, setOpenBrandName] = useState("");
  const [openFlavorId, setOpenFlavorId] = useState(null);
  const [openFlavorHistoryIds, setOpenFlavorHistoryIds] = useState([]);
  const [highlightedFlavorId, setHighlightedFlavorId] = useState(null);
  const [openAnalyticsBrandName, setOpenAnalyticsBrandName] = useState("");
  const [openAnalyticsFlavorId, setOpenAnalyticsFlavorId] = useState(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isFinanceHistoryOpen, setIsFinanceHistoryOpen] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("all");
  const [openDataQualityIssue, setOpenDataQualityIssue] = useState(null);
  const [activeChoiceModal, setActiveChoiceModal] = useState(null);
  const [importMode, setImportMode] = useState("supply");
  const [editingSupplyLog, setEditingSupplyLog] = useState(null);
  const [editingSupplyForm, setEditingSupplyForm] = useState({
    suppliedAt: "",
    supplier: "",
    price: "",
    quantity: "",
    weight: "",
  });
  const [selectedFlavorIds, setSelectedFlavorIds] = useState([]);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState([]);
  const [pendingImportFileName, setPendingImportFileName] = useState("");
  const [showOnlyImportProblems, setShowOnlyImportProblems] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  const quickTags = [
    "ягоды",
    "фрукт",
    "алкоголь",
    "десерт",
    "специи",
    "цитрус",
    "напиток",
    "гастрономия",
    "травы",
    "цветы",
    "чай",
    "орехи",
  ];

  const normalizeHistoryValue = (value) => {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  };

  const toggleFlavorHistory = (flavorId) => {
    setOpenFlavorHistoryIds((currentIds) => {
      if (currentIds.includes(flavorId)) {
        return currentIds.filter((id) => id !== flavorId);
      }

      return [...currentIds, flavorId];
    });
  };

  const getFlavorHistory = (flavor) => {
    const flavorBrand = normalizeHistoryValue(flavor.brand);
    const flavorName = normalizeHistoryValue(flavor.name);

    return actionLogs
      .filter((log) => {
        const details = parseActionDetails(log.details);

        const logFlavorId =
          log.flavorId ||
          log.flavor_id ||
          details.flavorId ||
          details.flavor_id ||
          details.id ||
          details.flavor?.id ||
          details.item?.id;

        if (logFlavorId && String(logFlavorId) === String(flavor.id)) {
          return true;
        }

        const logBrand =
          log.brand ||
          details.brand ||
          details.flavorBrand ||
          details.flavor?.brand ||
          details.item?.brand ||
          details.payload?.brand;

        const logName =
          log.name ||
          details.name ||
          details.flavorName ||
          details.flavor?.name ||
          details.item?.name ||
          details.payload?.name;

        return (
          normalizeHistoryValue(logBrand) === flavorBrand &&
          normalizeHistoryValue(logName) === flavorName
        );
      })
      .slice(0, 12);
  };

  const getActionEffectiveDate = (log) => {
    const details = parseActionDetails(log.details);

    if (log.action === "supply" && details.suppliedAt) {
      return details.suppliedAt;
    }

    return log.createdAt || log.created_at || null;
  };

  const formatHistoryDate = (log) => {
    const rawDate = getActionEffectiveDate(log);

    if (!rawDate) {
      return "Дата не указана";
    }

    return new Date(rawDate).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getHistoryActionTitle = (action, log = null) => {
    if (action === "supply" && isCancelledSupplyLog(log)) {
      return "Поставка отменена";
    }

    if (action === "backup_created") {
      return "Backup создан";
    }

    if (action === "backup_restored") {
      return "Backup восстановлен";
    }

const titles = {
      pack_plus: "Добавлена пачка",
      pack_minus: "Списана пачка",
      clear: "Вкус выбит",
      archive: "Вкус отправлен в архив",
      restore: "Вкус возвращён из архива",
      low_stock_on: "Отмечено: мало осталось",
      low_stock_off: "Снята отметка: мало осталось",
      purchase_confirmed_on: "Закупка подтверждена",
      purchase_confirmed_off: "Закупка снята",
      supply: "Поставка",
      import_excel: "Импорт Excel",
      import_inventory: "Старый импорт данных",
      merge_duplicates: "Объединение дублей",
      merge_tags: "Объединение тегов",
      bulk_action: "Массовое действие",
      alias_create: "Создан алиас",
      alias_delete: "Удалён алиас",
      deadstock_excluded_on: "Исключён из залежей",
      deadstock_excluded_off: "Возвращён в залежи",
    };

    return titles[action] || action || "Действие";
  };

  const getHistoryActionMeta = (log) => {
    const details = parseActionDetails(log.details);
    const pieces = [];

    const weight =
      details.packWeight ||
      details.weight ||
      details.pack?.weight ||
      details.payload?.weight;

    const delta =
      details.delta ||
      details.quantity ||
      details.packQuantity ||
      details.payload?.quantity;

    if (weight) {
      pieces.push(weight);
    }

    if (delta && ["pack_plus", "pack_minus", "supply"].includes(log.action)) {
      const numberDelta = Number(delta);

      if (!Number.isNaN(numberDelta)) {
        pieces.push(`${numberDelta > 0 ? "+" : ""}${numberDelta} пач.`);
      }
    }

    if (log.action === "supply" && details.suppliedAt) {
      pieces.push(`дата поставки: ${new Date(details.suppliedAt).toLocaleDateString("ru-RU")}`);
    }

    if (log.action === "supply" && details.supplier) {
      pieces.push(`поставщик: ${details.supplier}`);
    }

    if (log.action === "supply" && details.price !== null && details.price !== undefined && details.price !== "") {
      pieces.push(`цена: ${Number(details.price).toLocaleString("ru-RU")} ₽`);
    }

    if (details.reason) {
      pieces.push(details.reason);
    }

    return pieces.join(" • ");
  };

  const getDaysSinceDate = (dateValue) => {
    if (!dateValue) {
      return null;
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const diffMs = Date.now() - date.getTime();

    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const getFlavorMovementInfo = (flavor) => {
    const historyItems = getFlavorHistory(flavor);

    const supplyActions = new Set([
      "supply",
      "pack_plus",
      "import_excel",
      "import_inventory",
    ]);
    const writeOffActions = new Set(["pack_minus", "clear"]);

    const supplyLogs = historyItems.filter((log) =>
      supplyActions.has(log.action) && !isCancelledSupplyLog(log)
    );

    const writeOffLogs = historyItems.filter((log) =>
      writeOffActions.has(log.action)
    );

    const lastSupplyLog = supplyLogs[0] || null;
    const lastWriteOffLog = writeOffLogs[0] || null;

    const lastSupplyDate = lastSupplyLog
      ? getActionEffectiveDate(lastSupplyLog)
      : null;

    const lastWriteOffDate = lastWriteOffLog
      ? getActionEffectiveDate(lastWriteOffLog)
      : null;

    const daysSinceSupply = getDaysSinceDate(lastSupplyDate);
    const daysSinceWriteOff = getDaysSinceDate(lastWriteOffDate);

    return {
      historyItems,
      lastSupplyLog,
      lastWriteOffLog,
      lastSupplyDate,
      lastWriteOffDate,
      daysSinceSupply,
      daysSinceWriteOff,
      hasMovements: historyItems.length > 0,
      hasSupply: supplyLogs.length > 0,
      hasWriteOff: writeOffLogs.length > 0,
    };
  };

  const getDeadstockReasons = (flavor) => {
    const movement = getFlavorMovementInfo(flavor);
    const totalQuantity = getTotalQuantity(flavor);
    const purchasedQuantity = getTotalPurchasedQuantity(flavor);
    const usedQuantity = Math.max(0, purchasedQuantity - totalQuantity);
    const reasons = [];

    if (
      flavor.archived ||
      totalQuantity <= 0 ||
      flavor.excludedFromDeadstock ||
      flavor.excluded_from_deadstock
    ) {
      return [];
    }

    if (!movement.hasMovements) {
      reasons.push("Есть остаток, но нет записей о движениях");
    }

    if (!movement.hasWriteOff && purchasedQuantity > 0) {
      reasons.push("Закупался, но ещё не списывался");
    }

    if (
      movement.daysSinceWriteOff !== null &&
      movement.daysSinceWriteOff >= 30
    ) {
      reasons.push(`Не списывался ${movement.daysSinceWriteOff} дн.`);
    }

    if (
      movement.daysSinceSupply !== null &&
      movement.daysSinceSupply >= 45
    ) {
      reasons.push(`Не закупался ${movement.daysSinceSupply} дн.`);
    }

    if (purchasedQuantity > 0 && usedQuantity === 0) {
      reasons.push("Остаток не уменьшался с момента закупки");
    }

    if (purchasedQuantity > 0) {
      const usedShare = usedQuantity / purchasedQuantity;

      if (usedShare > 0 && usedShare <= 0.15 && totalQuantity >= 2) {
        reasons.push("Слабое использование: списано менее 15%");
      }
    }

    return reasons;
  };

  const getDeadstockScore = (flavor) => {
    const reasons = getDeadstockReasons(flavor);
    const movement = getFlavorMovementInfo(flavor);

    let score = reasons.length * 10;

    if (movement.daysSinceWriteOff !== null) {
      score += Math.min(40, movement.daysSinceWriteOff);
    }

    if (movement.daysSinceSupply !== null) {
      score += Math.min(25, Math.floor(movement.daysSinceSupply / 2));
    }

    return score;
  };

  const renderFlavorHistory = (flavor) => {
    const historyItems = getFlavorHistory(flavor);
    const isHistoryOpen = openFlavorHistoryIds.includes(flavor.id);

    return (
      <div className="flavor-history-block">
        <button
          className="flavor-history-toggle"
          type="button"
          onClick={() => toggleFlavorHistory(flavor.id)}
        >
          <span>История вкуса</span>
          <span>
            {historyItems.length > 0
              ? `${historyItems.length} действий`
              : "нет записей"}
            {" "}
            {isHistoryOpen ? "▲" : "▼"}
          </span>
        </button>

        {isHistoryOpen && (
          <div className="flavor-history-list">
            {historyItems.length === 0 ? (
              <p className="flavor-history-empty">
                По этому вкусу пока нет записей в истории.
              </p>
            ) : (
              historyItems.map((log) => (
                <div className="flavor-history-item" key={log.id}>
                  <div>
                    <strong>{getHistoryActionTitle(log.action, log)}</strong>
                    {getHistoryActionMeta(log) && (
                      <span>{getHistoryActionMeta(log)}</span>
                    )}

                    {!isDemoMode && log.action === "supply" && !isCancelledSupplyLog(log) && (
                      <button
                        className="secondary-button small"
                        type="button"
                        onClick={() => editSupplyLog(log)}
                      >
                        Исправить
                      </button>
                    )}
                  </div>

                  <time>{formatHistoryDate(log)}</time>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const normalizeSearchValue = (value) => {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const getSearchVariants = (value, type) => {
    const cleanValue = String(value || "").trim();

    if (!cleanValue) {
      return [];
    }

    const variants = new Set([
      cleanValue,
      normalizeSearchValue(cleanValue),
    ]);

    aliases
      .filter((alias) => alias.type === type)
      .forEach((alias) => {
        const aliasValue = normalizeSearchValue(alias.alias);
        const canonicalValue = normalizeSearchValue(alias.canonical);
        const currentValue = normalizeSearchValue(cleanValue);

        if (currentValue === aliasValue || currentValue === canonicalValue) {
          variants.add(alias.alias);
          variants.add(alias.canonical);
          variants.add(aliasValue);
          variants.add(canonicalValue);
        }
      });

    return Array.from(variants)
      .map(normalizeSearchValue)
      .filter(Boolean);
  };

  const filteredFlavors = flavors.filter((flavor) => {
    const normalizedSearch = normalizeSearchValue(searchText);

    const searchParts = normalizedSearch
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean);

    const brandVariants = getSearchVariants(flavor.brand, "brand");
    const flavorVariants = getSearchVariants(flavor.name, "flavor");

    const searchableText = normalizeSearchValue(
      [
        flavor.brand,
        flavor.name,
        ...brandVariants,
        ...flavorVariants,
        ...(flavor.tags || []),
        ...(flavor.packs || []).map((pack) => pack.weight),
      ].join(" ")
    );

    const matchesSearch =
      searchParts.length === 0 ||
      searchParts.every((part) => searchableText.includes(part));

    const status = getStatus(flavor).text;

    const matchesStatus =
      statusFilter === "all" ? !flavor.archived : status === statusFilter;

    const flavorTags = Array.isArray(flavor.tags) ? flavor.tags : [];

    const matchesTag =
      selectedTag === "all" ||
      (selectedTag === "__NO_TAGS__" && flavorTags.length === 0) ||
      flavorTags.some(
        (tag) =>
          normalizeSearchValue(tag) === normalizeSearchValue(selectedTag)
      );

    return matchesSearch && matchesStatus && matchesTag;
  });


  const normalizeDuplicateKey = (value) => {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[’‘`´ʼ]/g, "'")
      .replace(/[‐-‒–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  };

  const duplicateGroups = Array.from(
    flavors.reduce((groups, flavor) => {
      const brand = normalizeDuplicateKey(flavor.brand);
      const name = normalizeDuplicateKey(flavor.name);

      if (!brand || !name) {
        return groups;
      }

      const key = `${brand}::${name}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(flavor);

      return groups;
    }, new Map())
  )
    .map(([key, items]) => ({
      key,
      items: items.sort((a, b) => a.id - b.id),
    }))
    .filter((group) => group.items.length > 1)
    .sort((a, b) =>
      `${a.items[0].brand} ${a.items[0].name}`.localeCompare(
        `${b.items[0].brand} ${b.items[0].name}`,
        "ru"
      )
    );


  const brandDuplicateGroups = Array.from(
    flavors.reduce((groups, flavor) => {
      const brandKey = normalizeDuplicateKey(flavor.brand);
      const brandLabel = String(flavor.brand || "").trim();

      if (!brandKey || !brandLabel) {
        return groups;
      }

      if (!groups.has(brandKey)) {
        groups.set(brandKey, {
          key: brandKey,
          variants: new Map(),
          flavors: [],
        });
      }

      const group = groups.get(brandKey);

      group.variants.set(
        brandLabel,
        (group.variants.get(brandLabel) || 0) + 1
      );

      group.flavors.push(flavor);

      return groups;
    }, new Map()).values()
  )
    .map((group) => ({
      ...group,
      variants: Array.from(group.variants.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru")),
    }))
    .filter((group) => group.variants.length > 1)
    .sort(
      (a, b) =>
        b.flavors.length - a.flavors.length ||
        a.key.localeCompare(b.key, "ru")
    );

  const importPreviewExistingCount = pendingImportRows.filter((row) => {
    const rowBrand = normalizeDuplicateKey(row.brand);
    const rowName = normalizeDuplicateKey(row.name);

    return flavors.some(
      (flavor) =>
        normalizeDuplicateKey(flavor.brand) === rowBrand &&
        normalizeDuplicateKey(flavor.name) === rowName
    );
  }).length;

  const importPreviewNewCount =
    pendingImportRows.length - importPreviewExistingCount;

  const getImportRowWarnings = (row) => {
    const warnings = [];

    const quantity = Number(row.quantity || 0);
    const price = Number(row.price || 0);

    if (importMode === "supply" && (!Number.isFinite(quantity) || quantity <= 0)) {
      warnings.push("количество 0");
    }

    if (
      row.originalName &&
      normalizeDuplicateKey(row.originalName) !== normalizeDuplicateKey(row.name)
    ) {
      warnings.push("название очищено");
    }

    if (importMode === "supply") {
      if (!row.supplyDate) {
        warnings.push("нет даты");
      }

      if (!String(row.supplier || "").trim()) {
        warnings.push("нет поставщика");
      }

      if (!Number.isFinite(price) || price <= 0) {
        warnings.push("нет цены");
      }
    }

    const alreadyExists = flavors.some((flavor) => {
      return (
        normalizeDuplicateKey(flavor.brand) === normalizeDuplicateKey(row.brand) &&
        normalizeDuplicateKey(flavor.name) === normalizeDuplicateKey(row.name)
      );
    });

    warnings.push(alreadyExists ? "уже есть в базе" : "новая позиция");

    return warnings;
  };

  const importPreviewRowsWithWarnings = pendingImportRows.map((row) => ({
    ...row,
    warnings: getImportRowWarnings(row),
  }));

  const importProblemWarningLabels = [
    "количество 0",
    "нет даты",
    "нет поставщика",
    "нет цены",
  ];

  const hasImportRowProblems = (row) => {
    return row.warnings.some((warning) =>
      importProblemWarningLabels.includes(warning)
    );
  };

  const importPreviewProblemCount =
    importPreviewRowsWithWarnings.filter(hasImportRowProblems).length;

  const importPreviewVisibleRows = showOnlyImportProblems
    ? importPreviewRowsWithWarnings.filter(hasImportRowProblems)
    : importPreviewRowsWithWarnings;

  const groupedFlavorsByBrand = Array.from(
    filteredFlavors.reduce((groups, flavor) => {
      const brand = flavor.brand || "Без бренда";

      if (!groups.has(brand)) {
        groups.set(brand, []);
      }

      groups.get(brand).push(flavor);

      return groups;
    }, new Map())
  )
    .map(([brand, items]) => {
      const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name, "ru"));

      const stockSummary = sortedItems.reduce(
        (summary, flavor) => {
          const quantity = getTotalQuantity(flavor.packs || []);
          const isLowStock = Boolean(flavor.lowStock || flavor.low_stock);

          if (quantity === 0) {
            return {
              ...summary,
              absentCount: summary.absentCount + 1,
            };
          }

          if (isLowStock) {
            return {
              ...summary,
              lowStockCount: summary.lowStockCount + 1,
              totalPacks: summary.totalPacks + quantity,
            };
          }

          return {
            ...summary,
            inStockCount: summary.inStockCount + 1,
            totalPacks: summary.totalPacks + quantity,
          };
        },
        {
          inStockCount: 0,
          lowStockCount: 0,
          absentCount: 0,
          totalPacks: 0,
        }
      );

      return {
        brand,
        items: sortedItems,
        ...stockSummary,
      };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand, "ru"));


  const normalizeTagKey = (value) => {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  };

  const mainTasteTags = [
    "ягоды",
    "фрукт",
    "алкоголь",
    "десерт",
    "специи",
    "цитрус",
    "напиток",
    "гастрономия",
    "травы",
    "цветы",
    "чай",
    "орехи",
  ];

  const mainTasteTagKeys = new Set(mainTasteTags.map((tag) => normalizeTagKey(tag)));

  const isMainTasteTag = (tag) => {
    return mainTasteTagKeys.has(normalizeTagKey(tag));
  };

  const tagRows = Array.from(
    flavors.reduce((map, flavor) => {
      const tags = flavor.tags || [];
      const quantity = getTotalQuantity(flavor.packs || []);
      const isArchived = Boolean(flavor.archived);

      tags.forEach((tag) => {
        const cleanTag = String(tag).trim();

        if (!cleanTag) {
          return;
        }

        const previous = map.get(cleanTag) || {
          tag: cleanTag,
          flavorCount: 0,
          activeFlavorCount: 0,
          archivedFlavorCount: 0,
          totalPacks: 0,
        };

        map.set(cleanTag, {
          ...previous,
          flavorCount: previous.flavorCount + 1,
          activeFlavorCount:
            previous.activeFlavorCount + (isArchived ? 0 : 1),
          archivedFlavorCount:
            previous.archivedFlavorCount + (isArchived ? 1 : 0),
          totalPacks: previous.totalPacks + quantity,
        });
      });

      return map;
    }, new Map())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.flavorCount - a.flavorCount || a.tag.localeCompare(b.tag, "ru"));

  const mainTasteTagRows = tagRows.filter((row) => isMainTasteTag(row.tag));
  const otherTagRows = tagRows.filter((row) => !isMainTasteTag(row.tag));

  const tagDuplicateGroups = Array.from(
    tagRows.reduce((groups, row) => {
      const key = normalizeTagKey(row.tag);

      if (!key) {
        return groups;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(row);

      return groups;
    }, new Map())
  )
    .map(([key, items]) => ({
      key,
      items: items.sort((a, b) => b.flavorCount - a.flavorCount),
    }))
    .filter((group) => group.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length);

  const purchaseFlavors = flavors.filter((flavor) => {
    if (flavor.archived) {
      return false;
    }

    const total = getTotalQuantity(flavor.packs || []);
    const isLowStock = Boolean(flavor.lowStock || flavor.low_stock);

    return total === 0 || isLowStock;
  });

  const noTagFlavors = flavors
    .filter((flavor) => {
      const tags = Array.isArray(flavor.tags) ? flavor.tags : [];

      return !flavor.archived && tags.length === 0;
    })
    .sort((a, b) => {
      const brandCompare = String(a.brand || "").localeCompare(
        String(b.brand || ""),
        "ru"
      );

      if (brandCompare !== 0) {
        return brandCompare;
      }

      return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    });


  const parseWeightGrams = (weight) => {
    const normalizedWeight = String(weight || "")
      .toLowerCase()
      .replace(",", ".")
      .trim();

    const numberMatch = normalizedWeight.match(/\d+(\.\d+)?/);
    const number = numberMatch ? Number(numberMatch[0]) : 0;

    if (!number) {
      return 0;
    }

    if (normalizedWeight.includes("кг") || normalizedWeight.includes("kg")) {
      return number * 1000;
    }

    return number;
  };

  const formatWeight = (grams) => {
    if (!grams) {
      return "0 г";
    }

    if (grams >= 1000) {
      return `${(grams / 1000).toFixed(1).replace(".", ",")} кг`;
    }

    return `${Math.round(grams)} г`;
  };

  const addToMap = (map, key, packs, grams) => {
    if (!key) {
      return;
    }

    const previous = map.get(key) || {
      packs: 0,
      grams: 0,
    };

    map.set(key, {
      packs: previous.packs + packs,
      grams: previous.grams + grams,
    });
  };

  const mapToTop = (map, limit = 8) => {
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        ...value,
      }))
      .sort((a, b) => b.grams - a.grams)
      .slice(0, limit);
  };

  const buildFlavorAnalyticsRow = (flavor) => {
    const packs = flavor.packs || [];
    const tags = flavor.tags || [];
    const totalQuantity = getTotalQuantity(packs);
    const isLowStock = Boolean(flavor.lowStock || flavor.low_stock);

    let stockGrams = 0;
    let purchasedGrams = 0;
    let usedGrams = 0;
    let purchasedPacks = 0;
    let usedPacks = 0;

    packs.forEach((pack) => {
      const packWeight = parseWeightGrams(pack.weight);
      const quantity = Number(pack.quantity || 0);
      const rawPurchasedQuantity = Number(
        pack.purchasedQuantity ?? pack.purchased_quantity ?? quantity
      );

      const purchasedQuantity =
        Number.isFinite(rawPurchasedQuantity) && rawPurchasedQuantity > 0
          ? rawPurchasedQuantity
          : quantity;

      const usedQuantity = Math.max(purchasedQuantity - quantity, 0);

      purchasedPacks += purchasedQuantity;
      usedPacks += usedQuantity;

      stockGrams += quantity * packWeight;
      purchasedGrams += purchasedQuantity * packWeight;
      usedGrams += usedQuantity * packWeight;
    });

    return {
      id: flavor.id,
      brand: flavor.brand,
      name: flavor.name,
      tags,
      archived: Boolean(flavor.archived),
      lowStock: isLowStock,
      quantity: totalQuantity,
      stockGrams,
      purchasedGrams,
      usedGrams,
      purchasedPacks,
      usedPacks,
    };
  };

  const analyticsData = (() => {
    const activeRows = flavors
      .filter((flavor) => !flavor.archived)
      .map(buildFlavorAnalyticsRow);

    const usageRows = flavors.map(buildFlavorAnalyticsRow);

    const brandTotal = new Map();
    const tagTotal = new Map();

    let totalPacks = 0;
    let totalStockGrams = 0;
    let totalPurchasedGrams = 0;
    let totalUsedGrams = 0;

    let inStockCount = 0;
    let absentCount = 0;
    let lowStockCount = 0;

    activeRows.forEach((row) => {
      if (row.quantity > 0) {
        inStockCount += 1;
      } else {
        absentCount += 1;
      }

      if (row.lowStock) {
        lowStockCount += 1;
      }

      totalPacks += row.quantity;
      totalStockGrams += row.stockGrams;
    });

    usageRows.forEach((row) => {
      totalPurchasedGrams += row.purchasedGrams;
      totalUsedGrams += row.usedGrams;

      addToMap(brandTotal, row.brand, row.purchasedPacks, row.purchasedGrams);

      row.tags.forEach((tag) => {
        addToMap(tagTotal, tag, row.purchasedPacks, row.purchasedGrams);
      });
    });

    return {
      activeFlavorsCount: activeRows.length,
      inStockCount,
      absentCount,
      lowStockCount,
      totalPacks,
      totalStockGrams,
      totalPurchasedGrams,
      totalUsedGrams,
      topBrandStock: mapToTop(brandTotal),
      topTagStock: mapToTop(tagTotal),
      activeRows,
      usageRows,
    };
  })();

  const getAnalyticsRows = () => {
    if (analyticsFilter === "inStock") {
      return analyticsData.activeRows
        .filter((row) => row.quantity > 0)
        .sort((a, b) => b.stockGrams - a.stockGrams);
    }

    if (analyticsFilter === "absent") {
      return analyticsData.activeRows
        .filter((row) => row.quantity === 0)
        .sort((a, b) => a.brand.localeCompare(b.brand, "ru"));
    }

    if (analyticsFilter === "lowStock") {
      return analyticsData.activeRows
        .filter((row) => row.lowStock)
        .sort((a, b) => b.stockGrams - a.stockGrams);
    }

    if (analyticsFilter === "packs" || analyticsFilter === "stockWeight") {
      return analyticsData.activeRows
        .filter((row) => row.quantity > 0)
        .sort((a, b) => b.stockGrams - a.stockGrams);
    }

    if (analyticsFilter === "purchased") {
      return analyticsData.usageRows
        .filter((row) => row.purchasedPacks > 0 || row.quantity > 0)
        .sort(
          (a, b) =>
            b.purchasedGrams - a.purchasedGrams ||
            b.purchasedPacks - a.purchasedPacks ||
            a.brand.localeCompare(b.brand, "ru")
        );
    }

    if (analyticsFilter === "used") {
      return analyticsData.usageRows
        .filter((row) => row.usedPacks > 0)
        .sort((a, b) => b.usedPacks - a.usedPacks);
    }

    return analyticsData.activeRows.sort((a, b) =>
      a.brand.localeCompare(b.brand, "ru")
    );
  };

  const analyticsRows = getAnalyticsRows();

  const isInsideAnalyticsPeriod = (dateValue) => {
    if (analyticsPeriod === "all") {
      return true;
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const periodStart = new Date(now);

    if (analyticsPeriod === "30d") {
      periodStart.setDate(now.getDate() - 30);
    }

    if (analyticsPeriod === "3m") {
      periodStart.setMonth(now.getMonth() - 3);
    }

    if (analyticsPeriod === "1y") {
      periodStart.setFullYear(now.getFullYear() - 1);
    }

    return date >= periodStart;
  };

  const currentFlavorIds = new Set(
    flavors.map((flavor) => String(flavor.id))
  );

  const purchaseFinanceData = (() => {
    const normalizeFinanceKey = (value) => {
      return String(value || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[’‘`´ʼ]/g, "'")
        .replace(/[‐-‒–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
    };

    const canonicalBrandByFinanceKey = flavors.reduce((map, flavor) => {
      const brand = flavor.brand || "Без бренда";
      const key = normalizeFinanceKey(brand);

      if (!map.has(key)) {
        map.set(key, brand);
      }

      return map;
    }, new Map());

    const allSupplyRows = actionLogs
      .filter((log) => {
        return log.action === "supply" && !isCancelledSupplyLog(log);
      })
      .map((log) => {
        const details = parseActionDetails(log.details);
        const price = Number(details.price || 0);
        const quantity = Number(details.quantity || 0);
        const total = price > 0 && quantity > 0 ? price * quantity : 0;
        const weight = String(details.weight || "Без фасовки").trim();
        const weightGrams = parseWeightGrams(weight);
        const totalGrams = weightGrams * quantity;

        return {
          id: log.id,
          brand: log.brand || "Без бренда",
          name: log.name || "Без вкуса",
          weight,
          weightGrams,
          totalGrams,
          supplier: normalizeSupplierName(details.supplier) || "Поставщик не указан",
          price,
          quantity,
          total,
          suppliedAt: details.suppliedAt || log.createdAt || log.created_at,
        };
      })
      .filter((row) => row.price > 0 && row.quantity > 0);

    const chronologicalRows = [...allSupplyRows].sort(
      (a, b) => new Date(a.suppliedAt) - new Date(b.suppliedAt)
    );

    const previousPriceByItem = new Map();

    chronologicalRows.forEach((row) => {
      const key = [
        normalizeFinanceKey(row.brand),
        normalizeFinanceKey(row.name),
        normalizeFinanceKey(row.weight),
      ].join("::");

      const previousPrice = previousPriceByItem.get(key);

      if (previousPrice) {
        const difference = row.price - previousPrice;
        const percent = previousPrice > 0 ? (difference / previousPrice) * 100 : 0;

        row.priceChange = {
          previousPrice,
          difference,
          percent,
          direction:
            difference > 0 ? "up" : difference < 0 ? "down" : "same",
        };
      } else {
        row.priceChange = null;
      }

      previousPriceByItem.set(key, row.price);
    });

    const rowsWithPriceChanges = chronologicalRows
      .filter((row) => isInsideAnalyticsPeriod(row.suppliedAt))
      .sort((a, b) => new Date(b.suppliedAt) - new Date(a.suppliedAt));

    const totalSpent = rowsWithPriceChanges.reduce((sum, row) => sum + row.total, 0);
    const totalPacks = rowsWithPriceChanges.reduce((sum, row) => sum + row.quantity, 0);

    const groupBy = (field, options = {}) => {
      const map = new Map();

      rowsWithPriceChanges.forEach((row) => {
        const rawValue = row[field] || "Не указано";
        const key = options.normalizeKey
          ? options.normalizeKey(rawValue)
          : rawValue;

        const displayName = options.getDisplayName
          ? options.getDisplayName(rawValue, key)
          : rawValue;

        const previous = map.get(key) || {
          name: displayName,
          total: 0,
          quantity: 0,
          grams: 0,
          supplyCount: 0,
        };

        map.set(key, {
          ...previous,
          name: previous.name || displayName,
          total: previous.total + row.total,
          quantity: previous.quantity + row.quantity,
          grams: previous.grams + row.totalGrams,
          averagePricePerGram:
            previous.grams + row.totalGrams > 0
              ? (previous.total + row.total) / (previous.grams + row.totalGrams)
              : 0,
          supplyCount: previous.supplyCount + 1,
        });
      });

      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    };

    const priceIncreases = rowsWithPriceChanges
      .filter((row) => row.priceChange?.direction === "up")
      .sort((a, b) => b.priceChange.difference - a.priceChange.difference);

    const priceDecreases = rowsWithPriceChanges
      .filter((row) => row.priceChange?.direction === "down")
      .sort((a, b) => a.priceChange.difference - b.priceChange.difference);

    return {
      rows: rowsWithPriceChanges,
      totalSpent,
      totalPacks,
      averagePackPrice: totalPacks > 0 ? totalSpent / totalPacks : 0,
      byBrand: groupBy("brand", {
        normalizeKey: normalizeFinanceKey,
        getDisplayName: (brand, key) =>
          canonicalBrandByFinanceKey.get(key) || brand || "Без бренда",
      }),
      bySupplier: groupBy("supplier"),
      priceIncreases,
      priceDecreases,
    };
  })();

  const dataQualityData = (() => {
    const activeFlavors = flavors.filter((flavor) => !flavor.archived);

    const flavorsWithoutTags = activeFlavors.filter((flavor) => {
      return !Array.isArray(flavor.tags) || flavor.tags.length === 0;
    });

    const flavorsWithoutTagsInStock = flavorsWithoutTags.filter((flavor) => {
      return getTotalQuantity(flavor) > 0;
    });

    const flavorsWithoutTagsOutOfStock = flavorsWithoutTags.filter((flavor) => {
      return getTotalQuantity(flavor) === 0;
    });

    const flavorsWithoutPacks = activeFlavors.filter((flavor) => {
      return !Array.isArray(flavor.packs) || flavor.packs.length === 0;
    });

    const flavorsWithBrokenPurchasedQuantity = activeFlavors.filter((flavor) => {
      return (flavor.packs || []).some((pack) => {
        const quantity = Number(pack.quantity || 0);
        const purchasedQuantity = Number(
          pack.purchasedQuantity ??
            pack.purchased_quantity ??
            pack.quantity ??
            0
        );

        return purchasedQuantity < quantity;
      });
    });

    const allSupplyLogs = actionLogs
      .filter((log) => log.action === "supply" && !isCancelledSupplyLog(log))
      .map((log) => ({
        ...log,
        parsedDetails: parseActionDetails(log.details),
      }));

    const supplyLogsWithoutFlavor = allSupplyLogs.filter((log) => {
      const logFlavorId = log.flavorId || log.flavor_id;

      return !logFlavorId;
    });

    const supplyLogsWithDeletedFlavor = allSupplyLogs.filter((log) => {
      const logFlavorId = log.flavorId || log.flavor_id;

      return logFlavorId && !currentFlavorIds.has(String(logFlavorId));
    });

    const supplyLogs = allSupplyLogs.filter((log) => {
      const logFlavorId = log.flavorId || log.flavor_id;

      return logFlavorId && currentFlavorIds.has(String(logFlavorId));
    });

    const suppliesWithoutPrice = supplyLogs.filter((log) => {
      return !Number(log.parsedDetails.price || 0);
    });

    const suppliesWithoutSupplier = supplyLogs.filter((log) => {
      return !String(log.parsedDetails.supplier || "").trim();
    });

    const suppliesWithoutDate = supplyLogs.filter((log) => {
      return !String(log.parsedDetails.suppliedAt || "").trim();
    });

    return {
      flavorsWithoutTags,
      flavorsWithoutTagsInStock,
      flavorsWithoutTagsOutOfStock,
      flavorsWithoutPacks,
      flavorsWithBrokenPurchasedQuantity,
      suppliesWithoutPrice,
      suppliesWithoutSupplier,
      suppliesWithoutDate,
      supplyLogsWithoutFlavor,
      supplyLogsWithDeletedFlavor,
      duplicateFlavorGroups: duplicateGroups,
      brandVariantGroups: brandDuplicateGroups,
    };
  })();


  const dataQualityIssues = [
    {
      key: "duplicateFlavors",
      title: "Подозрительные дубли вкусов",
      items: dataQualityData.duplicateFlavorGroups.map((group) => {
        const firstFlavor = group.items[0];
        const variants = group.items
          .map((flavor) => `${flavor.brand} — ${flavor.name}`)
          .join(" / ");

        return {
          id: firstFlavor.id,
          title: `${firstFlavor.brand} — ${firstFlavor.name}`,
          meta: `${group.items.length} записи · ${variants}`,
          type: "flavor",
        };
      }),
    },
    {
      key: "brandVariants",
      title: "Варианты написания брендов",
      items: dataQualityData.brandVariantGroups.map((group) => {
        const firstFlavor = group.flavors[0];
        const variants = Array.from(group.variants.keys()).join(" / ");

        return {
          id: firstFlavor?.id,
          title: variants,
          meta: `${group.flavors.length} позиций · привести бренд к одному написанию`,
          type: "flavor",
        };
      }).filter((item) => item.id),
    },
    {
      key: "noTagsInStock",
      title: "Без тегов, но есть на складе",
      items: dataQualityData.flavorsWithoutTagsInStock.map((flavor) => ({
        id: flavor.id,
        title: `${flavor.brand} — ${flavor.name}`,
        meta: `${getTotalQuantity(flavor)} пач. на складе · добавить теги`,
        type: "flavor",
      })),
    },
    {
      key: "noTagsOutOfStock",
      title: "Без тегов и без остатка",
      items: dataQualityData.flavorsWithoutTagsOutOfStock.map((flavor) => ({
        id: flavor.id,
        title: `${flavor.brand} — ${flavor.name}`,
        meta: "0 пач. на складе · можно разобрать позже",
        type: "flavor",
      })),
    },
    {
      key: "noPacks",
      title: "Позиции без фасовки",
      items: dataQualityData.flavorsWithoutPacks.map((flavor) => ({
        id: flavor.id,
        title: `${flavor.brand} — ${flavor.name}`,
        meta: "Нет данных по фасовкам",
        type: "flavor",
      })),
    },
    {
      key: "brokenPurchased",
      title: "Ошибка “закуплено”",
      items: dataQualityData.flavorsWithBrokenPurchasedQuantity.map((flavor) => ({
        id: flavor.id,
        title: `${flavor.brand} — ${flavor.name}`,
        meta: "В одной из фасовок закуплено меньше, чем осталось",
        type: "flavor",
      })),
    },
    {
      key: "noPrice",
      title: "Поставки без цены",
      items: dataQualityData.suppliesWithoutPrice.map((log) => ({
        id: log.id,
        title: `${log.brand} — ${log.name}`,
        meta: formatHistoryDate(log),
        type: "log",
      })),
    },
    {
      key: "noSupplier",
      title: "Поставки без поставщика",
      items: dataQualityData.suppliesWithoutSupplier.map((log) => ({
        id: log.id,
        title: `${log.brand} — ${log.name}`,
        meta: formatHistoryDate(log),
        type: "log",
      })),
    },
    {
      key: "noDate",
      title: "Поставки без даты",
      items: dataQualityData.suppliesWithoutDate.map((log) => ({
        id: log.id,
        title: `${log.brand} — ${log.name}`,
        meta: "Дата поставки не указана",
        type: "log",
      })),
    },
    {
      key: "supplyWithoutFlavor",
      title: "Поставки без привязки к вкусу",
      items: dataQualityData.supplyLogsWithoutFlavor.map((log) => ({
        id: log.id,
        title: `${log.brand || "Без бренда"} — ${log.name || "Без вкуса"}`,
        meta: `${formatHistoryDate(log)} · нет flavorId`,
        type: "log",
      })),
    },
    {
      key: "supplyWithDeletedFlavor",
      title: "Поставки с удалённым вкусом",
      items: dataQualityData.supplyLogsWithDeletedFlavor.map((log) => ({
        id: log.id,
        title: `${log.brand || "Без бренда"} — ${log.name || "Без вкуса"}`,
        meta: `${formatHistoryDate(log)} · вкус удалён или объединён`,
        type: "log",
      })),
    },
  ];


  const visibleDataQualityIssues = dataQualityIssues.filter(
    (issue) => issue.items.length > 0
  );

  const dataQualityTotalIssues = visibleDataQualityIssues.reduce(
    (sum, issue) => sum + issue.items.length,
    0
  );

  const groupedAnalyticsRowsByBrand = Array.from(
    analyticsRows.reduce((groups, row) => {
      const brand = row.brand || "Без бренда";

      if (!groups.has(brand)) {
        groups.set(brand, []);
      }

      groups.get(brand).push(row);

      return groups;
    }, new Map())
  )
    .map(([brand, rows]) => ({
      brand,
      rows: rows.sort((a, b) => a.name.localeCompare(b.name, "ru")),
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      totalStockGrams: rows.reduce((sum, row) => sum + row.stockGrams, 0),
      totalPurchasedGrams: rows.reduce(
        (sum, row) => sum + row.purchasedGrams,
        0
      ),
      totalUsedGrams: rows.reduce((sum, row) => sum + row.usedGrams, 0),
      absentCount: rows.filter((row) => row.quantity === 0).length,
      lowStockCount: rows.filter((row) => row.lowStock).length,
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand, "ru"));

  const analyticsFilterTitle = {
    all: "Все активные вкусы",
    inStock: "Вкусы в наличии",
    absent: "Отсутствующие вкусы",
    lowStock: "Мало осталось",
    packs: "Пачки на полке",
    stockWeight: "Вес на полке",
    purchased: "Закуплено за период",
    used: "Использовано за период",
  }[analyticsFilter];


  const getSpecificTags = (flavor) => {
    const mainTagSet = new Set(quickTags.map((tag) => tag.toLowerCase()));

    return (flavor.tags || [])
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .filter((tag) => !mainTagSet.has(tag.toLowerCase()));
  };

  const getAnalogFlavors = (targetFlavor) => {
    const targetSpecificTags = getSpecificTags(targetFlavor).map((tag) =>
      tag.toLowerCase()
    );

    if (targetSpecificTags.length === 0) {
      return [];
    }

    return flavors
      .filter((flavor) => {
        if (flavor.id === targetFlavor.id || flavor.archived) {
          return false;
        }

        const flavorSpecificTags = getSpecificTags(flavor).map((tag) =>
          tag.toLowerCase()
        );

        return flavorSpecificTags.some((tag) =>
          targetSpecificTags.includes(tag)
        );
      })
      .map((flavor) => {
        const flavorSpecificTags = getSpecificTags(flavor);

        const matchedTags = flavorSpecificTags.filter((tag) =>
          targetSpecificTags.includes(tag.toLowerCase())
        );

        return {
          flavor,
          matchedTags,
          totalQuantity: getTotalQuantity(flavor.packs || []),
        };
      })
      .sort((a, b) => {
        if (b.matchedTags.length !== a.matchedTags.length) {
          return b.matchedTags.length - a.matchedTags.length;
        }

        return b.totalQuantity - a.totalQuantity;
      })
      .slice(0, 5);
  };

  const toggleDeadstockExcluded = async (flavor) => {
    const currentValue = Boolean(
      flavor.excludedFromDeadstock || flavor.excluded_from_deadstock
    );

    try {
      const response = await apiFetch(
        `/api/flavors/${flavor.id}/deadstock-excluded`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            excludedFromDeadstock: !currentValue,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось изменить настройку залежей");
      }

      await addActionLog({
        action: currentValue
          ? "deadstock_excluded_off"
          : "deadstock_excluded_on",
        flavor,
      });

      await refreshFlavors();
      highlightFlavor(flavor.id);

      showNotification(
        currentValue
          ? "Вкус снова учитывается в залежах"
          : "Вкус исключён из залежей",
        "success"
      );
    } catch (error) {
      console.error(error);
      showNotification(
        error.message || "Не удалось изменить настройку залежей",
        "error"
      );
      setErrorText(error.message || "Не удалось изменить настройку залежей");
    }
  };

  const togglePurchaseConfirmed = async (flavor) => {
    const currentValue = Boolean(
      flavor.purchaseConfirmed || flavor.purchase_confirmed
    );

    try {
      const response = await apiFetch(
        `/api/flavors/${flavor.id}/purchase-confirmed`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            purchaseConfirmed: !currentValue,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось изменить подтверждение закупки");
      }

      await addActionLog({
        action: currentValue
          ? "purchase_confirmed_off"
          : "purchase_confirmed_on",
        flavor,
      });

      await refreshFlavors();
      highlightFlavor(flavor.id);
      showNotification(
        currentValue
          ? "Подтверждение закупки снято"
          : "Закупка подтверждена",
        "success"
      );
    } catch (error) {
      console.error(error);
      showNotification(
        error.message || "Не удалось изменить подтверждение закупки",
        "error"
      );
      setErrorText(
        error.message || "Не удалось изменить подтверждение закупки"
      );
    }
  };

  const mergeTagGroup = async (group) => {
    if (!group?.items || group.items.length < 2) {
      return;
    }

    const targetTag = group.items[0].tag;
    const fromTags = group.items.map((item) => item.tag);

    const confirmationText = window.prompt(
      `Объединить теги ${fromTags.map((tag) => `#${tag}`).join(", ")} в #${targetTag}? Чтобы продолжить, введите: ТЕГИ`
    );

    if (confirmationText !== "ТЕГИ") {
      showNotification("Объединение тегов отменено", "info");
      return;
    }

    await createBackupExcel("before-merge-tags");
    await createFullBackupJson("before-merge-tags");

    try {
      const response = await apiFetch("/api/tags/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromTags,
          toTag: targetTag,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось объединить теги");
      }

      const result = await response.json();

      await addActionLog({
        action: "merge_tags",
        details: {
          toTag: targetTag,
          fromTags,
          updatedCount: result.updatedCount,
        },
      });

      await refreshFlavors();
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось объединить теги");
    }
  };

  const mergeBrandVariantGroup = async (group, canonicalBrand) => {
    if (!group?.flavors?.length || !canonicalBrand) {
      return;
    }

    const affectedFlavors = group.flavors.filter(
      (flavor) => String(flavor.brand || "").trim() !== canonicalBrand
    );

    if (affectedFlavors.length === 0) {
      showNotification("Все позиции уже используют это написание бренда", "info");
      return;
    }

    const confirmationText = window.prompt(
      `Привести ${affectedFlavors.length} позиций к бренду "${canonicalBrand}"? Чтобы продолжить, введите: БРЕНДЫ`
    );

    if (confirmationText !== "БРЕНДЫ") {
      showNotification("Объединение написаний бренда отменено", "info");
      return;
    }

    await createBackupExcel("before-merge-brand-variants");
    await createFullBackupJson("before-merge-brand-variants");

    try {
      setIsLoading(true);

      for (const flavor of affectedFlavors) {
        const response = await apiFetch(`/api/flavors/${flavor.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand: canonicalBrand,
            name: flavor.name || "",
            packs: flavor.packs || [],
            tags: flavor.tags || [],
            minStock: flavor.minStock || flavor.min_stock || 1,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Не удалось обновить бренд у позиции: ${flavor.brand} — ${flavor.name}`
          );
        }
      }

      await addActionLog({
        action: "bulk_action",
        details: {
          bulkAction: "merge_brand_variants",
          updatedCount: affectedFlavors.length,
          canonicalBrand,
          variants: group.variants.map((variant) => variant.name),
        },
      });

      await refreshFlavors();
      showNotification(
        `Написания бренда объединены: ${affectedFlavors.length} позиций`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось объединить написания бренда", "error");
      setErrorText(error.message || "Не удалось объединить написания бренда");
    } finally {
      setIsLoading(false);
    }
  };

  const mergeDuplicateGroup = async (group) => {
    if (!group?.items || group.items.length < 2) {
      return;
    }

    const primaryFlavor = group.items[0];
    const duplicateIds = group.items.slice(1).map((flavor) => flavor.id);

    const confirmationText = window.prompt(
      `Объединить ${group.items.length} записей в одну? Основной останется: ${primaryFlavor.brand} — ${primaryFlavor.name}. Чтобы продолжить, введите: ДУБЛИ`
    );

    if (confirmationText !== "ДУБЛИ") {
      showNotification("Объединение дублей отменено", "info");
      return;
    }

    await createBackupExcel("before-merge-duplicates");
    await createFullBackupJson("before-merge-duplicates");

    try {
      const response = await apiFetch("/api/flavors/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          primaryId: primaryFlavor.id,
          duplicateIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось объединить дубли");
      }

      await addActionLog({
        action: "merge_duplicates",
        flavor: primaryFlavor,
        details: {
          mergedCount: group.items.length,
        },
      });

      await refreshFlavors();
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось объединить дубли");
    }
  };

  const actionLabels = {
    pack_plus: "+1 фасовка",
    pack_minus: "−1 фасовка",
    clear: "Выбит вкус",
    archive: "В архив",
    restore: "Возврат из архива",
    low_stock_on: "Мало осталось",
    low_stock_off: "Снято “мало осталось”",
    purchase_confirmed_on: "Закупка подтверждена",
    purchase_confirmed_off: "Подтверждение закупки снято",
    supply: "Поставка",
    import_excel: "Импорт Excel",
    import_inventory: "Старый импорт данных",
    merge_duplicates: "Объединение дублей",
    merge_tags: "Объединение тегов",
    bulk_action: "Массовое действие",
    alias_create: "Создан алиас",
    alias_delete: "Удалён алиас",
    deadstock_excluded_on: "Исключён из залежей",
    deadstock_excluded_off: "Возвращён в залежи",
  };

  const formatActionTime = (value) => {
    if (!value) {
      return "";
    }

    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatActionDetails = (log) => {
    const details = parseActionDetails(log.details);

    if (log.action === "backup_created") {
      const parts = [];

      if (details.reason) {
        parts.push(`причина: ${details.reason}`);
      }

      if (details.flavorsCount !== undefined) {
        parts.push(`вкусов: ${details.flavorsCount}`);
      }

      if (details.actionLogsCount !== undefined) {
        parts.push(`действий: ${details.actionLogsCount}`);
      }

      if (details.createdAt) {
        parts.push(`создан: ${new Date(details.createdAt).toLocaleString("ru-RU")}`);
      }

      return parts.join(" · ");
    }

    if (log.action === "backup_restored") {
      const parts = [];

      if (details.fileName) {
        parts.push(`файл: ${details.fileName}`);
      }

      if (details.restoredFlavors !== undefined) {
        parts.push(`восстановлено вкусов: ${details.restoredFlavors}`);
      }

      if (details.restoredActionLogs !== undefined) {
        parts.push(`восстановлено действий: ${details.restoredActionLogs}`);
      }

      return parts.join(" · ");
    }

    if (log.action === "pack_plus" || log.action === "pack_minus") {
      return details.weight ? `Фасовка: ${details.weight}` : "";
    }

    if (log.action === "supply") {
      const parts = [
        details.weight || "",
        `${details.quantity || 0} пач.`,
      ];

      if (details.suppliedAt) {
        parts.push(`дата: ${new Date(details.suppliedAt).toLocaleDateString("ru-RU")}`);
      }

      if (details.supplier) {
        parts.push(`поставщик: ${details.supplier}`);
      }

      if (details.price !== null && details.price !== undefined && details.price !== "") {
        parts.push(`цена: ${Number(details.price).toLocaleString("ru-RU")} ₽`);
      }

      if (isCancelledSupplyLog(log)) {
        parts.push("отменена");
      }

      return parts.filter(Boolean).join(" · ");
    }

    if (log.action === "import_excel" || log.action === "import_inventory") {
      return `Обновлено вкусов: ${details.importedCount || 0}`;
    }

    if (log.action === "merge_duplicates") {
      return `Объединено записей: ${details.mergedCount || 0}`;
    }

    if (log.action === "merge_tags") {
      return `В #${details.toTag || ""} · обновлено вкусов: ${
        details.updatedCount || 0
      }`;
    }

    if (log.action === "bulk_action") {
      return `Действие: ${details.bulkAction || ""} · обновлено: ${
        details.updatedCount || 0
      }`;
    }

return "";
  };


  const getDateInputValue = (value) => {
    if (!value) {
      return getTodayInputDate();
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
  };

  const getSupplyEditDateInputValue = (value) => {
    if (!value) {
      return getTodayInputDate();
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
  };

  const normalizeSupplyEditWeight = (value) => {
    const match = String(value || "").match(/\d+/);
    return match ? `${match[0]} г` : String(value || "").trim();
  };

  const editSupplyLog = (log) => {
    const details = parseActionDetails(log.details);

    setEditingSupplyLog(log);
    setEditingSupplyForm({
      suppliedAt: getSupplyEditDateInputValue(
        details.suppliedAt || log.createdAt || log.created_at
      ),
      supplier: details.supplier || "",
      price: details.price ?? "",
      quantity: details.quantity ?? "",
      weight: details.weight || "",
    });
  };

  const closeSupplyEditModal = () => {
    setEditingSupplyLog(null);
    setEditingSupplyForm({
      suppliedAt: "",
      supplier: "",
      price: "",
      quantity: "",
      weight: "",
    });
  };

  const handleEditingSupplyChange = (event) => {
    const { name, value } = event.target;

    setEditingSupplyForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const applySupplyLogStockCorrection = async (
    log,
    previousDetails,
    nextDetails
  ) => {
    const flavorId = log.flavorId || log.flavor_id;

    if (!flavorId) {
      return;
    }

    const flavor = flavors.find((item) => String(item.id) === String(flavorId));

    if (!flavor) {
      return;
    }

    const previousWeight = normalizeSupplyEditWeight(previousDetails.weight);
    const nextWeight = normalizeSupplyEditWeight(nextDetails.weight);

    const previousQuantity = Number(previousDetails.quantity || 0);
    const nextQuantity = Number(nextDetails.quantity || 0);

    if (!previousWeight || !nextWeight || !previousQuantity || !nextQuantity) {
      return;
    }

    if (
      previousWeight === nextWeight &&
      previousQuantity === nextQuantity
    ) {
      return;
    }

    const packs = Array.isArray(flavor.packs)
      ? flavor.packs.map((pack) => ({ ...pack }))
      : [];

    const findPack = (weight) => {
      return packs.find((pack) => {
        return normalizeSupplyEditWeight(pack.weight) === weight;
      });
    };

    const previousPack = findPack(previousWeight);

    if (previousPack) {
      const previousQuantityBeforeCorrection = Number(previousPack.quantity || 0);

      const previousPurchasedQuantity = Number(
        previousPack.purchasedQuantity ??
          previousPack.purchased_quantity ??
          previousQuantityBeforeCorrection ??
          0
      );

      previousPack.quantity = Math.max(
        0,
        previousQuantityBeforeCorrection - previousQuantity
      );

      previousPack.purchasedQuantity = Math.max(
        0,
        (Number.isFinite(previousPurchasedQuantity)
          ? previousPurchasedQuantity
          : previousQuantityBeforeCorrection) - previousQuantity
      );

      delete previousPack.purchased_quantity;
    }

    let nextPack = findPack(nextWeight);

    if (!nextPack) {
      nextPack = {
        weight: nextWeight,
        quantity: 0,
        purchasedQuantity: 0,
      };

      packs.push(nextPack);
    }

    const nextQuantityBeforeCorrection = Number(nextPack.quantity || 0);

    const nextPurchasedQuantity = Number(
      nextPack.purchasedQuantity ??
        nextPack.purchased_quantity ??
        nextQuantityBeforeCorrection ??
        0
    );

    nextPack.quantity = nextQuantityBeforeCorrection + nextQuantity;

    nextPack.purchasedQuantity =
      (Number.isFinite(nextPurchasedQuantity)
        ? nextPurchasedQuantity
        : nextQuantityBeforeCorrection) + nextQuantity;

    delete nextPack.purchased_quantity;

    const cleanedPacks = packs.filter((pack) => {
      return (
        Number(pack.quantity || 0) > 0 ||
        Number(pack.purchasedQuantity || 0) > 0
      );
    });

    const response = await apiFetch(`/api/flavors/${flavor.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...flavor,
        packs: cleanedPacks,
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось обновить склад");
    }
  };

  const applySupplyLogCancelStockCorrection = async (log) => {
    const flavorId = log.flavorId || log.flavor_id;

    if (!flavorId) {
      return;
    }

    const flavor = flavors.find((item) => String(item.id) === String(flavorId));

    if (!flavor) {
      return;
    }

    const details = parseActionDetails(log.details);
    const weight = normalizeSupplyEditWeight(details.weight);
    const quantity = Number(details.quantity || 0);

    if (!weight || !quantity) {
      return;
    }

    const packs = Array.isArray(flavor.packs)
      ? flavor.packs.map((pack) => ({ ...pack }))
      : [];

    const pack = packs.find((item) => {
      return normalizeSupplyEditWeight(item.weight) === weight;
    });

    if (!pack) {
      return;
    }

    const quantityBeforeCorrection = Number(pack.quantity || 0);
    const purchasedQuantityBeforeCorrection = Number(
      pack.purchasedQuantity ??
        pack.purchased_quantity ??
        quantityBeforeCorrection ??
        0
    );

    pack.quantity = Math.max(0, quantityBeforeCorrection - quantity);
    pack.purchasedQuantity = Math.max(
      0,
      (Number.isFinite(purchasedQuantityBeforeCorrection)
        ? purchasedQuantityBeforeCorrection
        : quantityBeforeCorrection) - quantity
    );

    delete pack.purchased_quantity;

    const cleanedPacks = packs.filter((item) => {
      return (
        Number(item.quantity || 0) > 0 ||
        Number(item.purchasedQuantity || 0) > 0
      );
    });

    const response = await apiFetch(`/api/flavors/${flavor.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...flavor,
        packs: cleanedPacks,
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось вычесть поставку со склада");
    }
  };

  const cancelSupplyLog = async () => {
    if (!editingSupplyLog) {
      return;
    }

    if (isCancelledSupplyLog(editingSupplyLog)) {
      showNotification("Эта поставка уже отменена", "info");
      return;
    }

    const isConfirmed = window.confirm(
      "Отменить эту поставку? Количество будет вычтено со склада, а аналитика перестанет учитывать эту поставку."
    );

    if (!isConfirmed) {
      return;
    }

    const details = parseActionDetails(editingSupplyLog.details);

    try {
      await applySupplyLogCancelStockCorrection(editingSupplyLog);

      const response = await apiFetch(`/api/action-logs/${editingSupplyLog.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          details: {
            ...details,
            cancelled: true,
            cancelledAt: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Склад исправлен, но не удалось отметить поставку как отменённую");
      }

      const updatedLogs = await loadActionLogsWithPassword(adminPassword);
      setActionLogs(updatedLogs);
      await refreshFlavors();
      closeSupplyEditModal();

      showNotification("Поставка отменена и вычтена со склада", "success");
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось отменить поставку", "error");
      setErrorText(error.message || "Не удалось отменить поставку");
    }
  };

  const saveSupplyLogChanges = async () => {
    if (!editingSupplyLog) {
      return;
    }

    const details = parseActionDetails(editingSupplyLog.details);

    const nextQuantity =
      editingSupplyForm.quantity === ""
        ? Number(details.quantity || 0)
        : Number(editingSupplyForm.quantity);

    const nextPrice =
      editingSupplyForm.price === "" ? null : Number(editingSupplyForm.price);

    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      showNotification("Количество поставки должно быть больше 0", "error");
      return;
    }

    if (nextPrice !== null && (!Number.isFinite(nextPrice) || nextPrice < 0)) {
      showNotification("Цена поставки должна быть 0 или больше", "error");
      return;
    }

    const updatedDetails = {
      ...details,
      weight:
        normalizeSupplyEditWeight(editingSupplyForm.weight) ||
        normalizeSupplyEditWeight(details.weight),
      suppliedAt:
        editingSupplyForm.suppliedAt.trim() ||
        details.suppliedAt ||
        getTodayInputDate(),
      supplier: normalizeSupplierName(editingSupplyForm.supplier),
      price: nextPrice,
      quantity: nextQuantity,
    };

    try {
      await applySupplyLogStockCorrection(
        editingSupplyLog,
        details,
        updatedDetails
      );

      const response = await apiFetch(`/api/action-logs/${editingSupplyLog.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          details: updatedDetails,
        }),
      });

      if (!response.ok) {
        throw new Error("Склад исправлен, но не удалось обновить историю поставки");
      }

      const updatedLogs = await loadActionLogsWithPassword(adminPassword);
      setActionLogs(updatedLogs);
      await refreshFlavors();
      closeSupplyEditModal();

      showNotification("Данные поставки и склад исправлены", "success");
    } catch (error) {
      console.error(error);
      showNotification(
        error.message || "Не удалось исправить данные поставки",
        "error"
      );
      setErrorText(error.message || "Не удалось исправить данные поставки");
    }
  };


  const toggleFlavorSelection = (flavorId) => {
    setSelectedFlavorIds((currentIds) =>
      currentIds.includes(flavorId)
        ? currentIds.filter((id) => id !== flavorId)
        : [...currentIds, flavorId]
    );
  };

  const selectVisibleFlavors = () => {
    setSelectedFlavorIds(filteredFlavors.map((flavor) => flavor.id));
  };

  const clearSelectedFlavors = () => {
    setSelectedFlavorIds([]);
  };

  const applyBulkAction = async (action) => {
    const actionTitles = {
      archive: "отправить выбранные вкусы в архив",
      restore: "вернуть выбранные вкусы из архива",
      low_stock_on: "отметить выбранные вкусы как “мало осталось”",
      low_stock_off: "убрать отметку “мало осталось”",
      purchase_confirmed_on: "подтвердить закупку выбранных вкусов",
      purchase_confirmed_off: "снять подтверждение закупки",
    };

    const selectedCount = selectedFlavorIds.length;

    if (selectedCount === 0) {
      return;
    }

    const confirmationText = window.prompt(
      `Точно ${actionTitles[action]}? Выбрано: ${selectedCount}. Чтобы продолжить, введите: МАССОВО`
    );

    if (confirmationText !== "МАССОВО") {
      showNotification("Массовое действие отменено", "info");
      return;
    }

    await createBackupExcel(`before-bulk-${action}`);
    await createFullBackupJson(`before-bulk-${action}`);

    try {
      const response = await apiFetch("/api/flavors/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: selectedFlavorIds,
          action,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось выполнить массовое действие");
      }

      const result = await response.json();

      await addActionLog({
        action: "bulk_action",
        details: {
          bulkAction: action,
          updatedCount: result.updatedCount,
        },
      });

      clearSelectedFlavors();
      await refreshFlavors();
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось выполнить массовое действие");
    }
  };

  const renderChoiceModal = () => {
    if (!activeChoiceModal) {
      return null;
    }

    return (
      <div
        className="choice-modal-backdrop"
        onClick={() => setActiveChoiceModal(null)}
      >
        <section
          className="choice-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="choice-modal-close"
            type="button"
            onClick={() => setActiveChoiceModal(null)}
          >
            ×
          </button>

          {activeChoiceModal === "export" && (
            <>
              <span className="choice-modal-eyebrow">Экспорт</span>
              <h2>Что выгрузить?</h2>

              <div className="choice-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    exportToExcel();
                    setActiveChoiceModal(null);
                  }}
                >
                  Экспорт склада
                </button>

                <button
                  type="button"
                  onClick={() => {
                    exportPurchaseToExcel();
                    setActiveChoiceModal(null);
                  }}
                >
                  Экспорт закупки
                </button>

                <button
                  type="button"
                  onClick={() => {
                    exportAnalyticsToExcel();
                    setActiveChoiceModal(null);
                  }}
                >
                  Экспорт аналитики
                </button>

                <button
                  type="button"
                  onClick={() => {
                    exportHistoryToExcel();
                    setActiveChoiceModal(null);
                  }}
                >
                  Экспорт истории
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await createFullBackupJson("manual");
                    setActiveChoiceModal(null);
                  }}
                >
                  JSON backup
                </button>
              </div>
            </>
          )}

          {activeChoiceModal === "import" && (
            <>
              <span className="choice-modal-eyebrow">Импорт</span>
              <h2>Загрузить историю закупки</h2>

              <div className="choice-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    startExcelImport("supply");
                  }}
                >
                  Выбрать Excel закупки
                </button>

                <button
                  type="button"
                  onClick={() => {
                    downloadImportTemplate("supply");
                    setActiveChoiceModal(null);
                  }}
                >
                  Шаблон закупки
                </button>

                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("restore-json-input")?.click();
                    setActiveChoiceModal(null);
                  }}
                >
                  Восстановить JSON backup
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  };

  const renderGlobalFileInput = () => {
    return (
      <>
        <input
          id="import-excel-input"
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(event) => {
            importFromExcel(event);
            setActiveChoiceModal(null);
          }}
        />

        <input
          id="restore-json-input"
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={restoreFromJsonBackup}
        />
      </>
    );
  };

  const renderAppHeader = ({ title, subtitle, isInventory = false }) => {
    const closeMenu = () => setIsHeaderMenuOpen(false);

    const goToView = (view) => {
      setCurrentView(view);
      closeMenu();
    };

    return (
      <>
      {renderNotifications()}
      {renderImportProgress()}
      {renderGlobalFileInput()}
      {renderChoiceModal()}

      {editingSupplyLog && (
        <div
          className="choice-modal-backdrop"
          onClick={closeSupplyEditModal}
        >
          <section
            className="choice-modal supply-edit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="choice-modal-close"
              type="button"
              onClick={closeSupplyEditModal}
            >
              ×
            </button>

            <span className="choice-modal-eyebrow">Поставка</span>
            <h2>Исправить поставку</h2>

            <div className="supply-edit-info">
              <strong>
                {editingSupplyLog.brand} — {editingSupplyLog.name}
              </strong>
            </div>

            <label>
              Фасовка
              <input
                name="weight"
                list="weight-options"
                value={editingSupplyForm.weight}
                onChange={handleEditingSupplyChange}
                placeholder="Например, 200 г"
              />
            </label>

            <label>
              Дата поставки
              <input
                type="date"
                name="suppliedAt"
                value={editingSupplyForm.suppliedAt}
                onChange={handleEditingSupplyChange}
              />
            </label>

            <label>
              Поставщик
              <input
                name="supplier"
                list="supplier-options"
                value={editingSupplyForm.supplier}
                onChange={handleEditingSupplyChange}
                placeholder="Например, OSHISHA"
              />
            </label>

            <label>
              Цена за пачку
              <input
                type="number"
                name="price"
                min="0"
                step="0.01"
                value={editingSupplyForm.price}
                onChange={handleEditingSupplyChange}
                placeholder="Например, 1473"
              />
            </label>

            <label>
              Количество пачек
              <input
                type="number"
                name="quantity"
                min="1"
                step="1"
                value={editingSupplyForm.quantity}
                onChange={handleEditingSupplyChange}
                placeholder="Например, 1"
              />
            </label>

            <div className="choice-modal-actions horizontal">
              <button type="button" onClick={saveSupplyLogChanges}>
                Сохранить
              </button>

              <button type="button" onClick={closeSupplyEditModal}>
                Отмена
              </button>

              <button
                className="danger"
                type="button"
                onClick={cancelSupplyLog}
              >
                Отменить поставку
              </button>
            </div>
          </section>
        </div>
      )}

      <header className="header">
        <div>
          <p className="eyebrow">Hookah Inventory</p>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>

          {isDemoMode && (
            <p className="demo-badge">Ознакомительный режим</p>
          )}
        </div>

        <div className="header-actions">
          {isInventory ? (
            !isDemoMode && (
              <button
                className="primary-button"
                onClick={() => setIsSupplyFormOpen(true)}
              >
                + Поставка
              </button>
            )
          ) : (
            <button
              className="secondary-button"
              onClick={() => goToView("inventory")}
            >
              Склад
            </button>
          )}

          <button
            className="secondary-button menu-toggle-button"
            onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
          >
            Меню {isHeaderMenuOpen ? "↑" : "↓"}
          </button>

          <button className="secondary-button" type="button" onClick={handleLogout}>
            Выйти
          </button>

          {isHeaderMenuOpen && (
            <div className="header-dropdown">
              <div className="dropdown-section">
                <p>Работа</p>

                <button type="button" onClick={() => goToView("inventory")}>
                  Склад
                </button>

                <button type="button" onClick={() => goToView("purchase")}>
                  Закупка{purchaseFlavors.length > 0 ? ` (${purchaseFlavors.length})` : ""}
                </button>
              </div>

              <div className="dropdown-section">
                <p>Аналитика</p>

                <button type="button" onClick={() => goToView("analytics")}>
                  Общая аналитика
                </button>

                <button type="button" onClick={() => goToView("deadstock")}>
                  Залежи
                </button>
              </div>

              <div className="dropdown-section">
                <p>Порядок в базе</p>

                <button type="button" onClick={() => goToView("dataQuality")}>
                  Проверка базы{dataQualityTotalIssues > 0 ? ` (${dataQualityTotalIssues})` : ""}
                </button><button type="button" onClick={() => goToView("tags")}>
                  Теги
                </button>
              </div>

              <div className="dropdown-section">
                <p>Данные</p>

                {!isDemoMode && (
                  <button
                    onClick={() => {
                      openImportChoice();
                      closeMenu();
                    }}
                  >
                    Импорт
                  </button>
                )}

                <button
                  onClick={() => {
                    openExportChoice();
                    closeMenu();
                  }}
                >
                  Экспорт
                </button>

                <button
                  onClick={() => {
                    openHistory();
                    closeMenu();
                  }}
                >
                  История
                </button>

                {!isDemoMode && (
                  <button
                    className="dropdown-danger"
                    onClick={() => {
                      clearDatabase();
                      closeMenu();
                    }}
                  >
                    Очистить базу
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
      </>
    );
  };

  if (!isAuthorized) {
    return (
      <div className="app auth-page">
        <section className="auth-card">
          <p className="eyebrow dark">Hookah Inventory</p>
          <h1>Вход в склад</h1>
          <p className="subtitle dark">
            Введите пароль, чтобы открыть систему учёта табака. Пароль test откроет ознакомительный режим
          </p>

          <form className="auth-form" onSubmit={handleLogin}>
            <input
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="Пароль"
              autoFocus
            />

            <button type="submit" disabled={isLoading}>
              {isLoading ? "Проверяем..." : "Войти"}
            </button>
          </form>

          {authError && <p className="error-message">{authError}</p>}
        </section>
      </div>
    );
  }


  const matchesDeadstockFilter = (row) => {
    if (deadstockFilter === "all") {
      return true;
    }

    const reasons = row.deadstockReasons || [];

    if (deadstockFilter === "noMovement") {
      return reasons.some((reason) =>
        reason.includes("нет записей о движениях") ||
        reason.includes("ещё не списывался") ||
        reason.includes("Остаток не уменьшался")
      );
    }

    if (deadstockFilter === "noWriteOff") {
      return reasons.some((reason) => reason.includes("Не списывался"));
    }

    if (deadstockFilter === "noSupply") {
      return reasons.some((reason) => reason.includes("Не закупался"));
    }

    if (deadstockFilter === "slowUsage") {
      return reasons.some((reason) => reason.includes("Слабое использование"));
    }

    return true;
  };

;

;

;

;


;

;

;

;

;

if (currentView === "deadstock") {
    const deadstockRowsWithReasons = analyticsData.usageRows
      .map((row) => {
        const flavor = flavors.find(
          (item) => String(item.id) === String(row.id)
        ) || row;

        const reasons = getDeadstockReasons(flavor);
        const movement = getFlavorMovementInfo(flavor);

        return {
          ...row,
          deadstockReasons: reasons,
          movement,
          deadstockScore: getDeadstockScore(flavor),
        };
      })
      .filter(
        (row) =>
          !row.archived &&
          row.quantity > 0 &&
          row.purchasedPacks > 0 &&
          row.deadstockReasons.length > 0
      );

    const deadStockRows = deadstockRowsWithReasons
      .filter(matchesDeadstockFilter)
      .filter((row) => {
        return (
          row.usedPacks === 0 ||
          row.deadstockReasons.some((reason) =>
            [
              "Есть остаток, но нет записей о движениях",
              "Закупался, но ещё не списывался",
              "Остаток не уменьшался с момента закупки",
            ].includes(reason)
          )
        );
      })
      .sort((a, b) => b.deadstockScore - a.deadstockScore);

    const slowStockRows = deadstockRowsWithReasons
      .filter(matchesDeadstockFilter)
      .filter((row) => {
        const isAlreadyInDeadStock = deadStockRows.some(
          (deadRow) => String(deadRow.id) === String(row.id)
        );

        if (isAlreadyInDeadStock) {
          return false;
        }

        return (
          row.deadstockReasons.some((reason) =>
            reason.includes("Не списывался") ||
            reason.includes("Не закупался") ||
            reason.includes("Слабое использование")
          ) ||
          (row.usedPacks > 0 && row.usedPacks / row.purchasedPacks <= 0.25)
        );
      })
      .sort((a, b) => b.deadstockScore - a.deadstockScore);

    const openFlavorInInventory = (row) => {
      setSearchText(row.name);
      setSelectedTag("all");
      setStatusFilter("all");
      setOpenBrandName(row.brand);
      setOpenFlavorId(row.id);
      setCurrentView("inventory");
    };

    return (
      <div className="app">
        {renderAppHeader({
          title: "Залежи",
          subtitle: "Вкусы, которые лежат на полке, давно не двигались или слабо используются",
        })}

        <main className="content deadstock-page">
          <section className="deadstock-filter-panel">
            {[
              ["all", "Все"],
              ["noMovement", "Нет движений"],
              ["noWriteOff", "Не списывались 30+ дней"],
              ["noSupply", "Не закупались 45+ дней"],
              ["slowUsage", "Слабое использование"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={
                  deadstockFilter === value
                    ? "deadstock-filter-button active"
                    : "deadstock-filter-button"
                }
                onClick={() => setDeadstockFilter(value)}
              >
                {label}
              </button>
            ))}
          </section>

          <section className="analytics-grid">
            <article className="analytics-card">
              <span>Не списывались</span>
              <strong>{deadStockRows.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Слабо используются</span>
              <strong>{slowStockRows.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Пачек в залежах</span>
              <strong>
                {deadStockRows.reduce((sum, row) => sum + row.quantity, 0)}
              </strong>
            </article>

            <article className="analytics-card">
              <span>Вес в залежах</span>
              <strong>
                {formatWeight(
                  deadStockRows.reduce((sum, row) => sum + row.stockGrams, 0)
                )}
              </strong>
            </article>
          </section>

          <section className="deadstock-sections">
            <article className="deadstock-panel">
              <div className="deadstock-panel-top">
                <div>
                  <h2>Не списывались вообще</h2>
                  <p>Есть на полке, но использовано 0 пачек</p>
                </div>

                <span>{deadStockRows.length} поз.</span>
              </div>

              {deadStockRows.length === 0 && (
                <p className="info-message">Таких позиций нет</p>
              )}

              <div className="deadstock-list">
                {deadStockRows.map((row) => (
                  <article className="deadstock-card" key={row.id}>
                    <div>
                      <p className="brand">{row.brand}</p>
                      <h3>{row.name}</h3>

                      <div className="analytics-flavor-tags">
                        {row.tags.map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                      </div>

                      <div className="deadstock-reasons">
                        {row.deadstockReasons.map((reason, index) => (
                          <span key={reason}>
                            {index > 0 && <em>•</em>}
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="deadstock-stats">
                      <span>Остаток: {row.quantity} пач.</span>
                      <span>На полке: {formatWeight(row.stockGrams)}</span>
                      <span>
                        Закуплено: {row.purchasedPacks} пач. ·{" "}
                        {formatWeight(row.purchasedGrams)}
                      </span>
                      <span>Использовано: 0 пач.</span>
                    </div>

                    <div className="deadstock-actions">
                      <button onClick={() => openFlavorInInventory(row)}>
                        Открыть
                      </button>

                      {!isDemoMode && (
                        <button onClick={() => toggleDeadstockExcluded(row)}>
                          Не считать залежью
                        </button>
                      )}

                      {!isDemoMode && (
                        <button
                          className="danger"
                          onClick={() => archiveFlavor(row.id)}
                        >
                          В архив
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="deadstock-panel">
              <div className="deadstock-panel-top">
                <div>
                  <h2>Слабо используются</h2>
                  <p>Использовано 25% или меньше от закупленного</p>
                </div>

                <span>{slowStockRows.length} поз.</span>
              </div>

              {slowStockRows.length === 0 && (
                <p className="info-message">Таких позиций нет</p>
              )}

              <div className="deadstock-list">
                {slowStockRows.map((row) => {
                  const usageRate = Math.round(
                    (row.usedPacks / row.purchasedPacks) * 100
                  );

                  return (
                    <article className="deadstock-card" key={row.id}>
                      <div>
                        <p className="brand">{row.brand}</p>
                        <h3>{row.name}</h3>

                        <div className="analytics-flavor-tags">
                          {row.tags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>

                        <div className="deadstock-reasons">
                          {row.deadstockReasons.map((reason, index) => (
                            <span key={reason}>
                              {index > 0 && <em>•</em>}
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="deadstock-stats">
                        <span>Остаток: {row.quantity} пач.</span>
                        <span>Использовано: {usageRate}%</span>
                        <span>
                          Закуплено: {row.purchasedPacks} пач. ·{" "}
                          {formatWeight(row.purchasedGrams)}
                        </span>
                        <span>
                          Использовано: {row.usedPacks} пач. ·{" "}
                          {formatWeight(row.usedGrams)}
                        </span>
                      </div>

                      <div className="deadstock-actions">
                        <button onClick={() => openFlavorInInventory(row)}>
                          Открыть
                        </button>

                        {!isDemoMode && (
                          <button onClick={() => toggleDeadstockExcluded(row)}>
                            Не считать залежью
                          </button>
                        )}

                        {!isDemoMode && (
                          <button
                            className="danger"
                            onClick={() => archiveFlavor(row.id)}
                          >
                            В архив
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          </section>
        </main>
      </div>
    );
  }

  
  if (currentView === "dataQuality") {
    return (
      <div className="app">
        {renderAppHeader({
          title: "Проверка базы",
          subtitle: "Проблемные данные, дубли, пустые теги и ошибки поставок",
        })}

        <main className="content data-quality-page">
          <section className="analytics-grid data-quality-summary-grid">
            <article
              className={
                dataQualityTotalIssues > 0
                  ? "analytics-card clickable"
                  : "analytics-card muted"
              }
              onClick={() => {
                if (dataQualityTotalIssues > 0) {
                  setOpenDataQualityIssue(visibleDataQualityIssues[0]?.key || null);
                }
              }}
            >
              <span>Всего замечаний</span>
              <strong>{dataQualityTotalIssues}</strong>
            </article>

            <article
              className={
                dataQualityData.duplicateFlavorGroups.length > 0
                  ? "analytics-card clickable"
                  : "analytics-card muted"
              }
              onClick={() => {
                if (dataQualityData.duplicateFlavorGroups.length > 0) {
                  setOpenDataQualityIssue("duplicateFlavors");
                }
              }}
            >
              <span>Дубли вкусов</span>
              <strong>{dataQualityData.duplicateFlavorGroups.length}</strong>
            </article>

            <article
              className={
                dataQualityData.flavorsWithoutTagsInStock.length +
                  dataQualityData.flavorsWithoutTagsOutOfStock.length >
                0
                  ? "analytics-card clickable"
                  : "analytics-card muted"
              }
              onClick={() => {
                const noTagsTotal =
                  dataQualityData.flavorsWithoutTagsInStock.length +
                  dataQualityData.flavorsWithoutTagsOutOfStock.length;

                if (noTagsTotal > 0) {
                  setOpenDataQualityIssue(
                    dataQualityData.flavorsWithoutTagsInStock.length > 0
                      ? "noTagsInStock"
                      : "noTagsOutOfStock"
                  );
                }
              }}
            >
              <span>Без тегов</span>
              <strong>
                {dataQualityData.flavorsWithoutTagsInStock.length +
                  dataQualityData.flavorsWithoutTagsOutOfStock.length}
              </strong>
            </article>

            <article
              className={
                dataQualityData.suppliesWithoutPrice.length +
                  dataQualityData.suppliesWithoutSupplier.length +
                  dataQualityData.suppliesWithoutDate.length +
                  dataQualityData.supplyLogsWithoutFlavor.length +
                  dataQualityData.supplyLogsWithDeletedFlavor.length >
                0
                  ? "analytics-card clickable"
                  : "analytics-card muted"
              }
              onClick={() => {
                const supplyProblemsTotal =
                  dataQualityData.suppliesWithoutPrice.length +
                  dataQualityData.suppliesWithoutSupplier.length +
                  dataQualityData.suppliesWithoutDate.length +
                  dataQualityData.supplyLogsWithoutFlavor.length +
                  dataQualityData.supplyLogsWithDeletedFlavor.length;

                if (supplyProblemsTotal > 0) {
                  setOpenDataQualityIssue(
                    dataQualityData.suppliesWithoutPrice.length > 0
                      ? "noPrice"
                      : dataQualityData.suppliesWithoutSupplier.length > 0
                        ? "noSupplier"
                        : dataQualityData.suppliesWithoutDate.length > 0
                          ? "noDate"
                          : dataQualityData.supplyLogsWithoutFlavor.length > 0
                            ? "supplyWithoutFlavor"
                            : "supplyWithDeletedFlavor"
                  );
                }
              }}
            >
              <span>Проблемные поставки</span>
              <strong>
                {dataQualityData.suppliesWithoutPrice.length +
                  dataQualityData.suppliesWithoutSupplier.length +
                  dataQualityData.suppliesWithoutDate.length +
                  dataQualityData.supplyLogsWithoutFlavor.length +
                  dataQualityData.supplyLogsWithDeletedFlavor.length}
              </strong>
            </article>
          </section>

          <section className="analytics-panel wide data-quality-panel">
            <div className="data-quality-header">
              <div>
                <span className="choice-modal-eyebrow">Проверка базы</span>
                <h2>Проблемные данные</h2>
              </div>

              <strong>
                {dataQualityTotalIssues === 0
                  ? "всё ок"
                  : `${dataQualityTotalIssues} замеч.`}
              </strong>
            </div>

            {dataQualityTotalIssues === 0 ? (
              <p className="info-message dark">
                Критичных проблем в данных не найдено.
              </p>
            ) : (
              <div className="data-quality-list">
                {visibleDataQualityIssues.map((issue) => (
                  <article className="data-quality-issue" key={issue.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenDataQualityIssue(
                          openDataQualityIssue === issue.key ? null : issue.key
                        );
                      }}
                    >
                      <span>{issue.title}</span>
                      <strong>
                        {issue.items.length}
                        {openDataQualityIssue === issue.key ? " ↑" : " ↓"}
                      </strong>
                    </button>

                    {openDataQualityIssue === issue.key && (
                      <div className="data-quality-items">
                        {issue.items.length === 0 ? (
                          <p>Проблем нет</p>
                        ) : (
                          issue.items.slice(0, 20).map((item) => (
                            <button
                              className="data-quality-item"
                              type="button"
                              key={`${item.type}-${item.id}`}
                              onClick={() => handleDataQualityItemClick(item)}
                            >
                              <span className="data-quality-item-main">
                                <strong>{item.title}</strong>
                                <span>{item.meta}</span>
                              </span>

                              <em className="data-quality-item-action">
                                {issue.key === "duplicateFlavors"
                                  ? "Проверить дубли"
                                  : issue.key === "brandVariants"
                                    ? "Исправить бренд"
                                    : issue.key === "noTagsInStock" ||
                                        issue.key === "noTagsOutOfStock"
                                      ? "Добавить теги"
                                      : issue.key === "noPacks"
                                        ? "Добавить фасовку"
                                        : issue.key === "brokenPurchased"
                                          ? "Проверить фасовки"
                                          : issue.key === "noPrice"
                                            ? "Указать цену"
                                            : issue.key === "noSupplier"
                                              ? "Указать поставщика"
                                              : issue.key === "noDate"
                                                ? "Указать дату"
                                                : item.type === "flavor"
                                                  ? "Открыть вкус"
                                                  : "Исправить поставку"}
                              </em>
                            </button>
                          ))
                        )}

                        {issue.items.length > 20 && (
                          <p>Показаны первые 20 из {issue.items.length}</p>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

if (currentView === "purchase") {
    const purchaseRows = purchaseFlavors.map((flavor) => {
      const total = getTotalQuantity(flavor.packs || []);
      const status = getStatus(flavor);
      const specificTags = getSpecificTags(flavor);
      const analogs = getAnalogFlavors(flavor);
      const isPurchaseConfirmed = Boolean(
        flavor.purchaseConfirmed || flavor.purchase_confirmed
      );

      return {
        flavor,
        total,
        status,
        specificTags,
        analogs,
        isPurchaseConfirmed,
      };
    });

    const confirmedRows = purchaseRows.filter(
      (row) => row.isPurchaseConfirmed
    );

    const urgentRows = purchaseRows.filter(
      (row) => !row.isPurchaseConfirmed && row.analogs.length === 0
    );

    const analogRows = purchaseRows.filter(
      (row) => !row.isPurchaseConfirmed && row.analogs.length > 0
    );

    const purchaseSections = [
      {
        title: "Подтверждённые позиции",
        subtitle: "То, что точно нужно докупить",
        rows: confirmedRows,
      },
      {
        title: "Важно докупить",
        subtitle: "Нет аналогов по специфичным тегам",
        rows: urgentRows,
      },
      {
        title: "Проверить аналоги",
        subtitle: "Есть похожие вкусы на полке",
        rows: analogRows,
      },
    ].filter((section) => section.rows.length > 0);

    return (
      <div className="app">
        {renderAppHeader({
          title: "Закупка",
          subtitle:
            "Умная сортировка позиций: подтверждённые, срочные и с аналогами",
        })}

        <main className="content purchase-page">
          <section className="analytics-grid">
            <article className="analytics-card">
              <span>Всего к закупке</span>
              <strong>{purchaseRows.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Подтверждено</span>
              <strong>{confirmedRows.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Без аналогов</span>
              <strong>{urgentRows.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Есть аналоги</span>
              <strong>{analogRows.length}</strong>
            </article>
          </section>

          {purchaseRows.length === 0 && (
            <p className="info-message">
              Сейчас нет позиций, которые требуется закупить.
            </p>
          )}

          <section className="purchase-smart-sections">
            {purchaseSections.map((section) => (
              <article className="purchase-smart-section" key={section.title}>
                <div className="purchase-smart-section-top">
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.subtitle}</p>
                  </div>

                  <span>{section.rows.length} поз.</span>
                </div>

                <div className="purchase-smart-list">
                  {section.rows.map(
                    ({
                      flavor,
                      total,
                      status,
                      specificTags,
                      analogs,
                      isPurchaseConfirmed,
                    }) => (
                      <article className="purchase-smart-card" key={flavor.id}>
                        <div className="purchase-smart-card-main">
                          <div>
                            <p className="brand">{flavor.brand}</p>
                            <h3>{flavor.name}</h3>

                            <span className={status.className}>
                              {status.text}
                            </span>
                          </div>

                          <strong>{total} пач.</strong>
                        </div>

                        {specificTags.length > 0 && (
                          <div className="purchase-specific-tags">
                            <span>Ключевые теги:</span>
                            {specificTags.map((tag) => (
                              <strong key={tag}>#{tag}</strong>
                            ))}
                          </div>
                        )}

                        {analogs.length > 0 && (
                          <div className="purchase-analogs">
                            <p>Аналоги:</p>

                            {analogs.map(
                              ({ flavor: analog, matchedTags, totalQuantity }) => (
                                <div
                                  className="purchase-analog-item"
                                  key={analog.id}
                                >
                                  <span>
                                    {analog.brand} — {analog.name}
                                  </span>

                                  <small>
                                    Остаток: {totalQuantity} пач. ·{" "}
                                    {matchedTags
                                      .map((tag) => `#${tag}`)
                                      .join(", ")}
                                  </small>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {!isDemoMode && (
                          <div className="purchase-smart-actions">
                            <button
                              onClick={() => togglePurchaseConfirmed(flavor)}
                            >
                              {isPurchaseConfirmed
                                ? "Снять подтверждение"
                                : "Подтвердить закупку"}
                            </button>

                            <button
                              className="danger"
                              onClick={() => archiveFlavor(flavor.id)}
                            >
                              В архив
                            </button>

                            <button onClick={() => startSupplyForFlavor(flavor)}>
                              Добавить поставку
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  )}
                </div>
              </article>
            ))}
          </section>
        </main>
      </div>
    );
  }

  if (currentView === "tags") {
    return (
      <div className="app">
        {renderAppHeader({
          title: "Теги",
          subtitle: "Карта вкусовых тегов и поиск дублей",
        })}

        <main className="content tags-page">
          <section className="analytics-grid">
            <article className="analytics-card">
              <span>Всего тегов</span>
              <strong>{tagRows.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Возможных дублей</span>
              <strong>{tagDuplicateGroups.length}</strong>
            </article>

            <article className="analytics-card">
              <span>Самый частый тег</span>
              <strong>{tagRows[0]?.tag || "—"}</strong>
            </article>
          </section>

          {tagDuplicateGroups.length > 0 && (
            <section className="tag-duplicates-panel">
              <h2>Возможные дубли тегов</h2>

              <div className="tag-duplicate-list">
                {tagDuplicateGroups.map((group) => (
                  <article className="tag-duplicate-group" key={group.key}>
                    <div>
                      <strong>
                        {group.items.map((item) => `#${item.tag}`).join(", ")}
                      </strong>

                      <p>
                        Будет объединено в #{group.items[0].tag}
                      </p>
                    </div>

                    {!isDemoMode && (
                      <button
                        className="submit-button small"
                        onClick={() => mergeTagGroup(group)}
                      >
                        Объединить
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="tags-table-panel">
            <h2>Топ основных тегов</h2>
            <p className="form-hint">
              Сначала показан топ-3. Остальные основные вкусовые категории можно раскрыть списком.
            </p>

            <div className="tags-table">
              {mainTasteTagRows.length === 0 && (
                <p className="info-message dark">Основные теги пока не используются</p>
              )}

              {(isMainTagsExpanded ? mainTasteTagRows : mainTasteTagRows.slice(0, 3)).map((row) => (
                <article className="tag-row-card" key={row.tag}>
                  <div>
                    <strong>#{row.tag}</strong>

                    <span>
                      {row.flavorCount} вкусов · активных:{" "}
                      {row.activeFlavorCount} · архив:{" "}
                      {row.archivedFlavorCount} · остаток: {row.totalPacks} пач.
                    </span>
                  </div>

                  <button
                    className="secondary-button dark"
                    onClick={() => {
                      setSearchText("");
                      setStatusFilter("all");
                      setSelectedTag(row.tag);
                      setOpenBrandName("");
                      setOpenFlavorId(null);
                      setCurrentView("inventory");
                    }}
                  >
                    Показать
                  </button>
                </article>
              ))}
            </div>

            {mainTasteTagRows.length > 3 && (
              <button
                type="button"
                className="secondary-button dark"
                onClick={() => setIsMainTagsExpanded((currentValue) => !currentValue)}
              >
                {isMainTagsExpanded
                  ? "Свернуть"
                  : `Показать все ${mainTasteTagRows.length}`}
              </button>
            )}
          </section>

          <section className="tags-table-panel">
            <h2>Топ остальных тегов</h2>
            <p className="form-hint">
              Сначала показан топ-3 дополнительных тегов. Остальные можно раскрыть списком.
            </p>

            <div className="tags-table">
              {otherTagRows.length === 0 && (
                <p className="info-message dark">Дополнительные теги пока не используются</p>
              )}

              {(isOtherTagsExpanded ? otherTagRows : otherTagRows.slice(0, 3)).map((row) => (
                <article className="tag-row-card" key={row.tag}>
                  <div>
                    <strong>#{row.tag}</strong>

                    <span>
                      {row.flavorCount} вкусов · активных:{" "}
                      {row.activeFlavorCount} · архив:{" "}
                      {row.archivedFlavorCount} · остаток: {row.totalPacks} пач.
                    </span>
                  </div>

                  <button
                    className="secondary-button dark"
                    onClick={() => {
                      setSearchText("");
                      setStatusFilter("all");
                      setSelectedTag(row.tag);
                      setOpenBrandName("");
                      setOpenFlavorId(null);
                      setCurrentView("inventory");
                    }}
                  >
                    Показать
                  </button>
                </article>
              ))}
            </div>

            {otherTagRows.length > 3 && (
              <button
                type="button"
                className="secondary-button dark"
                onClick={() => setIsOtherTagsExpanded((currentValue) => !currentValue)}
              >
                {isOtherTagsExpanded
                  ? "Свернуть"
                  : `Показать все ${otherTagRows.length}`}
              </button>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (currentView === "duplicates") {
    return (
      <div className="app">
        {renderAppHeader({
          title: "Дубли вкусов",
          subtitle: "Поиск одинаковых записей по бренду и названию",
        })}

        <main className="content">
          <section className="duplicates-panel">
            <div className="history-panel-top">
              <div>
                <p className="eyebrow dark">Дубли</p>
                <h2>Найдено групп дублей: {duplicateGroups.length}</h2>
              </div>
            </div>

            {brandDuplicateGroups.length > 0 && (
                <section className="brand-variant-panel">
                  <div className="brand-variant-panel-header">
                    <div>
                      <p className="eyebrow dark">Бренды</p>
                      <h2>
                        Варианты написания брендов: {brandDuplicateGroups.length}
                      </h2>
                    </div>

                    <p className="brand-variant-description">
                      Это не точные дубли вкусов, а разные написания одного бренда.
                      Выбери основной вариант, и приложение приведёт все позиции бренда к нему.
                    </p>
                  </div>

                  <div className="brand-variant-list">
                    {brandDuplicateGroups.map((group) => (
                      <article className="brand-variant-card" key={group.key}>
                        <div className="brand-variant-card-main">
                          <h3>
                            {group.variants.map((variant) => variant.name).join(" / ")}
                          </h3>

                          <p>
                            Всего позиций с этим брендом: {group.flavors.length}
                          </p>

                          <div className="brand-variant-tags">
                            {group.variants.map((variant) => (
                              <span key={variant.name}>
                                {variant.name}: {variant.count}
                              </span>
                            ))}
                          </div>
                        </div>

                        {!isDemoMode && (
                          <div className="brand-variant-actions">
                            {group.variants.map((variant) => (
                              <button
                                type="button"
                                className="secondary-button"
                                key={variant.name}
                                onClick={() =>
                                  mergeBrandVariantGroup(group, variant.name)
                                }
                              >
                                Привести к “{variant.name}”
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

            {duplicateGroups.length === 0 && (
              <p className="info-message">
                Точные дубли вкусов не найдены. Варианты написания брендов показаны отдельно.
              </p>
            )}

            <div className="duplicate-list">
              {duplicateGroups.map((group) => (
                <article className="duplicate-group" key={group.key}>
                  <div className="duplicate-group-top">
                    <div>
                      <h3>
                        {group.items[0].brand} — {group.items[0].name}
                      </h3>

                      <p>{group.items.length} записей</p>
                    </div>

                    {!isDemoMode && (
                      <button
                        className="submit-button small"
                        onClick={() => mergeDuplicateGroup(group)}
                      >
                        Объединить
                      </button>
                    )}
                  </div>

                  <div className="duplicate-items">
                    {group.items.map((flavor, index) => (
                      <div className="duplicate-item" key={flavor.id}>
                        <strong>
                          {index === 0 ? "Основная: " : "Дубль: "}
                          {flavor.brand} — {flavor.name}
                        </strong>

                        <span>
                          {(flavor.packs || [])
                            .map((pack) => `${pack.weight}: ${pack.quantity} пач.`)
                            .join(" · ")}
                        </span>

                        <small>
                          {(flavor.tags || []).map((tag) => `#${tag}`).join(", ")}
                        </small>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  const getHistoryActionGroup = (log) => {
    if (!log) {
      return "other";
    }

    if (log.action === "backup_created") {
      return "backup";
    }

    if (log.action === "backup_restored") {
      return "restore";
    }

    if (log.action === "supply" && isCancelledSupplyLog(log)) {
      return "cancelled";
    }

    if (log.action === "supply") {
      return "supply";
    }

    if (
      String(log.action || "").includes("decrease") ||
      String(log.action || "").includes("write") ||
      String(log.action || "").includes("clear")
    ) {
      return "write_off";
    }

    if (
      String(log.action || "").includes("edit") ||
      String(log.action || "").includes("update") ||
      String(log.action || "").includes("merge") ||
      String(log.action || "").includes("bulk")
    ) {
      return "changes";
    }

    return "other";
  };

  const isHistoryLogInPeriod = (log) => {
    if (historyPeriodFilter === "all") {
      return true;
    }

    const value = log.createdAt || log.created_at;
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (historyPeriodFilter === "today") {
      return date.toDateString() === now.toDateString();
    }

    if (historyPeriodFilter === "7days") {
      return diffDays <= 7;
    }

    if (historyPeriodFilter === "30days") {
      return diffDays <= 30;
    }

    return true;
  };

  const filteredHistoryLogs = actionLogs.filter((log) => {
    const actionMatches =
      historyActionFilter === "all" ||
      getHistoryActionGroup(log) === historyActionFilter;

    const periodMatches = isHistoryLogInPeriod(log);

    const search = historySearchText.trim().toLowerCase();

    if (!search) {
      return actionMatches && periodMatches;
    }

    const detailsText = formatActionDetails(log) || "";
    const titleText = getHistoryActionTitle(log.action, log) || "";

    const haystack = [
      log.action,
      log.brand,
      log.name,
      titleText,
      detailsText,
      JSON.stringify(parseActionDetails(log.details || {})),
    ]
      .join(" ")
      .toLowerCase();

    return actionMatches && periodMatches && haystack.includes(search);
  });

  if (currentView === "history") {
    return (
      <div className="app">
        {renderAppHeader({
          title: "История действий",
          subtitle: "Последние изменения склада, закупки и архива",
        })}

        <main className="content">
          <section className="history-panel">
            <div className="history-panel-top">
              <h2>
                Последние действия · показано {filteredHistoryLogs.length} из {actionLogs.length}
              </h2>

              <button className="secondary-button" onClick={loadActionLogs}>
                Обновить
              </button>
            </div>

            <div className="history-filters">
              <input
                className="search-input"
                type="search"
                placeholder="Поиск по истории: бренд, вкус, поставщик, детали"
                value={historySearchText}
                onChange={(event) => setHistorySearchText(event.target.value)}
              />

              <select
                value={historyActionFilter}
                onChange={(event) => setHistoryActionFilter(event.target.value)}
              >
                <option value="all">Все действия</option>
                <option value="supply">Поставки</option>
                <option value="cancelled">Отменённые поставки</option>
                <option value="backup">Backup создан</option>
                <option value="restore">Backup восстановлен</option>
                <option value="write_off">Списания / уменьшения</option>
                <option value="changes">Изменения / объединения</option>
                <option value="other">Остальное</option>
              </select>

              <select
                value={historyPeriodFilter}
                onChange={(event) => setHistoryPeriodFilter(event.target.value)}
              >
                <option value="all">За всё время</option>
                <option value="today">Сегодня</option>
                <option value="7days">7 дней</option>
                <option value="30days">30 дней</option>
              </select>

              {(historySearchText || historyActionFilter !== "all" || historyPeriodFilter !== "all") && (
                <button
                  className="secondary-button small"
                  type="button"
                  onClick={() => {
                    setHistorySearchText("");
                    setHistoryActionFilter("all");
                    setHistoryPeriodFilter("all");
                  }}
                >
                  Сбросить
                </button>
              )}
            </div>

            {actionLogs.length === 0 && (
              <p className="info-message">История пока пустая</p>
            )}

            {actionLogs.length > 0 && filteredHistoryLogs.length === 0 && (
              <p className="info-message">По выбранным фильтрам ничего не найдено</p>
            )}

            <div className="history-list">
              {filteredHistoryLogs.map((log) => (
                <article className="history-item" key={log.id}>
                  <div>
                    <span className="history-time">
                      {formatActionTime(log.createdAt || log.created_at)}
                    </span>

                    <strong>
                      {getHistoryActionTitle(log.action, log)}
                    </strong>

                    {(log.brand || log.name) && (
                      <p>
                        {log.brand}
                        {log.brand && log.name ? " — " : ""}
                        {log.name}
                      </p>
                    )}

                    {formatActionDetails(log) && (
                      <small>{formatActionDetails(log)}</small>
                    )}

                    {!isDemoMode && log.action === "supply" && !isCancelledSupplyLog(log) && (
                      <button
                        className="secondary-button small"
                        type="button"
                        onClick={() => editSupplyLog(log)}
                      >
                        Исправить
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (currentView === "analytics") {
    return (
      <div className="app">
        {renderAppHeader({
          title: "Аналитика",
          subtitle: "Сводка по складу, остаткам и закупленному весу",
        })}

        <main className="content analytics-page">
          <section className="analytics-grid">
            <article
              className={
                analyticsFilter === "all"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("all")}
            >
              <span>Вкусов в базе</span>
              <strong>{analyticsData.activeFlavorsCount}</strong>
            </article>

            <article
              className={
                analyticsFilter === "inStock"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("inStock")}
            >
              <span>В наличии</span>
              <strong>{analyticsData.inStockCount}</strong>
            </article>

            <article
              className={
                analyticsFilter === "absent"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("absent")}
            >
              <span>Отсутствует</span>
              <strong>{analyticsData.absentCount}</strong>
            </article>

            <article
              className={
                analyticsFilter === "lowStock"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("lowStock")}
            >
              <span>Мало осталось</span>
              <strong>{analyticsData.lowStockCount}</strong>
            </article>

            <article
              className={
                analyticsFilter === "packs"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("packs")}
            >
              <span>Пачек на полке</span>
              <strong>{analyticsData.totalPacks}</strong>
            </article>

            <article
              className={
                analyticsFilter === "stockWeight"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("stockWeight")}
            >
              <span>Вес на полке</span>
              <strong>{formatWeight(analyticsData.totalStockGrams)}</strong>
            </article>

            <article
              className={
                analyticsFilter === "purchased"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("purchased")}
            >
              <span>Закуплено</span>
              <strong>{formatWeight(analyticsData.totalPurchasedGrams)}</strong>
            </article>

            <article
              className={
                analyticsFilter === "used"
                  ? "analytics-card clickable active"
                  : "analytics-card clickable"
              }
              onClick={() => setAnalyticsFilter("used")}
            >
              <span>Использовано</span>
              <strong>{formatWeight(analyticsData.totalUsedGrams)}</strong>
            </article>
          </section>

          <section className="analytics-period-panel">
            <span>Период финансовой аналитики</span>

            <div>
              {[
                ["all", "Все время"],
                ["30d", "30 дней"],
                ["3m", "3 месяца"],
                ["1y", "Год"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={analyticsPeriod === value ? "active" : ""}
                  onClick={() => setAnalyticsPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="analytics-grid finance-grid">
            <article className="analytics-card">
              <span>Потрачено на закупки</span>
              <strong>
                {purchaseFinanceData.totalSpent.toLocaleString("ru-RU")} ₽
              </strong>
            </article>

            <article className="analytics-card">
              <span>Пачек с указанной ценой</span>
              <strong>{purchaseFinanceData.totalPacks}</strong>
            </article>

            <article className="analytics-card">
              <span>Средняя цена пачки</span>
              <strong>
                {Math.round(purchaseFinanceData.averagePackPrice).toLocaleString("ru-RU")} ₽
              </strong>
            </article>

            <article className="analytics-card">
              <span>Поставок с ценой</span>
              <strong>{purchaseFinanceData.rows.length}</strong>
            </article>
          </section>

          {purchaseFinanceData.rows.length === 0 && (
            <p className="info-message">
              Финансовая аналитика появится после поставок с заполненной ценой за пачку.
            </p>
          )}

          <section className="analytics-sections finance-sections">
            <article className="analytics-panel">
              <h2>Топ брендов по сумме закупки</h2>

              {purchaseFinanceData.byBrand.length === 0 && (
                <p className="info-message dark">Пока нет данных по ценам</p>
              )}

              {purchaseFinanceData.byBrand.slice(0, 8).map((item) => (
                <div className="analytics-row" key={item.name}>
                  <span>
                    {item.name} · {item.quantity} пач. ·{" "}
                    {formatWeight(item.grams)} ·{" "}
                    {item.averagePricePerGram
                      ? `${item.averagePricePerGram.toFixed(2).replace(".", ",")} ₽/г`
                      : "цена/г не рассчитана"}
                  </span>
                  <strong>{item.total.toLocaleString("ru-RU")} ₽</strong>
                </div>
              ))}
            </article>

            <article className="analytics-panel">
              <h2>Топ поставщиков по сумме закупки</h2>

              {purchaseFinanceData.bySupplier.length === 0 && (
                <p className="info-message dark">Пока нет данных по поставщикам</p>
              )}

              {purchaseFinanceData.bySupplier.slice(0, 8).map((item) => (
                <div className="analytics-row" key={item.name}>
                  <span>
                    {item.name} · {item.quantity} пач.
                  </span>
                  <strong>{item.total.toLocaleString("ru-RU")} ₽</strong>
                </div>
              ))}
            </article>
          </section>

          {(purchaseFinanceData.priceIncreases.length > 0 ||
            purchaseFinanceData.priceDecreases.length > 0) && (
            <section className="analytics-sections price-change-sections">
              <article className="analytics-panel">
                <h2>Подорожали</h2>

                {purchaseFinanceData.priceIncreases.length === 0 && (
                  <p className="info-message dark">Подорожаний пока нет</p>
                )}

                {purchaseFinanceData.priceIncreases.slice(0, 6).map((row) => (
                  <div className="analytics-row price-change-analytics-row" key={`up-${row.id}`}>
                    <span>
                      {row.brand} — {row.name} · {row.weight}
                      <em>
                        было {row.priceChange.previousPrice.toLocaleString("ru-RU")} ₽,
                        стало {row.price.toLocaleString("ru-RU")} ₽
                      </em>
                    </span>

                    <strong className="price-up">
                      +{Math.round(row.priceChange.difference).toLocaleString("ru-RU")} ₽ ·{" "}
                      +{Math.round(row.priceChange.percent)}%
                    </strong>
                  </div>
                ))}
              </article>

              <article className="analytics-panel">
                <h2>Подешевели</h2>

                {purchaseFinanceData.priceDecreases.length === 0 && (
                  <p className="info-message dark">Снижений пока нет</p>
                )}

                {purchaseFinanceData.priceDecreases.slice(0, 6).map((row) => (
                  <div className="analytics-row price-change-analytics-row" key={`down-${row.id}`}>
                    <span>
                      {row.brand} — {row.name} · {row.weight}
                      <em>
                        было {row.priceChange.previousPrice.toLocaleString("ru-RU")} ₽,
                        стало {row.price.toLocaleString("ru-RU")} ₽
                      </em>
                    </span>

                    <strong className="price-down">
                      {Math.round(row.priceChange.difference).toLocaleString("ru-RU")} ₽ ·{" "}
                      {Math.round(row.priceChange.percent)}%
                    </strong>
                  </div>
                ))}
              </article>
            </section>
          )}

                    {purchaseFinanceData.rows.length > 0 && (
            <section className="analytics-panel wide finance-history-panel">
              <button
                className="finance-history-toggle"
                type="button"
                onClick={() => setIsFinanceHistoryOpen(!isFinanceHistoryOpen)}
              >
                <span>Последние закупки с ценой</span>
                <strong>
                  {purchaseFinanceData.rows.length} записей{" "}
                  {isFinanceHistoryOpen ? "↑" : "↓"}
                </strong>
              </button>

              {isFinanceHistoryOpen && (
                <div className="finance-history-list">
                  {purchaseFinanceData.rows.slice(0, 12).map((row) => (
                    <article className="finance-history-row" key={row.id}>
                      <div>
                        <strong>{row.brand} — {row.name}</strong>
                        <span>
                          {row.supplier} · {row.weight} · {row.quantity} пач. ×{" "}
                          {row.price.toLocaleString("ru-RU")} ₽
                        </span>

                        {row.priceChange ? (
                          <em className={`price-change-badge ${row.priceChange.direction}`}>
                            {row.priceChange.direction === "up" && "↑ "}
                            {row.priceChange.direction === "down" && "↓ "}
                            {row.priceChange.direction === "same" && "→ "}
                            {row.priceChange.difference > 0 ? "+" : ""}
                            {Math.round(row.priceChange.difference).toLocaleString("ru-RU")} ₽ ·{" "}
                            {row.priceChange.percent > 0 ? "+" : ""}
                            {Math.round(row.priceChange.percent)}%
                            {" "}к прошлой поставке этой фасовки
                          </em>
                        ) : (
                          <em className="price-change-badge first">
                            первая цена для этой фасовки
                          </em>
                        )}
                      </div>

                      <strong>{row.total.toLocaleString("ru-RU")} ₽</strong>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="analytics-sections">
            <article className="analytics-panel">
              <h2>Топ брендов по общему весу</h2>
              {analyticsData.topBrandStock.map((item) => (
                <div className="analytics-row" key={item.name}>
                  <span>{item.name}</span>
                  <strong>{formatWeight(item.grams)}</strong>
                </div>
              ))}
            </article>

            <article className="analytics-panel">
              <h2>Топ тегов по общему весу</h2>
              {analyticsData.topTagStock.map((item) => (
                <div className="analytics-row" key={item.name}>
                  <span>#{item.name}</span>
                  <strong>{formatWeight(item.grams)}</strong>
                </div>
              ))}
            </article>

            <article className="analytics-panel wide">
              <h2>{analyticsFilterTitle}</h2>
              <p className="analytics-note">
                Нажми на любую панель сверху, чтобы изменить список.
              </p>

              {analyticsRows.length === 0 && (
                <p className="info-message dark">Нет данных для отображения</p>
              )}

              {groupedAnalyticsRowsByBrand.map((group) => {
                const isBrandOpen = openAnalyticsBrandName === group.brand;

                return (
                  <div className="analytics-brand-group" key={group.brand}>
                    <button
                      className={
                        isBrandOpen
                          ? "analytics-brand-row open"
                          : "analytics-brand-row"
                      }
                      onClick={() => {
                        setOpenAnalyticsBrandName(
                          isBrandOpen ? "" : group.brand
                        );
                        setOpenAnalyticsFlavorId(null);
                      }}
                    >
                      <div>
                        <strong>{group.brand}</strong>
                        <span>
                          {group.rows.length} вкусов · остаток:{" "}
                          {group.totalQuantity} пач.
                        </span>
                      </div>

                      <div className="analytics-brand-meta">
                        {group.absentCount > 0 && (
                          <span className="brand-alert">
                            отсутствует: {group.absentCount}
                          </span>
                        )}

                        {group.lowStockCount > 0 && (
                          <span className="brand-warning">
                            мало: {group.lowStockCount}
                          </span>
                        )}

                        <span>{formatWeight(group.totalPurchasedGrams)}</span>
                        <em>{isBrandOpen ? "↑" : "↓"}</em>
                      </div>
                    </button>

                    {isBrandOpen && (
                      <div className="analytics-flavor-list">
                        {group.rows.map((row) => {
                          const isFlavorOpen =
                            openAnalyticsFlavorId === row.id;

                          return (
                            <div
                              className={
                                isFlavorOpen
                                  ? "analytics-flavor-accordion-row open"
                                  : "analytics-flavor-accordion-row"
                              }
                              key={row.id}
                            >
                              <button
                                className="analytics-flavor-button"
                                onClick={() =>
                                  setOpenAnalyticsFlavorId(
                                    isFlavorOpen ? null : row.id
                                  )
                                }
                              >
                                <div>
                                  <strong>{row.name}</strong>
                                  <span>
                                    Остаток: {row.quantity} пач. · На полке:{" "}
                                    {formatWeight(row.stockGrams)}
                                  </span>
                                </div>

                                <div className="analytics-flavor-button-meta">
                                  {row.archived && <span>архив</span>}
                                  {row.lowStock && <span>мало</span>}
                                  <em>{isFlavorOpen ? "↑" : "↓"}</em>
                                </div>
                              </button>

                              {isFlavorOpen && (
                                <div className="analytics-flavor-details">
                                  <div className="analytics-flavor-tags">
                                    {row.archived && <span>архив</span>}
                                    {row.lowStock && <span>мало осталось</span>}
                                    {row.tags.map((tag) => (
                                      <span key={tag}>#{tag}</span>
                                    ))}
                                  </div>

                                  <div className="analytics-flavor-stats">
                                    <span>Остаток: {row.quantity} пач.</span>
                                    <span>
                                      На полке: {formatWeight(row.stockGrams)}
                                    </span>
                                    <span>
                                      Закуплено: {row.purchasedPacks} пач. ·{" "}
                                      {formatWeight(row.purchasedGrams)}
                                    </span>
                                    <span>
                                      Использовано: {row.usedPacks} пач. ·{" "}
                                      {formatWeight(row.usedGrams)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

            </article>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {renderAppHeader({
        title: "Склад табака",
        subtitle: "Отслеживание вкусов, фасовок, остатков и закупки",
        isInventory: true,
      })}

      <main className="content">
        <datalist id="brand-options">
          {brandSuggestions.map((brand) => (
            <option value={brand} key={brand} />
          ))}
        </datalist>

        <datalist id="flavor-options">
          {flavorSuggestions.map((flavorName) => (
            <option value={flavorName} key={flavorName} />
          ))}
        </datalist>

        <datalist id="weight-options">
          {weightSuggestions.map((weight) => (
            <option value={weight} key={weight} />
          ))}
        </datalist>

        <datalist id="supplier-options">
          {supplierSuggestions.map((supplier) => (
            <option value={supplier} key={supplier} />
          ))}
        </datalist>

        <datalist id="price-options">
          {priceSuggestions.map((price) => (
            <option value={price} key={price} />
          ))}
        </datalist>

        {isImportPreviewOpen && (
          <section className="supply-panel import-preview-panel">
            <div className="supply-panel-top">
              <div>
                <p className="eyebrow dark">Предпросмотр импорта</p>
                <h2>{pendingImportFileName}</h2>
              </div>

              <button className="close-button" onClick={cancelImportPreview}>
                Закрыть
              </button>
            </div>

            <div className="import-preview-summary">
              <article>
                <span>Строк найдено</span>
                <strong>{pendingImportRows.length}</strong>
              </article>

              <article>
                <span>Уже есть в базе</span>
                <strong>{importPreviewExistingCount}</strong>
              </article>

              <article>
                <span>Новых позиций</span>
                <strong>{importPreviewNewCount}</strong>
              </article>

              <article>
                <span>Проблемных строк</span>
                <strong>{importPreviewProblemCount}</strong>
              </article>
            </div>

            {importPreviewProblemCount > 0 && (
              <div className="import-preview-controls">
                <button
                  type="button"
                  className={showOnlyImportProblems ? "active" : ""}
                  onClick={() =>
                    setShowOnlyImportProblems((currentValue) => !currentValue)
                  }
                >
                  {showOnlyImportProblems
                    ? "Показать все строки"
                    : "Показать только проблемные строки"}
                </button>

                <span>
                  Проблемных строк: {importPreviewProblemCount}
                </span>
              </div>
            )}

            <div className="import-preview-table-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th>Бренд</th>
                    <th>Вкус</th>
                    <th>Фасовка</th>
                    <th>Кол-во</th>
                    <th>Дата</th>
                    <th>Поставщик</th>
                    <th>Цена</th>
                    <th>Теги</th>
                    <th>Проверка</th>
                  </tr>
                </thead>

                <tbody>
                  {importPreviewVisibleRows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.brand}-${row.name}-${row.weight}-${index}`}>
                      <td>{row.brand}</td>
                      <td>
                        <strong>{row.name}</strong>
                        {row.originalName &&
                          normalizeDuplicateKey(row.originalName) !== normalizeDuplicateKey(row.name) && (
                            <small className="import-original-name">
                              было: {row.originalName}
                            </small>
                          )}
                      </td>
                      <td>{row.weight}</td>
                      <td>{row.quantity}</td>
                      <td>{row.supplyDate || "—"}</td>
                      <td>{row.supplier || "—"}</td>
                      <td>{row.price ? `${row.price} ₽` : "—"}</td>
                      <td>{row.tags}</td>
                      <td>
                        <div className="import-warning-list">
                          {row.warnings.map((warning) => (
                            <span
                              className={
                                ["количество 0", "нет даты", "нет поставщика", "нет цены"].includes(warning)
                                  ? "import-warning-badge problem"
                                  : "import-warning-badge"
                              }
                              key={warning}
                            >
                              {warning}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importPreviewVisibleRows.length > 20 && (
              <p className="form-hint">
                Показаны первые 20 строк из {importPreviewVisibleRows.length}.
              </p>
            )}

            <div className="import-preview-actions">
              <button
                className="submit-button"
                onClick={confirmImportPreview}
                disabled={isLoading}
              >
                {isLoading ? "Импортируем..." : "Подтвердить импорт"}
              </button>

              <button className="close-button" onClick={cancelImportPreview}>
                Отменить
              </button>
            </div>
          </section>
        )}

        {isSupplyFormOpen && (
          <section className="supply-panel">
            <div className="supply-panel-top">
              <div>
                <p className="eyebrow dark">Новая поставка</p>
                <h2>Добавить табак</h2>
              </div>

              <button
                className="close-button"
                onClick={() => setIsSupplyFormOpen(false)}
              >
                Закрыть
              </button>
            </div>

            <form className="supply-form" onSubmit={submitSupply}>
              <label>
                Бренд
                <input
                  name="brand"
                  list="brand-options"
                  value={supplyForm.brand}
                  onChange={handleSupplyChange}
                  placeholder="Например, Musthave"
                  required
                />
              </label>

              <label>
                Вкус
                <input
                  name="name"
                  list="flavor-options"
                  value={supplyForm.name}
                  onChange={handleSupplyChange}
                  placeholder="Например, Ванильный крем"
                  required
                />
              </label>

              <label>
                Фасовка
                <input
                  name="weight"
                  list="weight-options"
                  value={supplyForm.weight}
                  onChange={handleSupplyChange}
                  placeholder="Например, 100 г"
                  required
                />
              </label>

              <label>
                Количество пачек
                <input
                  type="number"
                  name="quantity"
                  min="1"
                  value={supplyForm.quantity}
                  onChange={handleSupplyChange}
                  required
                />
              </label>

              <label>
                Дата поставки
                <input
                  type="date"
                  name="supplyDate"
                  value={supplyForm.supplyDate}
                  onChange={handleSupplyChange}
                  required
                />
              </label>

              <label>
                Поставщик
                <input
                  name="supplier"
                  list="supplier-options"
                  value={supplyForm.supplier}
                  onChange={handleSupplyChange}
                  placeholder="Например, Опт РФ"
                />
              </label>

              <label>
                Цена за пачку
                <input
                  type="number"
                  name="price"
                  list="price-options"
                  min="0"
                  step="0.01"
                  value={supplyForm.price}
                  onChange={handleSupplyChange}
                  placeholder="Например, 850"
                />
              </label>

              <label className="wide-field">
                Теги вкуса
                <input
                  name="tags"
                  value={supplyForm.tags}
                  onChange={handleSupplyChange}
                  placeholder="десертный, сливочный, сладкий"
                />

                {tagSuggestions.length > 0 && (
                  <div className="tag-suggestion-list">
                    {tagSuggestions.slice(0, 12).map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => addTagToSupplyForm(tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              <button className="submit-button" type="submit">
                Добавить поставку
              </button>
            </form>
          </section>
        )}

        {editingFlavorId && (
          <section className="supply-panel edit-panel">
            <div className="supply-panel-top">
              <div>
                <p className="eyebrow dark">Редактирование</p>
                <h2>Редактировать вкус</h2>
              </div>

              <button className="close-button" onClick={closeEditForm}>
                Закрыть
              </button>
            </div>

            <form className="supply-form" onSubmit={submitEdit}>
              <label>
                Бренд
                <input
                  name="brand"
                  value={editForm.brand}
                  onChange={handleEditChange}
                  required
                />
              </label>

              <label>
                Вкус
                <input
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  required
                />
              </label>

              <label className="wide-field">
                Фасовки и количество
                <textarea
                  name="packsText"
                  value={editForm.packsText}
                  onChange={handleEditChange}
                  rows="4"
                  placeholder={"100 г: 2\\n25 г: 1"}
                  required
                />
                <span className="form-hint">
                  Каждая фасовка с новой строки в формате: 100 г: 2
                </span>
              </label>

              <label>
                Теги
                <input
                  name="tags"
                  value={editForm.tags}
                  onChange={handleEditChange}
                  placeholder="десертный, сливочный"
                />
              </label>

              <button className="submit-button" type="submit">
                Сохранить изменения
              </button>
            </form>
          </section>
        )}

        <section className="toolbar">
          <div className="search-field-wrap">
            <input
              type="text"
              placeholder="Поиск по бренду, вкусу, тегу или алиасу"
              className="search-input"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setOpenBrandName("");
                setOpenFlavorId(null);
                clearSelectedFlavors();
              }}
            />

            {searchText.trim() && (
              <button
                className="search-clear-button"
                onClick={() => {
                  setSearchText("");
                  setOpenBrandName("");
                  setOpenFlavorId(null);
                  clearSelectedFlavors();
                }}
              >
                ×
              </button>
            )}
          </div>

          {!isDemoMode && filteredFlavors.length > 0 && (
            <button
              className="secondary-button bulk-select-button"
              onClick={selectVisibleFlavors}
            >
              Выбрать всё
            </button>
          )}
        </section>

        {!isDemoMode && selectedFlavorIds.length > 0 && (
          <section className="bulk-action-panel">
            <div>
              <strong>Выбрано: {selectedFlavorIds.length}</strong>
              <span>Массовые действия</span>
            </div>

            <div className="bulk-action-buttons">
              <button onClick={() => applyBulkAction("archive")}>
                В архив
              </button>

              <button onClick={() => applyBulkAction("restore")}>
                Вернуть
              </button>

              <button onClick={() => applyBulkAction("purchase_confirmed_on")}>
                Подтвердить закупку
              </button>

              <button onClick={() => applyBulkAction("purchase_confirmed_off")}>
                Снять подтверждение
              </button>

              <button onClick={() => applyBulkAction("low_stock_on")}>
                Мало осталось
              </button>

              <button onClick={() => applyBulkAction("low_stock_off")}>
                Убрать мало
              </button>

              <button className="secondary" onClick={clearSelectedFlavors}>
                Сбросить
              </button>
            </div>
          </section>
        )}
<section className="inventory-quick-filter-panel">
  <button
    className={
      statusFilter === "all" && selectedTag === "all"
        ? "inventory-quick-filter-button active"
        : "inventory-quick-filter-button"
    }
    onClick={() => applyInventoryQuickFilter("all")}
  >
    Все
  </button>

  <button
    className={
      statusFilter === "В наличии" && selectedTag === "all"
        ? "inventory-quick-filter-button active"
        : "inventory-quick-filter-button"
    }
    onClick={() => applyInventoryQuickFilter("В наличии")}
  >
    В наличии
  </button>

  <button
    className={
      statusFilter === "Мало осталось" && selectedTag === "all"
        ? "inventory-quick-filter-button active"
        : "inventory-quick-filter-button"
    }
    onClick={() => applyInventoryQuickFilter("Мало осталось")}
  >
    Мало
  </button>

  <button
    className={
      statusFilter === "Отсутствует" && selectedTag === "all"
        ? "inventory-quick-filter-button active"
        : "inventory-quick-filter-button"
    }
    onClick={() => applyInventoryQuickFilter("Отсутствует")}
  >
    Нет
  </button>

  <button
    className={
      statusFilter === "all" && selectedTag === "__NO_TAGS__"
        ? "inventory-quick-filter-button active"
        : "inventory-quick-filter-button"
    }
    onClick={() => applyInventoryQuickFilter("all", "__NO_TAGS__")}
  >
    Без тегов
  </button>

  <button
    className={
      statusFilter === "Архив" && selectedTag === "all"
        ? "inventory-quick-filter-button active"
        : "inventory-quick-filter-button"
    }
    onClick={() => applyInventoryQuickFilter("Архив")}
  >
    Архив
  </button>
</section>
        <section className="tag-filter-panel">
          <button
            className={
              selectedTag === "all"
                ? "tag-filter-button active"
                : "tag-filter-button"
            }
            onClick={() => applyInventoryQuickFilter("all")}
          >
            Все теги
          </button>

          <button
            className={
              selectedTag === "__NO_TAGS__"
                ? "tag-filter-button active"
                : "tag-filter-button"
            }
            onClick={() => applyInventoryQuickFilter("all", "__NO_TAGS__")}
          >
            Без тегов
          </button>

          {quickTags.map((tag) => (
            <button
              key={tag}
              className={
                selectedTag === tag
                  ? "tag-filter-button active"
                  : "tag-filter-button"
              }
              onClick={() => setSelectedTag(tag)}
            >
              #{tag}
            </button>
          ))}
        </section>

        {isLoading && <p className="info-message">Загрузка вкусов...</p>}

        {errorText && <p className="error-message">{errorText}</p>}

        {!isLoading && !errorText && filteredFlavors.length === 0 && (
          <p className="info-message">Ничего не найдено</p>
        )}

        {!isLoading && !errorText && filteredFlavors.length > 0 && (
          <section className="brand-accordion">
            {groupedFlavorsByBrand.map((group) => {
              const isOpen = openBrandName === group.brand;

              return (
                <article className="brand-group" key={group.brand}>
                  <button
                    className={isOpen ? "brand-row open" : "brand-row"}
                    onClick={() => {
                      setOpenBrandName(isOpen ? "" : group.brand);
                      setOpenFlavorId(null);
                    }}
                  >
                    <div>
                      <strong>{group.brand}</strong>
                      <span>
                        {group.items.length} вкусов · {group.totalPacks} пач. в наличии
                      </span>
                    </div>

                    <div className="brand-row-meta">
                      <span className="brand-stock">
                        в наличии: {group.inStockCount}
                      </span>

                      <span className={group.lowStockCount > 0 ? "brand-warning" : "brand-muted"}>
                        мало: {group.lowStockCount}
                      </span>

                      <span className={group.absentCount > 0 ? "brand-alert" : "brand-muted"}>
                        нет: {group.absentCount}
                      </span>

                      <span className="brand-arrow">{isOpen ? "↑" : "↓"}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="brand-flavor-list flavor-list-mode">
                      {group.items.map((flavor) => {
                        const status = getStatus(flavor);
                        const isFlavorOpen = openFlavorId === flavor.id;
                        const totalQuantity = getTotalQuantity(flavor.packs || []);

                        return (
                          <article
                            data-flavor-id={flavor.id}
                            className={[
                              "flavor-row-group",
                              isFlavorOpen ? "open" : "",
                              String(highlightedFlavorId) === String(flavor.id)
                                ? "recently-updated"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={flavor.id}
                          >
                            <div className="flavor-row-header">
                              {!isDemoMode && (
                                <label
                                  className="bulk-checkbox"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedFlavorIds.includes(flavor.id)}
                                    onChange={() => toggleFlavorSelection(flavor.id)}
                                  />
                                  <span></span>
                                </label>
                              )}

                              <button
                                className="flavor-row-button"
                                onClick={() =>
                                  setOpenFlavorId(isFlavorOpen ? null : flavor.id)
                                }
                              >
                              <div className="flavor-row-main">
                                <strong>{flavor.name}</strong>

                                <span>
                                  {totalQuantity} пач. ·{" "}
                                  {(flavor.packs || [])
                                    .map((pack) => `${pack.weight}: ${pack.quantity}`)
                                    .join(" · ")}
                                </span>

                                <div className="flavor-row-tags-preview">
                                  {(flavor.tags || []).slice(0, 4).map((tag) => (
                                    <em key={tag}>#{tag}</em>
                                  ))}
                                </div>
                              </div>

                              <div className="flavor-row-meta">
                                <span className={status.className}>
                                  {status.text}
                                </span>

                                <span className="flavor-row-arrow">
                                  {isFlavorOpen ? "↑" : "↓"}
                                </span>
                              </div>
                              </button>
                            </div>

                            {isFlavorOpen && (
                              <div className="flavor-details-card">
                                <div className="packs">
                                  <p className="section-label">Фасовки</p>

                                  {(flavor.packs || []).map((pack, packIndex) => (
                                    <div
                                      className="pack-row pack-control-row"
                                      key={`${pack.weight}-${packIndex}`}
                                    >
                                      <span>{pack.weight}</span>

                                      {!isDemoMode ? (
                                        <div className="pack-counter">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              adjustPackQuantity(
                                                flavor.id,
                                                packIndex,
                                                -1
                                              )
                                            }
                                            disabled={Number(pack.quantity || 0) <= 0}
                                          >
                                            −
                                          </button>

                                          <strong>{pack.quantity} пач.</strong>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              adjustPackQuantity(
                                                flavor.id,
                                                packIndex,
                                                1
                                              )
                                            }
                                          >
                                            +
                                          </button>
                                        </div>
                                      ) : (
                                        <strong>{pack.quantity} пач.</strong>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {renderFlavorHistory(flavor)}

                                <div className="tags">
                                  {Boolean(
                                    flavor.excludedFromDeadstock ||
                                      flavor.excluded_from_deadstock
                                  ) && (
                                    <span className="deadstock-excluded-badge">
                                      не считать залежью
                                    </span>
                                  )}

                                  {(flavor.tags || []).map((tag) => (
                                    <span key={tag}>#{tag}</span>
                                  ))}
                                </div>

                                {!isDemoMode && (
                                  <div className="actions">
                                    <button onClick={() => clearFlavor(flavor.id)}>
                                      Выбить
                                    </button>

                                    <button onClick={() => openEditForm(flavor)}>
                                      Редактировать
                                    </button>

                                    {!flavor.archived &&
                                      getTotalQuantity(flavor.packs || []) > 0 && (
                                        <button onClick={() => toggleLowStock(flavor)}>
                                          {Boolean(flavor.lowStock || flavor.low_stock)
                                            ? "Убрать мало"
                                            : "Мало осталось"}
                                        </button>
                                      )}

                                    {!flavor.archived && (
                                      <button onClick={() => toggleDeadstockExcluded(flavor)}>
                                        {Boolean(
                                          flavor.excludedFromDeadstock ||
                                            flavor.excluded_from_deadstock
                                        )
                                          ? "Вернуть в залежи"
                                          : "Не считать залежью"}
                                      </button>
                                    )}

                                    {flavor.archived ? (
                                      <button onClick={() => restoreFlavor(flavor.id)}>
                                        Вернуть
                                      </button>
                                    ) : (
                                      <button
                                        className="danger"
                                        onClick={() => archiveFlavor(flavor.id)}
                                      >
                                        В архив
                                      </button>
                                    )}
                                  </div>
                                )}

                                {isDemoMode && (
                                  <p className="readonly-note">
                                    Ознакомительный режим: редактирование недоступно
                                  </p>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

      </main>
    </div>
  );
}

export default App;
