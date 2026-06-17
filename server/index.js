const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let flavors = [
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
];

app.get("/", (req, res) => {
  res.json({
    message: "Hookah Tobacco Inventory API is running",
  });
});

app.get("/api/flavors", (req, res) => {
  res.json(flavors);
});

app.post("/api/flavors/supply", (req, res) => {
  const { brand, name, weight, quantity, tags, minStock } = req.body;

  if (!brand || !name || !weight || !quantity) {
    return res.status(400).json({
      message: "Бренд, вкус, фасовка и количество обязательны",
    });
  }

  const normalizedBrand = String(brand).trim();
  const normalizedName = String(name).trim();
  const normalizedWeight = String(weight).trim();

  const parsedQuantity = Number(quantity);
  const parsedMinStock = Number(minStock) || 1;

  if (parsedQuantity <= 0) {
    return res.status(400).json({
      message: "Количество должно быть больше нуля",
    });
  }

  const incomingTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  let flavor = flavors.find(
    (item) =>
      item.brand.toLowerCase() === normalizedBrand.toLowerCase() &&
      item.name.toLowerCase() === normalizedName.toLowerCase()
  );

  if (!flavor) {
    const newFlavor = {
      id: Date.now(),
      brand: normalizedBrand,
      name: normalizedName,
      packs: [
        {
          weight: normalizedWeight,
          quantity: parsedQuantity,
        },
      ],
      tags: incomingTags,
      minStock: parsedMinStock,
      archived: false,
    };

    flavors.push(newFlavor);

    return res.status(201).json(newFlavor);
  }

  const existingPack = flavor.packs.find(
    (pack) => pack.weight.toLowerCase() === normalizedWeight.toLowerCase()
  );

  if (existingPack) {
    existingPack.quantity += parsedQuantity;
  } else {
    flavor.packs.push({
      weight: normalizedWeight,
      quantity: parsedQuantity,
    });
  }

  const mergedTags = new Set([...(flavor.tags || []), ...incomingTags]);
  flavor.tags = Array.from(mergedTags);
  flavor.minStock = parsedMinStock;
  flavor.archived = false;

  res.json(flavor);
});

app.patch("/api/flavors/:id/decrease", (req, res) => {
  const flavorId = Number(req.params.id);

  const flavor = flavors.find((item) => item.id === flavorId);

  if (!flavor) {
    return res.status(404).json({
      message: "Вкус не найден",
    });
  }

  const firstPackWithQuantity = flavor.packs.find((pack) => pack.quantity > 0);

  if (!firstPackWithQuantity) {
    return res.status(400).json({
      message: "У этого вкуса уже нет пачек",
    });
  }

  firstPackWithQuantity.quantity -= 1;

  res.json(flavor);
});

app.patch("/api/flavors/:id/clear", (req, res) => {
  const flavorId = Number(req.params.id);

  const flavor = flavors.find((item) => item.id === flavorId);

  if (!flavor) {
    return res.status(404).json({
      message: "Вкус не найден",
    });
  }

  flavor.packs = flavor.packs.map((pack) => ({
    ...pack,
    quantity: 0,
  }));

  res.json(flavor);
});

app.delete("/api/flavors/:id", (req, res) => {
  const flavorId = Number(req.params.id);

  const flavorExists = flavors.some((item) => item.id === flavorId);

  if (!flavorExists) {
    return res.status(404).json({
      message: "Вкус не найден",
    });
  }

  flavors = flavors.filter((item) => item.id !== flavorId);

  res.json({
    message: "Вкус удалён",
    id: flavorId,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
