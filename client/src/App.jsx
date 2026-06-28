import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import "./App.css";

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

function App() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentView, setCurrentView] = useState("inventory");
  const [analyticsFilter, setAnalyticsFilter] = useState("all");
  const [deadstockFilter, setDeadstockFilter] = useState("all");
  const [adminPassword, setAdminPassword] = useState("");
  const [accessRole, setAccessRole] = useState("admin");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [actionLogs, setActionLogs] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [aliasForm, setAliasForm] = useState({
    type: "brand",
    alias: "",
    canonical: "",
  });
  const [isCompactMode, setIsCompactMode] = useState(
    () => localStorage.getItem("compactMode") === "true"
  );

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
      setIsLoading(false);
    }
  };

  const toggleCompactMode = () => {
    setIsCompactMode((currentValue) => {
      const nextValue = !currentValue;
      localStorage.setItem("compactMode", String(nextValue));
      return nextValue;
    });
  };

  const addActionLog = async ({ action, flavor, details = {} }) => {
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

      const updatedLogs = await loadActionLogsWithPassword(adminPassword);
      setActionLogs(updatedLogs);
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
    await loadActionLogs();
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

  const increasePack = async (flavorId) => {
    try {
      const response = await apiFetch(`/api/flavors/${flavorId}/increase`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Не удалось добавить пачку");
      }

      await refreshFlavors();
      showNotification("Пачка добавлена", "success");
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось добавить пачку", "error");
      setErrorText(error.message || "Не удалось добавить пачку");
    }
  };

  const decreasePack = async (flavorId) => {
    try {
      const response = await apiFetch(`/api/flavors/${flavorId}/decrease`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Не удалось списать пачку");
      }

      await refreshFlavors();
      showNotification("Пачка списана", "success");
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Не удалось списать пачку", "error");
      setErrorText(error.message || "Не удалось списать пачку");
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
      supplier: supplyForm.supplier.trim(),
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

      await addActionLog({
        action: "supply",
        flavor: {
          brand: payload.brand,
          name: payload.name,
        },
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
        .map((supplier) => String(supplier || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));

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

    try {
      const response = await apiFetch("/api/admin/clear-database", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось очистить базу");
      }

      setFlavors([]);
      setSearchText("");
      setSelectedTag("all");
      setStatusFilter("all");

      showNotification("База очищена. Теперь можно загружать историю закупа.", "success");
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось очистить базу");
    }
  };

  const exportToExcel = () => {
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

  const exportPurchaseToExcel = () => {
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

  const createBackupExcel = (reason = "backup") => {
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

          const name = String(
            getExcelValue(row, [
              "Вкус",
              "Название",
              "Название товара",
              "Товар",
              "name",
              "Name",
            ])
          ).trim();

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

          const purchasedQuantity = parseExcelNumber(
            getExcelValue(row, [
              "Закуплено",
              "Закуп",
              "Поступило",
              "purchasedQuantity",
              "Purchased",
            ]),
            quantity
          );

          const tags = String(
            getExcelValue(row, ["Теги", "tags", "Tags"])
          ).trim();

          const lowStock = parseExcelBoolean(
            getExcelValue(row, [
              "Мало осталось",
              "lowStock",
              "Low stock",
              "low_stock",
            ])
          );

          const archived = parseExcelBoolean(
            getExcelValue(row, ["Архив", "archived", "Archived"])
          );

          const excludedFromDeadstock = parseExcelBoolean(
            getExcelValue(row, [
              "Не считать залежью",
              "Исключить из залежей",
              "excludedFromDeadstock",
              "excluded_from_deadstock",
            ])
          );

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

          const supplier = String(
            getExcelValue(row, [
              "Поставщик",
              "supplier",
              "Supplier",
            ])
          ).trim();

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
            weight,
            quantity,
            purchasedQuantity,
            tags,
            lowStock,
            archived,
            excludedFromDeadstock,
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

    try {
      setIsLoading(true);
      setErrorText("");

      createBackupExcel("before-import");

      const response = await apiFetch("/api/flavors/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows: pendingImportRows }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorData = null;

        try {
          errorData = errorText ? JSON.parse(errorText) : null;
        } catch {
          errorData = null;
        }

        throw new Error(
          errorData?.message ||
            errorText ||
            "Не удалось импортировать Excel"
        );
      }

      const result = await response.json();

      await addActionLog({
        action: "import_excel",
        details: {
          importedCount: result.importedCount,
        },
      });

      for (const row of pendingImportRows) {
        await addActionLog({
          action: "supply",
          flavor: {
            brand: row.brand,
            name: row.name,
          },
          details: {
            weight: row.weight,
            quantity: row.purchasedQuantity || row.quantity,
            suppliedAt: row.supplyDate || getTodayInputDate(),
            supplier: row.supplier || "",
            price: row.price || null,
            source: "excel_import",
          },
        });
      }

      await refreshFlavors();

      setPendingImportRows([]);
      setPendingImportFileName("");
      setIsImportPreviewOpen(false);

      setSearchText("");
      setSelectedTag("all");
      setStatusFilter("all");
      setCurrentView("inventory");

      showNotification(
        `Excel импортирован. Обновлено вкусов: ${result.importedCount}`,
        "success"
      );
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось импортировать Excel");
    } finally {
      setIsLoading(false);
    }
  };

  const cancelImportPreview = () => {
    setPendingImportRows([]);
    setPendingImportFileName("");
    setIsImportPreviewOpen(false);
  };

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [isPurchasePanelOpen, setIsPurchasePanelOpen] = useState(false);
  const [openBrandName, setOpenBrandName] = useState("");
  const [openFlavorId, setOpenFlavorId] = useState(null);
  const [openFlavorHistoryIds, setOpenFlavorHistoryIds] = useState([]);
  const [highlightedFlavorId, setHighlightedFlavorId] = useState(null);
  const [openAnalyticsBrandName, setOpenAnalyticsBrandName] = useState("");
  const [openAnalyticsFlavorId, setOpenAnalyticsFlavorId] = useState(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [selectedFlavorIds, setSelectedFlavorIds] = useState([]);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState([]);
  const [pendingImportFileName, setPendingImportFileName] = useState("");

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

  const getHistoryActionTitle = (action) => {
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

    const supplyActions = new Set(["supply", "pack_plus", "import_excel"]);
    const writeOffActions = new Set(["pack_minus", "clear"]);

    const supplyLogs = historyItems.filter((log) =>
      supplyActions.has(log.action)
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
                    <strong>{getHistoryActionTitle(log.action)}</strong>
                    {getHistoryActionMeta(log) && (
                      <span>{getHistoryActionMeta(log)}</span>
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

    const matchesTag =
      selectedTag === "all" ||
      (flavor.tags || []).some(
        (tag) =>
          normalizeSearchValue(tag) === normalizeSearchValue(selectedTag)
      );

    return matchesSearch && matchesStatus && matchesTag;
  });



  const normalizeDuplicateKey = (value) => {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
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
    .map(([brand, items]) => ({
      brand,
      items: items.sort((a, b) => a.name.localeCompare(b.name, "ru")),
      totalPacks: items.reduce(
        (sum, flavor) => sum + getTotalQuantity(flavor.packs || []),
        0
      ),
      absentCount: items.filter((flavor) => getTotalQuantity(flavor.packs || []) === 0)
        .length,
      lowStockCount: items.filter((flavor) =>
        Boolean(flavor.lowStock || flavor.low_stock)
      ).length,
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand, "ru"));


  const normalizeTagKey = (value) => {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
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

    const isConfirmed = window.confirm(
      `Объединить теги ${fromTags.map((tag) => `#${tag}`).join(", ")} в #${targetTag}?`
    );

    if (!isConfirmed) {
      return;
    }

    createBackupExcel("before-merge-tags");

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

  const mergeDuplicateGroup = async (group) => {
    if (!group?.items || group.items.length < 2) {
      return;
    }

    const primaryFlavor = group.items[0];
    const duplicateIds = group.items.slice(1).map((flavor) => flavor.id);

    const isConfirmed = window.confirm(
      `Объединить ${group.items.length} записей в одну? Основной останется: ${primaryFlavor.brand} — ${primaryFlavor.name}`
    );

    if (!isConfirmed) {
      return;
    }

    createBackupExcel("before-merge-duplicates");

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
    merge_duplicates: "Объединение дублей",
    merge_tags: "Объединение тегов",
    bulk_action: "Массовое действие",
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

      return parts.filter(Boolean).join(" · ");
    }

    if (log.action === "import_excel") {
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

    const isConfirmed = window.confirm(
      `Точно ${actionTitles[action]}? Выбрано: ${selectedCount}`
    );

    if (!isConfirmed) {
      return;
    }

    createBackupExcel(`before-bulk-${action}`);

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

  const renderAppHeader = ({ title, subtitle, isInventory = false }) => {
    const closeMenu = () => setIsHeaderMenuOpen(false);

    const goToView = (view) => {
      setCurrentView(view);
      closeMenu();
    };

    return (
      <>
      {renderNotifications()}

      <header className="header">
        <div>
          <p className="eyebrow">Hookah Inventory</p>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>

          {isDemoMode && (
            <p className="demo-badge">Ознакомительный режим</p>
          )}
        </div>

        <div className="header-actions compact-header-actions">
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

          <button className="secondary-button" onClick={handleLogout}>
            Выйти
          </button>

          {isHeaderMenuOpen && (
            <div className="header-dropdown">
              <div className="dropdown-section">
                <p>Разделы</p>

                <button onClick={() => goToView("inventory")}>
                  Склад
                </button>

                <button onClick={() => goToView("purchase")}>
                  Закупка
                </button>

                <button onClick={() => goToView("analytics")}>
                  Аналитика
                </button>

                <button onClick={() => goToView("deadstock")}>
                  Залежи
                </button>

                <button
                  onClick={() => {
                    openHistory();
                    closeMenu();
                  }}
                >
                  История
                </button>

                <button onClick={() => goToView("duplicates")}>
                  Дубли
                </button>

                <button onClick={() => goToView("tags")}>
                  Теги
                </button>

                <button
                  onClick={() => {
                    setSearchText("");
                    setSelectedTag("all");
                    setStatusFilter(
                      statusFilter === "Архив" ? "all" : "Архив"
                    );
                    setOpenBrandName("");
                    setOpenFlavorId(null);
                    setCurrentView("inventory");
                    closeMenu();
                  }}
                >
                  {statusFilter === "Архив" ? "Склад" : "Архив"}
                </button>
              </div>

              <div className="dropdown-section">
                <p>Вид</p>

                <button
                  onClick={() => {
                    toggleCompactMode();
                    closeMenu();
                  }}
                >
                  {isCompactMode ? "Обычный режим" : "Компактный режим"}
                </button>
              </div>

              <div className="dropdown-section">
                <p>Данные</p>

                {!isDemoMode && (
                  <button
                    onClick={() => {
                      setCurrentView("inventory");
                      setIsSupplyFormOpen(true);
                      closeMenu();
                    }}
                  >
                    + Поставка
                  </button>
                )}

                <button
                  onClick={() => {
                    exportToExcel();
                    closeMenu();
                  }}
                >
                  Экспорт склада
                </button>

                <button
                  onClick={() => {
                    exportPurchaseToExcel();
                    closeMenu();
                  }}
                >
                  Экспорт закупки
                </button>

                {!isDemoMode && (
                  <label className="dropdown-file-button">
                    Импорт Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(event) => {
                        importFromExcel(event);
                        closeMenu();
                      }}
                    />
                  </label>
                )}

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
      <div className={isCompactMode ? "app compact-mode" : "app"}>
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
      <div className={isCompactMode ? "app compact-mode" : "app"}>
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
      <div className={isCompactMode ? "app compact-mode" : "app"}>
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
            <h2>Все теги</h2>

            <div className="tags-table">
              {tagRows.map((row) => (
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
          </section>
        </main>
      </div>
    );
  }

  if (currentView === "duplicates") {
    return (
      <div className={isCompactMode ? "app compact-mode" : "app"}>
        {renderAppHeader({
          title: "Дубли вкусов",
          subtitle: "Поиск одинаковых записей по бренду и названию",
        })}

        <main className="content">
          <section className="duplicates-panel">
            <div className="history-panel-top">
              <h2>Найдено групп дублей: {duplicateGroups.length}</h2>
            </div>

            {duplicateGroups.length === 0 && (
              <p className="info-message">
                Точные дубли не найдены. Всё чисто.
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

  if (currentView === "history") {
    return (
      <div className={isCompactMode ? "app compact-mode" : "app"}>
        {renderAppHeader({
          title: "История действий",
          subtitle: "Последние изменения склада, закупки и архива",
        })}

        <main className="content">
          <section className="history-panel">
            <div className="history-panel-top">
              <h2>Последние действия</h2>

              <button className="secondary-button" onClick={loadActionLogs}>
                Обновить
              </button>
            </div>

            {actionLogs.length === 0 && (
              <p className="info-message">История пока пустая</p>
            )}

            <div className="history-list">
              {actionLogs.map((log) => (
                <article className="history-item" key={log.id}>
                  <div>
                    <span className="history-time">
                      {formatActionTime(log.createdAt || log.created_at)}
                    </span>

                    <strong>
                      {actionLabels[log.action] || log.action}
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
      <div className={isCompactMode ? "app compact-mode" : "app"}>
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
    <div className={isCompactMode ? "app compact-mode" : "app"}>
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
            </div>

            <div className="import-preview-table-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th>Бренд</th>
                    <th>Вкус</th>
                    <th>Фасовка</th>
                    <th>Кол-во</th>
                    <th>Закуплено</th>
                    <th>Дата</th>
                    <th>Поставщик</th>
                    <th>Цена</th>
                    <th>Теги</th>
                  </tr>
                </thead>

                <tbody>
                  {pendingImportRows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.brand}-${row.name}-${row.weight}-${index}`}>
                      <td>{row.brand}</td>
                      <td>{row.name}</td>
                      <td>{row.weight}</td>
                      <td>{row.quantity}</td>
                      <td>{row.purchasedQuantity}</td>
                      <td>{row.supplyDate || "—"}</td>
                      <td>{row.supplier || "—"}</td>
                      <td>{row.price ? `${row.price} ₽` : "—"}</td>
                      <td>{row.tags}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pendingImportRows.length > 20 && (
              <p className="form-hint">
                Показаны первые 20 строк из {pendingImportRows.length}.
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

        {purchaseFlavors.length > 0 && statusFilter !== "Архив" && (
          <section className="purchase-panel">
            <div className="purchase-panel-top">
              <div>
                <p className="eyebrow dark">Закупка</p>
                <h2>Требуется к закупу</h2>
              </div>

              <div className="purchase-header-actions">
                <span className="purchase-count">{purchaseFlavors.length} поз.</span>

                <button
                  className="collapse-button"
                  onClick={() => setIsPurchasePanelOpen(!isPurchasePanelOpen)}
                >
                  {isPurchasePanelOpen ? "Свернуть" : "Показать"}
                </button>
              </div>
            </div>

            {isPurchasePanelOpen && (
              <div className="purchase-list">
                {purchaseFlavors.map((flavor) => {
                const total = getTotalQuantity(flavor.packs || []);
                const status = getStatus(flavor);
                const specificTags = getSpecificTags(flavor);
                const analogs = getAnalogFlavors(flavor);
                const isPurchaseConfirmed = Boolean(
                  flavor.purchaseConfirmed || flavor.purchase_confirmed
                );

                return (
                  <div className="purchase-item" key={flavor.id}>
                    <div>
                      <p className="brand">{flavor.brand}</p>
                      <h3>{flavor.name}</h3>
                      <p className="purchase-meta">
                        Остаток: {total} пач.
                      </p>

                      {isPurchaseConfirmed && (
                        <p className="purchase-confirmed-badge">
                          Закупка подтверждена
                        </p>
                      )}

                      {specificTags.length > 0 && (
                        <div className="purchase-specific-tags">
                          <span>Ищем аналоги по:</span>
                          {specificTags.map((tag) => (
                            <strong key={tag}>#{tag}</strong>
                          ))}
                        </div>
                      )}

                      {analogs.length > 0 && (
                        <div className="purchase-analogs">
                          <p>Аналоги:</p>

                          {analogs.map(({ flavor: analog, matchedTags, totalQuantity }) => (
                            <div className="purchase-analog-item" key={analog.id}>
                              <span>
                                {analog.brand} — {analog.name}
                              </span>

                              <small>
                                Остаток: {totalQuantity} пач. ·{" "}
                                {matchedTags.map((tag) => `#${tag}`).join(", ")}
                              </small>
                            </div>
                          ))}
                        </div>
                      )}

                      {specificTags.length > 0 && analogs.length === 0 && (
                        <p className="purchase-no-analogs">
                          Аналоги по специфичным тегам не найдены
                        </p>
                      )}
                    </div>

                    <div className="purchase-actions">
                      <span className={status.className}>{status.text}</span>

                      {!isDemoMode && (
                        <button onClick={() => togglePurchaseConfirmed(flavor)}>
                          {isPurchaseConfirmed
                            ? "Снять подтверждение"
                            : "Подтвердить закупку"}
                        </button>
                      )}

                      {!isDemoMode && (
                        <button
                          className="danger"
                          onClick={() => archiveFlavor(flavor.id)}
                        >
                          В архив
                        </button>
                      )}

                      {!isDemoMode && (
                        <button onClick={() => startSupplyForFlavor(flavor)}>
                          Добавить поставку
                        </button>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            )}
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

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setOpenBrandName("");
              setOpenFlavorId(null);
              clearSelectedFlavors();
            }}
          >
            <option value="all">Все статусы</option>
            <option value="В наличии">В наличии</option>
            <option value="Мало осталось">Мало осталось</option>
            <option value="Отсутствует">Отсутствует</option>
            <option value="Архив">Архив</option>
          </select>

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

        <section className="tag-filter-panel">
          <button
            className={
              selectedTag === "all"
                ? "tag-filter-button active"
                : "tag-filter-button"
            }
            onClick={() => setSelectedTag("all")}
          >
            Все теги
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
                        {group.items.length} вкусов · {group.totalPacks} пач.
                      </span>
                    </div>

                    <div className="brand-row-meta">
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
