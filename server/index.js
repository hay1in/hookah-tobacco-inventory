const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

function requireAdminPassword(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const testPassword = process.env.TEST_PASSWORD || "test";

  if (!adminPassword) {
    return res.status(500).json({
      message: "ADMIN_PASSWORD is not configured",
    });
  }

  const providedPassword = req.headers["x-admin-password"];

  if (providedPassword === adminPassword) {
    req.accessRole = "admin";
    return next();
  }

  if (providedPassword === testPassword) {
    req.accessRole = "test";

    if (req.method === "GET") {
      return next();
    }

    return res.status(403).json({
      message: "Ознакомительный режим: изменения запрещены",
    });
  }

  return res.status(401).json({
    message: "Неверный пароль",
  });
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


app.delete("/api/admin/clear-database", async (req, res) => {
  try {
    await ensureActionLogsTable();
    await pool.query("TRUNCATE TABLE flavors, action_logs RESTART IDENTITY");

    res.json({
      message: "База данных очищена",
    });
  } catch (error) {
    console.error("Clear database error:", error);
    res.status(500).json({ message: "Не удалось очистить базу данных" });
  }
});

app.post("/api/admin/restore-backup", async (req, res) => {
  const backup = req.body || {};
  const flavors = Array.isArray(backup.flavors) ? backup.flavors : null;
  const actionLogs = Array.isArray(backup.actionLogs) ? backup.actionLogs : [];

  if (!flavors) {
    return res.status(400).json({
      message: "Некорректный JSON backup: не найден массив flavors",
    });
  }

  if (backup.app && backup.app !== "hookah-tobacco-inventory") {
    return res.status(400).json({
      message: "Этот JSON backup не похож на backup Hookah Inventory",
    });
  }

  const parseDetails = (details) => {
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

  const client = await pool.connect();

  try {
    await ensureActionLogsTable();

    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS purchase_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS excluded_from_deadstock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query("BEGIN");

    await client.query("TRUNCATE TABLE flavors, action_logs RESTART IDENTITY");

    for (const flavor of flavors) {
      const id = Number(flavor.id);
      const brand = String(flavor.brand || "").trim();
      const name = String(flavor.name || "").trim();
      const packs = Array.isArray(flavor.packs) ? flavor.packs : [];
      const tags = Array.isArray(flavor.tags) ? flavor.tags : [];
      const rawMinStock = Number(flavor.minStock ?? flavor.min_stock ?? 1);
      const minStock = Number.isFinite(rawMinStock) ? rawMinStock : 1;
      const archived = Boolean(flavor.archived);
      const lowStock = Boolean(flavor.lowStock || flavor.low_stock);
      const purchaseConfirmed = Boolean(
        flavor.purchaseConfirmed || flavor.purchase_confirmed
      );
      const excludedFromDeadstock = Boolean(
        flavor.excludedFromDeadstock || flavor.excluded_from_deadstock
      );
      const createdAt = flavor.createdAt || flavor.created_at || new Date().toISOString();
      const updatedAt = flavor.updatedAt || flavor.updated_at || createdAt;

      if (!Number.isInteger(id) || id <= 0 || !brand || !name) {
        throw new Error("В backup есть вкус с некорректным id, брендом или названием");
      }

      await client.query(
        `
          INSERT INTO flavors (
            id,
            brand,
            name,
            packs,
            tags,
            min_stock,
            archived,
            low_stock,
            purchase_confirmed,
            excluded_from_deadstock,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          id,
          brand,
          name,
          JSON.stringify(packs),
          JSON.stringify(tags),
          minStock,
          archived,
          lowStock,
          purchaseConfirmed,
          excludedFromDeadstock,
          createdAt,
          updatedAt,
        ]
      );
    }

    for (const log of actionLogs) {
      const id = Number(log.id);
      const action = String(log.action || "").trim();
      const rawFlavorId = log.flavorId ?? log.flavor_id ?? null;
      const flavorIdNumber = Number(rawFlavorId);
      const flavorId =
        Number.isInteger(flavorIdNumber) && flavorIdNumber > 0
          ? flavorIdNumber
          : null;
      const brand = String(log.brand || log.flavorBrand || log.flavor_brand || "");
      const name = String(log.name || log.flavorName || log.flavor_name || "");
      const details = parseDetails(log.details);
      const createdAt = log.createdAt || log.created_at || log.date || new Date().toISOString();

      if (!Number.isInteger(id) || id <= 0 || !action) {
        throw new Error("В backup есть действие с некорректным id или action");
      }

      await client.query(
        `
          INSERT INTO action_logs (
            id,
            action,
            flavor_id,
            brand,
            name,
            details,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `,
        [
          id,
          action,
          flavorId,
          brand,
          name,
          JSON.stringify(details),
          createdAt,
        ]
      );
    }

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('flavors', 'id'),
        COALESCE((SELECT MAX(id) FROM flavors), 1),
        (SELECT COUNT(*) > 0 FROM flavors)
      );
    `);

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('action_logs', 'id'),
        COALESCE((SELECT MAX(id) FROM action_logs), 1),
        (SELECT COUNT(*) > 0 FROM action_logs)
      );
    `);

    await client.query("COMMIT");

    res.json({
      message: "Backup восстановлен",
      restoredFlavors: flavors.length,
      restoredActionLogs: actionLogs.length,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("Restore backup error:", error);
    res.status(500).json({
      message: `Не удалось восстановить backup: ${error.message}`,
    });
  } finally {
    client.release();
  }
});


app.get("/", (req, res) => {
  res.json({
    message: "Hookah Tobacco Inventory API is running",
  });
});




async function ensureActionLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS action_logs (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      flavor_id INTEGER,
      brand TEXT,
      name TEXT,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

app.get("/api/action-logs", async (req, res) => {
  try {
    await ensureActionLogsTable();

    const result = await pool.query(`
      SELECT
        id,
        action,
        flavor_id AS "flavorId",
        brand,
        name,
        details,
        created_at AS "createdAt"
      FROM action_logs
      ORDER BY created_at DESC
      
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get action logs error:", error);
    res.status(500).json({ message: "Не удалось получить историю действий" });
  }
});

app.post("/api/action-logs", async (req, res) => {
  const { action, flavorId, brand, name, details } = req.body;

  if (!action) {
    return res.status(400).json({ message: "Не указано действие" });
  }

  try {
    await ensureActionLogsTable();

    const result = await pool.query(
      `
        INSERT INTO action_logs (action, flavor_id, brand, name, details)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          action,
          flavor_id AS "flavorId",
          brand,
          name,
          details,
          created_at AS "createdAt"
      `,
      [
        action,
        flavorId || null,
        brand || "",
        name || "",
        JSON.stringify(details || {}),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create action log error:", error);
    res.status(500).json({ message: "Не удалось сохранить действие" });
  }
});


app.patch("/api/action-logs/:id", async (req, res) => {
  const logId = Number(req.params.id);
  const { details } = req.body;

  if (!Number.isInteger(logId)) {
    return res.status(400).json({ message: "Некорректный ID действия" });
  }

  try {
    await ensureActionLogsTable();

    const result = await pool.query(
      `
        UPDATE action_logs
        SET details = $1
        WHERE id = $2
        RETURNING
          id,
          action,
          flavor_id AS "flavorId",
          brand,
          name,
          details,
          created_at AS "createdAt"
      `,
      [JSON.stringify(details || {}), logId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Действие не найдено" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update action log error:", error);
    res.status(500).json({ message: "Не удалось обновить действие" });
  }
});



app.post("/api/admin/transfer-action-logs", async (req, res) => {
  const { fromBrand, fromName, toBrand, toName } = req.body;

  const cleanFromBrand = String(fromBrand || "").trim();
  const cleanFromName = String(fromName || "").trim();
  const cleanToBrand = String(toBrand || "").trim();
  const cleanToName = String(toName || "").trim();

  if (!cleanFromBrand || !cleanFromName || !cleanToBrand || !cleanToName) {
    return res.status(400).json({
      message: "Нужно указать fromBrand, fromName, toBrand и toName",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const targetResult = await client.query(
      `
        SELECT id, brand, name
        FROM flavors
        WHERE LOWER(brand) = LOWER($1)
          AND LOWER(name) = LOWER($2)
        ORDER BY id
        LIMIT 1
      `,
      [cleanToBrand, cleanToName]
    );

    if (targetResult.rows.length === 0) {
      throw new Error(`Целевой вкус не найден: ${cleanToBrand} — ${cleanToName}`);
    }

    const targetFlavor = targetResult.rows[0];

    const updateResult = await client.query(
      `
        UPDATE action_logs
        SET flavor_id = $1
        WHERE LOWER(brand) = LOWER($2)
          AND LOWER(name) = LOWER($3)
          AND (
            flavor_id IS NULL
            OR flavor_id <> $1
          )
        RETURNING id
      `,
      [targetFlavor.id, cleanFromBrand, cleanFromName]
    );

    await client.query("COMMIT");

    res.json({
      transferredCount: updateResult.rowCount,
      targetFlavor,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Transfer action logs error:", error);
    res.status(500).json({
      message: error.message || "Не удалось перенести историю",
    });
  } finally {
    client.release();
  }
});


app.post("/api/flavors/merge", async (req, res) => {
  const { primaryId, duplicateIds } = req.body;

  const ids = [primaryId, ...(duplicateIds || [])]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id));

  if (!primaryId || ids.length < 2) {
    return res.status(400).json({ message: "Недостаточно вкусов для объединения" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS purchase_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    const result = await client.query(
      "SELECT * FROM flavors WHERE id = ANY($1::int[])",
      [ids]
    );

    if (result.rows.length !== ids.length) {
      throw new Error("Один или несколько дублей не найдены");
    }

    const primaryFlavor = result.rows.find((row) => row.id === Number(primaryId));

    if (!primaryFlavor) {
      throw new Error("Основной вкус не найден");
    }

    const packMap = new Map();
    const tagSet = new Set();

    result.rows.forEach((flavor) => {
      const packs = Array.isArray(flavor.packs) ? flavor.packs : [];

      packs.forEach((pack) => {
        const weight = String(pack.weight || "Без фасовки").trim();
        const quantity = Number(pack.quantity || 0);
        const purchasedQuantity = Number(
          pack.purchasedQuantity ?? pack.purchased_quantity ?? quantity
        );

        const previous = packMap.get(weight) || {
          weight,
          quantity: 0,
          purchasedQuantity: 0,
        };

        packMap.set(weight, {
          weight,
          quantity: previous.quantity + quantity,
          purchasedQuantity: previous.purchasedQuantity + purchasedQuantity,
        });
      });

      const tags = Array.isArray(flavor.tags) ? flavor.tags : [];

      tags.forEach((tag) => {
        const cleanTag = String(tag).trim();

        if (cleanTag) {
          tagSet.add(cleanTag);
        }
      });
    });

    const mergedPacks = Array.from(packMap.values());
    const mergedTags = Array.from(tagSet.values()).sort((a, b) =>
      a.localeCompare(b, "ru")
    );

    const mergedArchived = result.rows.every((row) => row.archived);
    const mergedLowStock = result.rows.some((row) => row.low_stock);
    const mergedPurchaseConfirmed = result.rows.some(
      (row) => row.purchase_confirmed
    );

    const updateResult = await client.query(
      `
        UPDATE flavors
        SET
          packs = $1,
          tags = $2,
          archived = $3,
          low_stock = $4,
          purchase_confirmed = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
      [
        JSON.stringify(mergedPacks),
        JSON.stringify(mergedTags),
        mergedArchived,
        mergedLowStock,
        mergedPurchaseConfirmed,
        primaryFlavor.id,
      ]
    );

    const idsToDelete = ids.filter((id) => id !== Number(primaryId));

    await client.query(
      `
        UPDATE action_logs
        SET flavor_id = $1
        WHERE flavor_id = ANY($2::int[])
      `,
      [primaryFlavor.id, idsToDelete]
    );

    await client.query("DELETE FROM flavors WHERE id = ANY($1::int[])", [
      idsToDelete,
    ]);

    await client.query("COMMIT");

    res.json({
      mergedFlavor: updateResult.rows[0],
      deletedCount: idsToDelete.length,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Merge flavors error:", error);
    res.status(500).json({ message: error.message || "Не удалось объединить дубли" });
  } finally {
    client.release();
  }
});


app.post("/api/tags/merge", async (req, res) => {
  const { fromTags, toTag } = req.body;

  const cleanToTag = String(toTag || "").trim();
  const cleanFromTags = Array.isArray(fromTags)
    ? fromTags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  if (!cleanToTag || cleanFromTags.length === 0) {
    return res.status(400).json({ message: "Не указаны теги для объединения" });
  }

  const normalizedFromTags = new Set(
    cleanFromTags.map((tag) => tag.toLowerCase().replace(/ё/g, "е"))
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query("SELECT id, tags FROM flavors");

    let updatedCount = 0;

    for (const flavor of result.rows) {
      const tags = Array.isArray(flavor.tags) ? flavor.tags : [];

      const shouldUpdate = tags.some((tag) =>
        normalizedFromTags.has(String(tag).toLowerCase().replace(/ё/g, "е"))
      );

      if (!shouldUpdate) {
        continue;
      }

      const nextTags = [];

      tags.forEach((tag) => {
        const normalizedTag = String(tag).toLowerCase().replace(/ё/g, "е");

        if (normalizedFromTags.has(normalizedTag)) {
          if (
            !nextTags.some(
              (item) =>
                item.toLowerCase().replace(/ё/g, "е") ===
                cleanToTag.toLowerCase().replace(/ё/g, "е")
            )
          ) {
            nextTags.push(cleanToTag);
          }

          return;
        }

        if (
          !nextTags.some(
            (item) =>
              item.toLowerCase().replace(/ё/g, "е") === normalizedTag
          )
        ) {
          nextTags.push(tag);
        }
      });

      await client.query(
        "UPDATE flavors SET tags = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(nextTags), flavor.id]
      );

      updatedCount += 1;
    }

    await client.query("COMMIT");

    res.json({
      mergedTo: cleanToTag,
      updatedCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Merge tags error:", error);
    res.status(500).json({ message: "Не удалось объединить теги" });
  } finally {
    client.release();
  }
});


app.post("/api/flavors/bulk", async (req, res) => {
  const { ids, action } = req.body;

  const cleanIds = Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id))
    : [];

  if (cleanIds.length === 0) {
    return res.status(400).json({ message: "Не выбраны вкусы" });
  }

  const allowedActions = new Set([
    "archive",
    "restore",
    "low_stock_on",
    "low_stock_off",
    "purchase_confirmed_on",
    "purchase_confirmed_off",
  ]);

  if (!allowedActions.has(action)) {
    return res.status(400).json({ message: "Некорректное массовое действие" });
  }

  try {
    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS purchase_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    let query = "";

    if (action === "archive") {
      query = `
        UPDATE flavors
        SET archived = TRUE, updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING *
      `;
    }

    if (action === "restore") {
      query = `
        UPDATE flavors
        SET archived = FALSE, updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING *
      `;
    }

    if (action === "low_stock_on") {
      query = `
        UPDATE flavors
        SET low_stock = TRUE, updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING *
      `;
    }

    if (action === "low_stock_off") {
      query = `
        UPDATE flavors
        SET low_stock = FALSE, updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING *
      `;
    }

    if (action === "purchase_confirmed_on") {
      query = `
        UPDATE flavors
        SET purchase_confirmed = TRUE, updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING *
      `;
    }

    if (action === "purchase_confirmed_off") {
      query = `
        UPDATE flavors
        SET purchase_confirmed = FALSE, updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING *
      `;
    }

    const result = await pool.query(query, [cleanIds]);

    res.json({
      updatedCount: result.rows.length,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    res.status(500).json({ message: "Не удалось выполнить массовое действие" });
  }
});

app.get("/api/flavors", async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS purchase_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS excluded_from_deadstock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    const result = await pool.query(`
      SELECT
        id,
        brand,
        name,
        packs,
        tags,
        min_stock AS "minStock",
        archived,
        low_stock AS "lowStock",
        purchase_confirmed AS "purchaseConfirmed",
        excluded_from_deadstock AS "excludedFromDeadstock",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM flavors
      ORDER BY brand ASC, name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get flavors error:", error);
    res.status(500).json({ message: "Не удалось получить вкусы" });
  }
});

app.post("/api/flavors/supply", async (req, res) => {
  const { brand, name, weight, quantity, tags = [], minStock = 0 } = req.body;

  const cleanBrand = String(brand || "").trim();
  const cleanName = String(name || "").trim();
  const cleanWeight = String(weight || "").trim();
  const cleanQuantity = Number(quantity || 0);

  if (!cleanBrand || !cleanName || !cleanWeight || cleanQuantity <= 0) {
    return res.status(400).json({ message: "Заполните бренд, вкус, фасовку и количество" });
  }

  try {
    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS excluded_from_deadstock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    const existingFlavor = await pool.query(
      `
        SELECT *
        FROM flavors
        WHERE LOWER(brand) = LOWER($1)
          AND LOWER(name) = LOWER($2)
        LIMIT 1
      `,
      [cleanBrand, cleanName]
    );

    const cleanTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean)
      : String(tags)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);

    if (existingFlavor.rows.length > 0) {
      const flavor = existingFlavor.rows[0];
      const packs = Array.isArray(flavor.packs) ? flavor.packs : [];
      const existingPack = packs.find(
        (pack) => String(pack.weight).toLowerCase() === cleanWeight.toLowerCase()
      );

      if (existingPack) {
        const currentQuantity = Number(existingPack.quantity || 0);
        const currentPurchasedQuantity = Number(
          existingPack.purchasedQuantity ??
            existingPack.purchased_quantity ??
            currentQuantity
        );

        existingPack.quantity = currentQuantity + cleanQuantity;
        existingPack.purchasedQuantity = currentPurchasedQuantity + cleanQuantity;
        delete existingPack.purchased_quantity;
      } else {
        packs.push({
          weight: cleanWeight,
          quantity: cleanQuantity,
          purchasedQuantity: cleanQuantity,
        });
      }

      const mergedTags = Array.from(
        new Set([...(flavor.tags || []), ...cleanTags].map((tag) => String(tag).trim()).filter(Boolean))
      );

        const totalQuantityAfterSupply = packs.reduce((sum, pack) => {
          return sum + Number(pack.quantity || 0);
        }, 0);

        const nextLowStock =
          totalQuantityAfterSupply >= 2 ? false : Boolean(flavor.low_stock);

        const result = await pool.query(
          `
            UPDATE flavors
            SET packs = $1,
                tags = $2,
                min_stock = $3,
                low_stock = $4,
                archived = FALSE,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
          `,
          [
            JSON.stringify(packs),
            JSON.stringify(mergedTags),
            Number(minStock || 0),
            nextLowStock,
            flavor.id,
          ]
        );

      return res.status(200).json(result.rows[0]);
    }

    const result = await pool.query(
      `
        INSERT INTO flavors (brand, name, packs, tags, min_stock, archived, low_stock, excluded_from_deadstock)
        VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, FALSE)
        RETURNING *
      `,
      [
        cleanBrand,
        cleanName,
        JSON.stringify([
          {
            weight: cleanWeight,
            quantity: cleanQuantity,
            purchasedQuantity: cleanQuantity,
          },
        ]),
        JSON.stringify(cleanTags),
        Number(minStock || 0),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Supply error:", error);
    res.status(500).json({ message: "Не удалось добавить поставку" });
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
      const excludedFromDeadstock = Boolean(
        row.excludedFromDeadstock || row.excluded_from_deadstock
      );
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
                excludedFromDeadstock,
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

    if (excludedFromDeadstock) {
      flavor.excludedFromDeadstock = true;
    }
  }

  const client = await pool.connect();

  try {
    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS excluded_from_deadstock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

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
          SELECT id, tags
          FROM flavors
          WHERE LOWER(brand) = LOWER($1)
            AND LOWER(name) = LOWER($2)
          LIMIT 1
        `,
        [flavor.brand, flavor.name]
      );

      if (existingFlavor.rows.length > 0) {
        const existingTags = Array.isArray(existingFlavor.rows[0].tags)
          ? existingFlavor.rows[0].tags
          : [];

        const mergedTags = Array.from(
          new Set(
            [...existingTags, ...tags]
              .map((tag) => String(tag || "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, "ru"));

        await client.query(
          `
            UPDATE flavors
            SET packs = $1,
                tags = $2,
                min_stock = 0,
                archived = $3,
                low_stock = $4,
                excluded_from_deadstock = $5,
                updated_at = NOW()
            WHERE id = $6
          `,
          [
            JSON.stringify(packs),
            JSON.stringify(mergedTags),
            flavor.archived,
            flavor.lowStock,
            flavor.excludedFromDeadstock,
            existingFlavor.rows[0].id,
          ]
        );
      } else {
        await client.query(
          `
            INSERT INTO flavors (brand, name, packs, tags, min_stock, archived, low_stock, excluded_from_deadstock)
            VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
          `,
          [
            flavor.brand,
            flavor.name,
            JSON.stringify(packs),
            JSON.stringify(tags),
            flavor.archived,
            flavor.lowStock,
            flavor.excludedFromDeadstock,
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
    res.status(500).json({
      message: `Не удалось импортировать Excel: ${error.message}`,
    });
  } finally {
    client.release();
  }
});



app.patch("/api/flavors/:id/packs/:packIndex/adjust", async (req, res) => {
  const delta = Number(req.body.delta);

  if (![1, -1].includes(delta)) {
    return res.status(400).json({ message: "Некорректное изменение фасовки" });
  }

  try {
    const flavorResult = await pool.query(
      "SELECT * FROM flavors WHERE id = $1",
      [req.params.id]
    );

    if (flavorResult.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    const flavor = flavorResult.rows[0];
    const packs = Array.isArray(flavor.packs) ? flavor.packs : [];
    const packIndex = Number(req.params.packIndex);

    if (!Number.isInteger(packIndex) || packIndex < 0 || packIndex >= packs.length) {
      return res.status(404).json({ message: "Фасовка не найдена" });
    }

    const pack = packs[packIndex];

    const currentQuantity = Number(pack.quantity || 0);
    const currentPurchasedQuantity = Number(
      pack.purchasedQuantity ?? pack.purchased_quantity ?? currentQuantity
    );

    if (delta === 1) {
      pack.quantity = currentQuantity + 1;
      pack.purchasedQuantity = currentPurchasedQuantity + 1;
    } else {
      pack.quantity = Math.max(currentQuantity - 1, 0);
      pack.purchasedQuantity = Math.max(currentPurchasedQuantity, currentQuantity);
    }

    delete pack.purchased_quantity;

    const shouldRestoreFromArchive = delta === 1;

    const result = await pool.query(
      `
        UPDATE flavors
        SET
          packs = $1,
          archived = CASE WHEN $3 THEN FALSE ELSE archived END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(packs), req.params.id, shouldRestoreFromArchive]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Adjust pack error:", error);
    res.status(500).json({ message: "Не удалось изменить фасовку" });
  }
});

app.patch("/api/flavors/:id/increase", async (req, res) => {
  try {
    const flavorResult = await pool.query(
      "SELECT * FROM flavors WHERE id = $1",
      [req.params.id]
    );

    if (flavorResult.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    const flavor = flavorResult.rows[0];
    const packs = Array.isArray(flavor.packs) ? flavor.packs : [];

    if (packs.length === 0) {
      return res.status(400).json({ message: "У вкуса нет фасовок" });
    }

    const pack = packs[0];

    const currentQuantity = Number(pack.quantity || 0);
    const currentPurchasedQuantity = Number(
      pack.purchasedQuantity ?? pack.purchased_quantity ?? currentQuantity
    );

    pack.quantity = currentQuantity + 1;
    pack.purchasedQuantity = currentPurchasedQuantity + 1;

    delete pack.purchased_quantity;

    const result = await pool.query(
      `
        UPDATE flavors
        SET packs = $1, archived = FALSE, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(packs), req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Increase flavor error:", error);
    res.status(500).json({ message: "Не удалось добавить пачку" });
  }
});

app.patch("/api/flavors/:id/decrease", async (req, res) => {
  try {
    const flavorResult = await pool.query(
      "SELECT * FROM flavors WHERE id = $1",
      [req.params.id]
    );

    if (flavorResult.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    const flavor = flavorResult.rows[0];
    const packs = Array.isArray(flavor.packs) ? flavor.packs : [];
    const pack = packs.find((item) => Number(item.quantity || 0) > 0);

    if (!pack) {
      return res.status(400).json({ message: "Нечего списывать" });
    }

    const currentQuantity = Number(pack.quantity || 0);
    const currentPurchasedQuantity = Number(
      pack.purchasedQuantity ?? pack.purchased_quantity ?? currentQuantity
    );

    pack.purchasedQuantity = Math.max(currentPurchasedQuantity, currentQuantity);
    pack.quantity = Math.max(currentQuantity - 1, 0);

    delete pack.purchased_quantity;

    const result = await pool.query(
      `
        UPDATE flavors
        SET packs = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(packs), req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Decrease flavor error:", error);
    res.status(500).json({ message: "Не удалось списать пачку" });
  }
});

app.patch("/api/flavors/:id/clear", async (req, res) => {
  try {
    const flavorResult = await pool.query(
      "SELECT * FROM flavors WHERE id = $1",
      [req.params.id]
    );

    if (flavorResult.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    const flavor = flavorResult.rows[0];
    const packs = Array.isArray(flavor.packs) ? flavor.packs : [];

    const clearedPacks = packs.map((pack) => {
      const currentQuantity = Number(pack.quantity || 0);
      const currentPurchasedQuantity = Number(
        pack.purchasedQuantity ?? pack.purchased_quantity ?? currentQuantity
      );

      return {
        ...pack,
        quantity: 0,
        purchasedQuantity: Math.max(currentPurchasedQuantity, currentQuantity),
      };
    });

    const result = await pool.query(
      `
        UPDATE flavors
        SET packs = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(clearedPacks), req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Clear flavor error:", error);
    res.status(500).json({ message: "Не удалось выбить вкус" });
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

    const currentFlavorResult = await pool.query(
      "SELECT packs FROM flavors WHERE id = $1",
      [flavorId]
    );

    const currentPacks = Array.isArray(currentFlavorResult.rows[0]?.packs)
      ? currentFlavorResult.rows[0].packs
      : [];

    const normalizedPacks = packs
      .map((pack) => {
        const weight = String(pack.weight || "").trim();
        const quantity = Number(pack.quantity);
        const existingPack = currentPacks.find((item) => {
          return String(item.weight || "").trim().toLowerCase() ===
            weight.toLowerCase();
        });

        const purchasedQuantity = Number(
          pack.purchasedQuantity ??
            pack.purchased_quantity ??
            existingPack?.purchasedQuantity ??
            existingPack?.purchased_quantity ??
            quantity
        );

        return {
          weight,
          quantity,
          purchasedQuantity: Math.max(purchasedQuantity, quantity),
        };
      })
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




app.patch("/api/flavors/:id/deadstock-excluded", async (req, res) => {
  const { id } = req.params;
  const { excludedFromDeadstock } = req.body;

  try {
    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS excluded_from_deadstock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    const result = await pool.query(
      `
        UPDATE flavors
        SET excluded_from_deadstock = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [Boolean(excludedFromDeadstock), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Не удалось изменить настройку залежей" });
  }
});

app.patch("/api/flavors/:id/purchase-confirmed", async (req, res) => {
  const { purchaseConfirmed } = req.body;

  try {
    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS purchase_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    const result = await pool.query(
      `
        UPDATE flavors
        SET purchase_confirmed = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [Boolean(purchaseConfirmed), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Вкус не найден" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Purchase confirm error:", error);
    res.status(500).json({ message: "Не удалось изменить подтверждение закупки" });
  }
});

app.patch("/api/flavors/:id/low-stock", async (req, res) => {
  const { lowStock } = req.body;

  try {
    await pool.query(`
      ALTER TABLE flavors
      ADD COLUMN IF NOT EXISTS low_stock BOOLEAN NOT NULL DEFAULT FALSE;
    `);

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
