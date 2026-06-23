import { useState } from "react";
import * as XLSX from "xlsx";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "";

function App() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentView, setCurrentView] = useState("inventory");
  const [analyticsFilter, setAnalyticsFilter] = useState("all");
  const [adminPassword, setAdminPassword] = useState("");
  const [accessRole, setAccessRole] = useState("admin");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  const isDemoMode = accessRole === "test";

  const [flavors, setFlavors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [isSupplyFormOpen, setIsSupplyFormOpen] = useState(false);
  const [supplyForm, setSupplyForm] = useState({
    brand: "",
    name: "",
    weight: "",
    quantity: 1,
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

      setAdminPassword(trimmedPassword);
      setAccessRole(trimmedPassword === "test" ? "test" : "admin");
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

  const handleLogout = () => {
    setIsAuthorized(false);
    setAdminPassword("");
    setAccessRole("admin");
    setPasswordInput("");
    setFlavors([]);
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

  const getTotalQuantity = (packs = []) => {
    return packs.reduce((sum, pack) => sum + Number(pack.quantity), 0);
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

  const increasePack = async (flavorId) => {
    try {
      const response = await apiFetch(`/api/flavors/${flavorId}/increase`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Не удалось добавить пачку");
      }

      await refreshFlavors();
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      console.error(error);
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

      await refreshFlavors();
    } catch (error) {
      console.error(error);
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

      await refreshFlavors();
    } catch (error) {
      console.error(error);
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

      await refreshFlavors();
    } catch (error) {
      console.error(error);
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

      await refreshFlavors();
    } catch (error) {
      console.error(error);
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

      await refreshFlavors();

      setSupplyForm({
        brand: "",
        name: "",
        weight: "",
        quantity: 1,
        tags: "",
        minStock: 1,
      });

      setIsSupplyFormOpen(false);
    } catch (error) {
      console.error(error);
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

      window.alert("База очищена. Теперь можно загружать историю закупа.");
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
        "Архив": flavor.archived ? "да" : "нет",
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 34 },
      { wch: 20 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Склад");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `sklad-tabaka-${today}.xlsx`);
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

          return {
            brand,
            name,
            weight,
            quantity,
            purchasedQuantity,
            tags,
            lowStock,
            archived,
          };
        })
        .filter((row) => row.brand && row.name && row.weight);

      if (rows.length === 0) {
        throw new Error(
          "В Excel не найдено строк с обязательными колонками: Бренд, Вкус, Фасовка"
        );
      }

      const response = await apiFetch("/api/flavors/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows }),
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

      await refreshFlavors();

      setSearchText("");
      setSelectedTag("all");
      setStatusFilter("all");
      setCurrentView("inventory");

      window.alert(
        `Excel импортирован. Обновлено вкусов: ${result.importedCount}`
      );
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "Не удалось импортировать Excel");
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  };

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [isPurchasePanelOpen, setIsPurchasePanelOpen] = useState(false);
  const [openBrandName, setOpenBrandName] = useState("");
  const [openFlavorId, setOpenFlavorId] = useState(null);

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

  const filteredFlavors = flavors.filter((flavor) => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const searchableText = [
      flavor.brand,
      flavor.name,
      ...(flavor.tags || []),
      ...(flavor.packs || []).map((pack) => pack.weight),
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      normalizedSearch === "" || searchableText.includes(normalizedSearch);

    const status = getStatus(flavor).text;

    const matchesStatus =
      statusFilter === "all" ? !flavor.archived : status === statusFilter;

    const matchesTag =
      selectedTag === "all" ||
      (flavor.tags || []).some(
        (tag) => tag.trim().toLowerCase() === selectedTag.toLowerCase()
      );

    return matchesSearch && matchesStatus && matchesTag;
  });


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

      await refreshFlavors();
    } catch (error) {
      console.error(error);
      setErrorText(
        error.message || "Не удалось изменить подтверждение закупки"
      );
    }
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


  if (currentView === "analytics") {
    return (
      <div className="app">
        <header className="header">
          <div>
            <p className="eyebrow">Hookah Inventory</p>
            <h1>Аналитика</h1>
            <p className="subtitle">
              Сводка по складу, остаткам и закупленному весу
            </p>

            {isDemoMode && (
              <p className="demo-badge">Ознакомительный режим</p>
            )}
          </div>

          <div className="header-actions">
            <button
              className="secondary-button"
              onClick={() => setCurrentView("inventory")}
            >
              Склад
            </button>

            <button className="secondary-button" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </header>

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

              {analyticsRows.map((row) => (
                <div className="analytics-flavor-row" key={row.id}>
                  <div>
                    <strong>
                      {row.brand} — {row.name}
                    </strong>

                    <div className="analytics-flavor-tags">
                      {row.archived && <span>архив</span>}
                      {row.lowStock && <span>мало осталось</span>}
                      {row.tags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                  </div>

                  <div className="analytics-flavor-stats">
                    <span>Остаток: {row.quantity} пач.</span>
                    <span>На полке: {formatWeight(row.stockGrams)}</span>
                    <span>
                      Закуплено: {row.purchasedPacks} пач. · {formatWeight(row.purchasedGrams)}
                    </span>
                    <span>
                      Использовано: {row.usedPacks} пач. · {formatWeight(row.usedGrams)}
                    </span>
                  </div>
                </div>
              ))}
            </article>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Hookah Inventory</p>
          <h1>Склад табака</h1>
          <p className="subtitle">
            Отслеживание вкусов, фасовок, остатков и закупки
          </p>

          {isDemoMode && (
            <p className="demo-badge">Ознакомительный режим</p>
          )}
        </div>

        <div className="header-actions">
          {!isDemoMode && (
            <button
              className="primary-button"
              onClick={() => setIsSupplyFormOpen(true)}
            >
              + Поставка
            </button>
          )}

          <button
            className="secondary-button"
            onClick={() => setCurrentView("analytics")}
          >
            Аналитика
          </button>

          {!isDemoMode && (
            <button className="danger-top-button" onClick={clearDatabase}>
              Очистить базу
            </button>
          )}

          <button className="secondary-button" onClick={exportToExcel}>
            Экспорт Excel
          </button>

          {!isDemoMode && (
            <label className="secondary-button file-button">
              Импорт Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={importFromExcel}
              />
            </label>
          )}

          <button
            className="secondary-button"
            onClick={() => {
              setSearchText("");
              setSelectedTag("all");
              setStatusFilter(statusFilter === "Архив" ? "all" : "Архив");
            }}
          >
            {statusFilter === "Архив" ? "Склад" : "Архив"}
          </button>

          <button className="secondary-button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

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
          <input
            type="text"
            placeholder="Поиск по бренду, вкусу или тегу"
            className="search-input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Все статусы</option>
            <option value="В наличии">В наличии</option>
            <option value="Мало осталось">Мало осталось</option>
            <option value="Отсутствует">Отсутствует</option>
            <option value="Архив">Архив</option>
          </select>
        </section>

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
                            className={
                              isFlavorOpen
                                ? "flavor-row-group open"
                                : "flavor-row-group"
                            }
                            key={flavor.id}
                          >
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

                            {isFlavorOpen && (
                              <div className="flavor-details-card">
                                <div className="packs">
                                  <p className="section-label">Фасовки</p>

                                  {(flavor.packs || []).map((pack) => (
                                    <div className="pack-row" key={pack.weight}>
                                      <span>{pack.weight}</span>
                                      <strong>{pack.quantity} пач.</strong>
                                    </div>
                                  ))}
                                </div>

                                <div className="tags">
                                  {(flavor.tags || []).map((tag) => (
                                    <span key={tag}>#{tag}</span>
                                  ))}
                                </div>

                                {!isDemoMode && (
                                  <div className="actions">
                                    <button onClick={() => increasePack(flavor.id)}>
                                      +1 пачка
                                    </button>

                                    <button onClick={() => decreasePack(flavor.id)}>
                                      −1 пачка
                                    </button>

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
