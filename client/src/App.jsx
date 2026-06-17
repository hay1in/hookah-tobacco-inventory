import { useState } from "react";
import "./App.css";

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

  const decreasePack = (flavorId) => {
    setFlavors((currentFlavors) =>
      currentFlavors.map((flavor) => {
        if (flavor.id !== flavorId) return flavor;

        const updatedPacks = flavor.packs.map((pack, index) => {
          if (index !== 0) return pack;

          return {
            ...pack,
            quantity: Math.max(0, pack.quantity - 1),
          };
        });

        return {
          ...flavor,
          packs: updatedPacks,
        };
      })
    );
  };

  const clearFlavor = (flavorId) => {
    setFlavors((currentFlavors) =>
      currentFlavors.map((flavor) => {
        if (flavor.id !== flavorId) return flavor;

        return {
          ...flavor,
          packs: flavor.packs.map((pack) => ({
            ...pack,
            quantity: 0,
          })),
        };
      })
    );
  };

  const deleteFlavor = (flavorId) => {
    setFlavors((currentFlavors) =>
      currentFlavors.filter((flavor) => flavor.id !== flavorId)
    );
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