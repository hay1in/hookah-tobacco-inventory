import { useState } from "react";
import "./App.css";

const API_URL = "";

function App() {
  const [flavors, setFlavors] = useState([
    {
      id: 1,
      brand: "Musthave",
      name: "Ванильный крем",
      packs: [
        { weight: "100 г", quantity: 2 },
        { weight: "25 г", quantity: 1 },
      ],
      tags: ["десертный", "сливочный", "сладкий"],
      minStock: 1,
      archived: false,
    },
    {
      id: 2,
      brand: "Северный",
      name: "Mountain Dew",
      packs: [{ weight: "100 г", quantity: 0 }],
      tags: ["цитрус", "газировка", "свежий"],
      minStock: 1,
      archived: false,
    },
    {
      id: 3,
      brand: "База",
      name: "Белый чай",
      packs: [{ weight: "100 г", quantity: 1 }],
      tags: ["чайный", "лёгкий", "цветочный"],
      minStock: 1,
      archived: false,
    },
  ]);

  const getTotalQuantity = (packs) => {
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

  const refreshFlavors = () => {
  fetch(`${API_URL}/api/flavors`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Не удалось обновить вкусы");
      }

      return response.json();
    })
    .then((data) => {
      setFlavors(data);
    })
    .catch((error) => {
      console.error(error);
      setErrorText("Не удалось обновить данные");
    });
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

        <button className="primary-button">+ Поставка</button>
      </header>

      <main className="content">
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

                  {flavor.packs.map((pack) => (
                    <div className="pack-row" key={pack.weight}>
                      <span>{pack.weight}</span>
                      <strong>{pack.quantity} пач.</strong>
                    </div>
                  ))}
                </div>

                <div className="tags">
                  {flavor.tags.map((tag) => (
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
      </main>
    </div>
  );
}

export default App;