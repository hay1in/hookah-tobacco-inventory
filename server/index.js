const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const flavors = [
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});