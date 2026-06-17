import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "";

function App() {
  const [flavors, setFlavors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const refreshFlavors = () => {
    fetch(`${API_URL}/api/flavors`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Не удалось загрузить вкусы");
        }

        return response.json();
      })
      .then((data) => {
        setFlavors(Array.isArray(data) ? data : []);
        setErrorText("");
      })
      .catch((error) => {
        console.error(error);
        setErrorText("Не удалось подключиться к серверу");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    refreshFlavors();
  }, []);

  const getTotalQuantity = (packs = []) => {
    return packs.reduce((sum, pack) => sum + Number(pack.quantity), 0);
  };

  const getStatus = (flavor) => {
    const total = getTotalQuantity(flavor.packs);

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

    if (total <= flavor.minStock) {
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

  const decreasePack = (flavorId) => {
    fetch(`${API_URL}/api/flavors/${flavorId}/decrease`, {
      method: "PATCH",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Не удалось списать пачку");
        }

        return response.json();
      })
      .then(() => {
        refreshFlavors();
      })
      .catch((error) => {
        console.error(error);
        setErrorText("Не удалось списать пачку");
      });
  };

  const clearFlavor = (flavorId) => {
    fetch(`${API_URL}/api/flavors/${flavorId}/clear`, {
      method: "PATCH",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Не удалось выбить вкус");
        }

        return response.json();
      })
      .then(() => {
        refreshFlavors();
      })
      .catch((error) => {
        console.error(error);
        setErrorText("Не удалось выбить вкус");
      });
  };

  const deleteFlavor = (flavorId) => {
    const isConfirmed = window.confirm(
      "Удалить вкус из системы? Это действие нельзя отменить."
    );

    if (!isConfirmed) {
      return;
    }

    fetch(`${API_URL}/api/flavors/${flavorId}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Не удалось удалить вкус");
        }

        return response.json();
      })
      .then(() => {
        refreshFlavors();
      })
      .catch((error) => {
        console.error(error);
        setErrorText("Не удалось удалить вкус");
      });
  };

  const handleSupplyChange = (event) => {
    const { name, value } = event.target;

    setSupplyForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const submitSupply = (event) => {
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

    fetch(`${API_URL}/api/flavors/supply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Не удалось добавить поставку");
        }

        return response.json();
      })
      .then(() => {
        refreshFlavors();

        setSupplyForm({
          brand: "",
          name: "",
          weight: "",
          quantity: 1,
          tags: "",
          minStock: 1,
        });

        setIsSupplyFormOpen(false);
      })
      .catch((error) => {
        console.error(error);
        setErrorText("Не удалось добавить поставку");
      });
  };

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

        <button
          className="primary-button"
          onClick={() => setIsSupplyFormOpen(true)}
        >
          + Поставка
        </button>
      </header>

      <main className="content">
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
              </label>

              <button className="submit-button" type="submit">
                Добавить поставку
              </button>
            </form>
          </section>
        )}

        <section className="toolbar">
          <input
            type="text"
            placeholder="Поиск по бренду, вкусу или тегу"
            className="search-input"
          />

          <select className="filter-select">
            <option>Все статусы</option>
            <option>В наличии</option>
            <option>Мало осталось</option>
            <option>Требуется к закупу</option>
          </select>
        </section>

        {isLoading && <p className="info-message">Загрузка вкусов...</p>}

        {errorText && <p className="error-message">{errorText}</p>}

        {!isLoading && !errorText && (
          <section className="cards-grid">
            {flavors.map((flavor) => {
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
                    <button>Редактировать</button>
                    <button
                      className="danger"
                      onClick={() => deleteFlavor(flavor.id)}
                    >
                      Удалить
                    </button>
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
