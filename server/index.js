const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

function requireAdminPassword(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({
      message: "ADMIN_PASSWORD is not configured",
    });
  }

  const providedPassword = req.headers["x-admin-password"];

  if (providedPassword !== adminPassword) {
    return res.status(401).json({
      message: "Неверный пароль",
    });
  }

  next();
}

app.use("/api", requireAdminPassword);

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to server/.env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

const defaultFlavors = [
  {
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
    brand: "Северный",
    name: "Mountain Dew",
    packs: [{ weight: "100 г", quantity: 0 }],
    tags: ["цитрус", "газировка", "свежий"],
    minStock: 1,
    archived: false,
  },
  {
    brand: "База",
    name: "Белый чай",
    packs: [{ weight: "100 г", quantity: 1 }],
    tags: ["чайный", "лёгкий", "цветочный"],
    minStock: 1,
    archived: false,
  },
];

function normalizeFlavor(row) {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    packs: Array.isArray(row.packs) ? row.packs : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    minStock: row.min_stock,
    archived: row.archived,
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flavors (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL,
      name TEXT NOT NULL,
      packs JSONB NOT NULL DEFAULT '[]'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      min_stock INTEGER NOT NULL DEFAULT 1,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const countResult = await pool.query("SELECT COUNT(*) FROM flavors");
  const count = Number(countResult.rows[0].count);

  if (count === 0) {
    for (const flavor of defaultFlavors) {
      await pool.query(
        `
          INSERT INTO flavors (brand, name, packs, tags, min_stock, archived)
          VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
        `,
        [
          flavor.brand,
          flavor.name,
          JSON.stringify(flavor.packs),
          JSON.stringify(flavor.tags),
          flavor.minStock,
          flavor.archived,
        ]
      );
    }
  }
}

async function getAllFlavors() {
  const result = await pool.query(`
    SELECT *
    FROM flavors
    ORDER BY brand ASC, name ASC
  `);

  return result.rows.map(normalizeFlavor);
}

async function getFlavorById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM flavors
      WHERE id = $1
    `,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return normalizeFlavor(result.rows[0]);
}

app.get("/", (req, res) => {
  res.json({
    message: "Hookah Tobacco Inventory API is running",
  });
});

app.get("/api/flavors", async (req, res) => {
  try {
    const flavors = await getAllFlavors();
    res.json(flavors);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Не удалось получить вкусы",
    });
  }
});

app.post("/api/flavors/supply", async (req, res) => {
  try {
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

    const existingResult = await pool.query(
      `
        SELECT *
        FROM flavors
        WHERE LOWER(brand) = LOWER($1)
          AND LOWER(name) = LOWER($2)
        LIMIT 1
      `,
      [normalizedBrand, normalizedName]
    );

    if (existingResult.rows.length === 0) {
      const packs = [
        {
          weight: normalizedWeight,
          quantity: parsedQuantity,
        },
      ];

      const insertResult = await pool.query(
        `
          INSERT INTO flavors (brand, name, packs, tags, min_stock, archived)
          VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, false)
          RETURNING *
        `,
        [
          normalizedBrand,
          normalizedName,
          JSON.stringify(packs),
          JSON.stringify(incomingTags),
          parsedMinStock,
        ]
      );

      return res.status(201).json(normalizeFlavor(insertResult.rows[0]));
    }

    const existingFlavor = normalizeFlavor(existingResult.rows[0]);
    const packs = [...existingFlavor.packs];

    const existingPackIndex = packs.findIndex(
      (pack) => pack.weight.toLowerCase() === normalizedWeight.toLowerCase()
    );

    if (existingPackIndex === -1) {
      packs.push({
        weight: normalizedWeight,
        quantity: parsedQuantity,
      });
    } else {
      packs[existingPackIndex] = {
        ...packs[existingPackIndex],
        quantity: Number(packs[existingPackIndex].quantity) + parsedQuantity,
      };
    }

    const mergedTags = Array.from(
      new Set([...existingFlavor.tags, ...incomingTags])
    );

    const updateResult = await pool.query(
      `
        UPDATE flavors
        SET packs = $1::jsonb,
            tags = $2::jsonb,
            min_stock = $3,
            archived = false,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [
        JSON.stringify(packs),
        JSON.stringify(mergedTags),
        parsedMinStock,
        existingFlavor.id,
      ]
    );

    res.json(normalizeFlavor(updateResult.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Не удалось добавить поставку",
    });
  }
});




app.post("/api/flavors/import", async (req, res) => {
  const { rows } = req.body;

  if (!Array.isArray(rows)) {
    return res.status(400).json({ message: "Неверный формат Excel-данных" });
  }

  const groupedFlavors = new Map();

  for (const row of rows) {
    const brand = String(row.brand || "").trim();
    const name = String(row.name || "").trim();
    const weight = String(row.weight || "").trim();
    const quantity = Number(row.quantity || 0);
    const purchasedQuantity = Number(
      row.purchasedQuantity === undefined || row.purchasedQuantity === ""
        ? quantity
        : row.purchasedQuantity
    );
    const archived = Boolean(row.archived);
    const lowStock = Boolean(row.lowStock);

    if (
      !brand ||
      !name ||
      !weight ||
      Number.isNaN(quantity) ||
      quantity < 0 ||
      Number.isNaN(purchasedQuantity) ||
      purchasedQuantity < 0
    ) {
      continue;
    }

    const key = `${brand.toLowerCase()}||${name.toLowerCase()}`;

    if (!groupedFlavors.has(key)) {
      groupedFlavors.set(key, {
        brand,
        name,
        packsByWeight: new Map(),
        tags: new Set(),
        archived,
        lowStock,
      });
    }

    const flavor = groupedFlavors.get(key);
    const previousPack = flavor.packsByWeight.get(weight) || {
      quantity: 0,
      purchasedQuantity: 0,
    };

    flavor.packsByWeight.set(weight, {
      quantity: previousPack.quantity + quantity,
      purchasedQuantity: previousPack.purchasedQuantity + purchasedQuantity,
    });

    if (Array.isArray(row.tags)) {
      row.tags.forEach((tag) => {
        const cleanTag = String(tag).trim();
        if (cleanTag) {
          flavor.tags.add(cleanTag);
        }
      });
    } else if (row.tags) {
      String(row.tags)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .forEach((tag) => flavor.tags.add(tag));
    }

    if (archived) {
      flavor.archived = true;
    }

    if (lowStock) {
      flavor.lowStock = true;
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let importedCount = 0;

    for (const flavor of groupedFlavors.values()) {
      const packs = Array.from(flavor.packsByWeight.entries()).map(
        ([weight, pack]) => ({
          weight,
          quantity: pack.quantity,
          purchasedQuantity: pack.purchasedQuantity,
        })
      );

      const tags = Array.from(flavor.tags);

      const existingFlavor = await client.query(
        `
          SELECT id
          FROM flavors
          WHERE LOWER(brand) = LOWER($1)
            AND LOWER(name) = LOWER($2)
          LIMIT 1
        `,
        [flavor.brand, flavor.name]
      );

      if (existingFlavor.rows.length > 0) {
        await client.query(
          `
            UPDATE flavors
            SET packs = $1,
                tags = $2,
                min_stock = 0,
                archived = $3,
                low_stock = $4,
                updated_at = NOW()
            WHERE id = $5
          `,
          [
            JSON.stringify(packs),
            JSON.stringify(tags),
            flavor.archived,
            flavor.lowStock,
            existingFlavor.rows[0].id,
          ]
        );
      } else {
        await client.query(
          `
            INSERT INTO flavors (brand, name, packs, tags, min_stock, archived, low_stock)
            VALUES ($1, $2, $3, $4, 0, $5, $6)
          `,
          [
            flavor.brand,
            flavor.name,
            JSON.stringify(packs),
            JSON.stringify(tags),
            flavor.archived,
            flavor.lowStock,
          ]
        );
      }

      importedCount += 1;
    }

    await client.query("COMMIT");

    res.json({
      message: "Excel импортирован",
      importedCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Import flavors error:", error);
    res.status(500).json({ message: "Не удалось импортировать Excel" });
  } finally {
    client.release();
  }
});

app.patch("/api/flavors/:id/decrease", async (req, res) => {
  try {
    const flavorId = Number(req.params.id);
    const flavor = await getFlavorById(flavorId);

    if (!flavor) {
      return res.status(404).json({
        message: "Вкус не найден",
      });
    }

    const packs = [...flavor.packs];
    const packIndex = packs.findIndex((pack) => Number(pack.quantity) > 0);

    if (packIndex === -1) {
      return res.status(400).json({
        message: "У этого вкуса уже нет пачек",
      });
    }

    packs[packIndex] = {
      ...packs[packIndex],
      quantity: Number(packs[packIndex].quantity) - 1,
    };

    const result = await pool.query(
      `
        UPDATE flavors
        SET packs = $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(packs), flavorId]
    );

    res.json(normalizeFlavor(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Не удалось списать пачку",
    });
  }
});

app.patch("/api/flavors/:id/clear", async (req, res) => {
  try {
    const flavorId = Number(req.params.id);
    const flavor = await getFlavorById(flavorId);

    if (!flavor) {
      return res.status(404).json({
        message: "Вкус не найден",
      });
    }

    const packs = flavor.packs.map((pack) => ({
      ...pack,
      quantity: 0,
    }));

    const result = await pool.query(
      `
        UPDATE flavors
        SET packs = $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(packs), flavorId]
    );

    res.json(normalizeFlavor(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Не удалось выбить вкус",
    });
  }
});

app.put("/api/flavors/:id", async (req, res) => {
  try {
    const flavorId = Number(req.params.id);
    const { brand, name, packs, tags, minStock } = req.body;

    if (!brand || !name || !Array.isArray(packs) || packs.length === 0) {
      return res.status(400).json({
        message: "Бренд, вкус и хотя бы одна фасовка обязательны",
      });
    }

    const normalizedPacks = packs
      .map((pack) => ({
        weight: String(pack.weight || "").trim(),
        quantity: Number(pack.quantity),
      }))
      .filter((pack) => pack.weight && pack.quantity >= 0);

    if (normalizedPacks.length === 0) {
      return res.status(400).json({
        message: "Добавьте хотя бы одну корректную фасовку",
      });
    }

    const normalizedTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    const result = await pool.query(
      `
        UPDATE flavors
        SET brand = $1,
            name = $2,
            packs = $3::jsonb,
            tags = $4::jsonb,
            min_stock = $5,
            archived = false,
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
      [
        String(brand).trim(),
        String(name).trim(),
        JSON.stringify(normalizedPacks),
        JSON.stringify(normalizedTags),
        Number(minStock) || 1,
        flavorId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Вкус не найден",
      });
    }

    res.json(normalizeFlavor(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Не удалось сохранить изменения",
    });
  }
});



app.patch("/api/flavors/:id/low-stock", async (req, res) => {
  const { lowStock } = req.body;

  try {
    const result = await pool.query(
      `
        UPDATE flavors
        SET low_stock = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [Boolean(lowStock), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Low stock toggle error:", error);
    res.status(500).json({ message: "Не удалось изменить статус вкуса" });
  }
});

app.patch("/api/flavors/:id/archive", async (req, res) => {
  try {
    const result = await pool.query(
      `
        UPDATE flavors
        SET archived = TRUE, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Archive flavor error:", error);
    res.status(500).json({ message: "Не удалось отправить вкус в архив" });
  }
});

app.patch("/api/flavors/:id/restore", async (req, res) => {
  try {
    const result = await pool.query(
      `
        UPDATE flavors
        SET archived = FALSE, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Restore flavor error:", error);
    res.status(500).json({ message: "Не удалось вернуть вкус из архива" });
  }
});

app.delete("/api/flavors/:id", async (req, res) => {
  try {
    const flavorId = Number(req.params.id);

    const result = await pool.query(
      `
        DELETE FROM flavors
        WHERE id = $1
        RETURNING id
      `,
      [flavorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Вкус не найден",
      });
    }

    res.json({
      message: "Вкус удалён",
      id: flavorId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Не удалось удалить вкус",
    });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
