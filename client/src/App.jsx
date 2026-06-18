import { useState } from "react";
import * as XLSX from "xlsx";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "";

function App() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

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
    setPasswordInput("");
    setFlavors([]);
    setErrorText("");
    setAuthError("");
  };

  const refreshFlavors = async () => {
    try {
      const response = await apiFetch("/api/flavors");

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

    if (flavor.archived) {
      return {
        text: "Архив",
        className: "status archived",
      };
    }

    if (total === 0) {
      return {
        text: "Требуется к закупу",
        className: "status need-buy",
      };
    }

    if (total <= Number(flavor.minStock || 1)) {
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
        .join("\n"),
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
      .split("\n")
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
        "Теги": (flavor.tags || []).join(", "),
        "Минимальный остаток": Number(flavor.minStock || 1),
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

          const tags = String(
            getExcelValue(row, ["Теги", "tags", "Tags"])
          ).trim();

          const minStock = parseExcelNumber(
            getExcelValue(row, [
              "Минимальный остаток",
              "Минимум",
              "minStock",
              "Min stock",
            ]),
            1
          );

          const archived = parseExcelBoolean(
            getExcelValue(row, ["Архив", "archived", "Archived"])
          );

          return {
            brand,
            name,
            weight,
            quantity,
            tags,
            minStock,
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
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Не удалось импортировать Excel");
      }

      const result = await response.json();

      await refreshFlavors();

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

    return matchesSearch && matchesStatus;
  });

  const purchaseFlavors = flavors.filter((flavor) => {
    if (flavor.archived) {
      return false;
    }

    const total = getTotalQuantity(flavor.packs || []);

    return total <= Number(flavor.minStock || 1);
  });

  if (!isAuthorized) {
    return (
      <div className="app auth-page">
        <section className="auth-card">
          <p className="eyebrow dark">Hookah Inventory</p>
          <h1>Вход в склад</h1>
          <p className="subtitle dark">
            Введите пароль, чтобы открыть систему учёта табака
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

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Hookah Inventory</p>
          <h1>Склад табака</h1>
          <p className="subtitle">
            Отслеживание вкусов, фасовок, остатков и закупки
          </p>
        </div>

        <div className="header-actions">
          <button
            className="primary-button"
            onClick={() => setIsSupplyFormOpen(true)}
          >
            + Поставка
          </button>

          <button className="secondary-button" onClick={exportToExcel}>
            Экспорт Excel
          </button>

          <label className="secondary-button file-button">
            Импорт Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={importFromExcel}
            />
          </label>

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

              <label>
                Минимальный остаток
                <input
                  type="number"
                  name="minStock"
                  min="0"
                  value={supplyForm.minStock}
                  onChange={handleSupplyChange}
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

              <label>
                Минимальный остаток
                <input
                  type="number"
                  name="minStock"
                  min="0"
                  value={editForm.minStock}
                  onChange={handleEditChange}
                />
              </label>

              <label className="wide-field">
                Фасовки и количество
                <textarea
                  name="packsText"
                  value={editForm.packsText}
                  onChange={handleEditChange}
                  rows="4"
                  placeholder={"100 г: 2\n25 г: 1"}
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

        {purchaseFlavors.length > 0 && (
          <section className="purchase-panel">
            <div className="purchase-panel-top">
              <div>
                <p className="eyebrow dark">Закупка</p>
                <h2>Требуется к закупу</h2>
              </div>

              <span className="purchase-count">{purchaseFlavors.length} поз.</span>
            </div>

            <div className="purchase-list">
              {purchaseFlavors.map((flavor) => {
                const total = getTotalQuantity(flavor.packs || []);
                const status = getStatus(flavor);

                return (
                  <div className="purchase-item" key={flavor.id}>
                    <div>
                      <p className="brand">{flavor.brand}</p>
                      <h3>{flavor.name}</h3>
                      <p className="purchase-meta">
                        Остаток: {total} пач. · Минимум: {flavor.minStock}
                      </p>
                    </div>

                    <div className="purchase-actions">
                      <span className={status.className}>{status.text}</span>

                      <button onClick={() => startSupplyForFlavor(flavor)}>
                        Добавить поставку
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
            <option value="Требуется к закупу">Требуется к закупу</option>
            <option value="Архив">Архив</option>
          </select>
        </section>

        {isLoading && <p className="info-message">Загрузка вкусов...</p>}

        {errorText && <p className="error-message">{errorText}</p>}

        {!isLoading && !errorText && filteredFlavors.length === 0 && (
          <p className="info-message">Ничего не найдено</p>
        )}

        {!isLoading && !errorText && filteredFlavors.length > 0 && (
          <section className="cards-grid">
            {filteredFlavors.map((flavor) => {
              const status = getStatus(flavor);

              return (
                <article className="flavor-card" key={flavor.id}>
                  <div className="card-top">
                    <div>
                      <p className="brand">{flavor.brand}</p>
                      <h2>{flavor.name}</h2>
                    </div>

                    <span className={status.className}>{status.text}</span>
                  </div>

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

                  <div className="actions">
                    <button onClick={() => decreasePack(flavor.id)}>
                      −1 пачка
                    </button>
                    <button onClick={() => clearFlavor(flavor.id)}>
                      Выбить
                    </button>
                    <button onClick={() => openEditForm(flavor)}>
                      Редактировать
                    </button>
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
