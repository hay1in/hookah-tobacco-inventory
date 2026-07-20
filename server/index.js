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

app.get("/api/health", (req, res) => {
  res.status(200).json({
    message: "Hookah Tobacco Inventory API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", requireAdminPassword);

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to server/.env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL.includes("localhost") ||
    process.env.DATABASE_URL.includes("127.0.0.1") ||
    process.env.DATABASE_URL.includes("@db:")
      ? false
      : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
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

const CANONICAL_BRAND_NAMES = Object.freeze({
  chabacco: "Chabacco",
  "chabacco mix": "Chabacco",
  "chabacco medium": "Chabacco",
  deus: "Deus",
  "deus perfume": "Deus",
  jent: "Jent",
  "jent cigar": "Jent",
  "trofimoff's": "Trofimoff's",
  "trofimoff's terror": "Trofimoff's",
  "trofimoff’s": "Trofimoff's",
  "trofimoff’s terror": "Trofimoff's",
});

function normalizeBrandName(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  return CANONICAL_BRAND_NAMES[trimmedValue.toLowerCase()] || trimmedValue;
}

const STRENGTH_VALUES = Object.freeze([
  "unknown",
  "light",
  "medium",
  "strong",
  "extra_strong",
]);

function normalizeStrengthValue(value, { allowEmpty = false } = {}) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (!normalizedValue && allowEmpty) {
    return null;
  }

  return STRENGTH_VALUES.includes(normalizedValue)
    ? normalizedValue
    : "unknown";
}

async function ensureStrengthSchema(queryable = pool) {
  await queryable.query(`
    ALTER TABLE flavors
    ADD COLUMN IF NOT EXISTS strength_override TEXT;
  `);

  await queryable.query(`
    CREATE TABLE IF NOT EXISTS brand_settings (
      brand TEXT PRIMARY KEY,
      default_strength TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await queryable.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS brand_settings_brand_lower_unique
    ON brand_settings (LOWER(brand));
  `);
}

function normalizeFlavor(row) {
  const strengthOverride =
    row.strength_override === undefined
      ? row.strengthOverride ?? null
      : row.strength_override;

  const brandStrength =
    row.brand_strength === undefined
      ? row.brandStrength ?? "unknown"
      : row.brand_strength;

  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    packs: Array.isArray(row.packs) ? row.packs : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    minStock: row.min_stock ?? row.minStock,
    archived: row.archived,
    strengthOverride,
    brandStrength,
    effectiveStrength: strengthOverride || brandStrength || "unknown",
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

  await ensureStrengthSchema();

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

  await ensureSuppliesSchema();
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
    await ensureSuppliesSchema();
    await ensureStrengthSchema();

    await pool.query(
      "TRUNCATE TABLE flavors, action_logs, supplies, brand_settings RESTART IDENTITY"
    );

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
  const restoredBrandStrengths = new Map();

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
    await ensureSuppliesSchema();

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

    await ensureStrengthSchema(client);

    await client.query("BEGIN");

    await client.query(
      "TRUNCATE TABLE flavors, action_logs, supplies, brand_settings RESTART IDENTITY"
    );

    for (const flavor of flavors) {
      const id = Number(flavor.id);
      const brand = normalizeBrandName(flavor.brand);
      const name = String(flavor.name || "").trim();
      const packs = Array.isArray(flavor.packs) ? flavor.packs : [];
      const tags = Array.isArray(flavor.tags) ? flavor.tags : [];
      const strengthOverride = normalizeStrengthValue(
        flavor.strengthOverride ?? flavor.strength_override,
        { allowEmpty: true }
      );
      const brandStrength = normalizeStrengthValue(
        flavor.brandStrength ?? flavor.brand_strength
      );

      restoredBrandStrengths.set(brand, brandStrength);

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
            strength_override,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
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
          strengthOverride,
          createdAt,
          updatedAt,
        ]
      );
    }

    for (const [brand, defaultStrength] of restoredBrandStrengths.entries()) {
      await client.query(
        `
          INSERT INTO brand_settings (brand, default_strength)
          VALUES ($1, $2)
          ON CONFLICT (brand)
          DO UPDATE SET
            default_strength = EXCLUDED.default_strength,
            updated_at = NOW()
        `,
        [brand, defaultStrength]
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
      const brand = normalizeBrandName(
        log.brand || log.flavorBrand || log.flavor_brand || ""
      );
      const name = String(log.name || log.flavorName || log.flavor_name || "");
      const details = parseDetails(log.details);

      if (action === "supply") {
        details.supplier = normalizeSupplierName(details.supplier);
      }

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
    await ensureSuppliesSchema();

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

function parseActionDetailsObject(details) {
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
}

function normalizeSupplierName(value) {
  const originalValue = String(value || "").trim();

  if (!originalValue) {
    return "Без поставщика";
  }

  const key = originalValue
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const keyWithoutLegalForm = key
    .replace(/^ооо\s+/, "")
    .replace(/^ип\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  const compactKey = keyWithoutLegalForm.replace(/\s+/g, "");

  if (
    compactKey === "хукамаркет" ||
    compactKey === "хукаmarket" ||
    compactKey === "hookahmarket" ||
    compactKey === "hookamarket"
  ) {
    return "Хукамаркет";
  }

  return originalValue;
}


function normalizeSupplyDateValue(value) {
  const cleanValue = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return cleanValue;
  }

  return new Date().toISOString().slice(0, 10);
}

async function ensureSuppliesSchema() {
  await ensureActionLogsTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplies (
      id SERIAL PRIMARY KEY,
      supply_date DATE NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (supply_date, supplier, invoice_number)
    );
  `);

  await pool.query(`
    ALTER TABLE action_logs
    ADD COLUMN IF NOT EXISTS supply_id INTEGER;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'action_logs_supply_id_fkey'
      ) THEN
        ALTER TABLE action_logs
        ADD CONSTRAINT action_logs_supply_id_fkey
        FOREIGN KEY (supply_id)
        REFERENCES supplies(id)
        ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS action_logs_supply_id_idx
    ON action_logs(supply_id);
  `);

  await pool.query(`
    INSERT INTO supplies (
      supply_date,
      supplier,
      invoice_number
    )
    SELECT DISTINCT
      CASE
        WHEN COALESCE(
          NULLIF(details->>'suppliedAt', ''),
          NULLIF(details->>'supplyDate', ''),
          ''
        ) ~ '^\\d{4}-\\d{2}-\\d{2}$'
          THEN COALESCE(
            NULLIF(details->>'suppliedAt', ''),
            NULLIF(details->>'supplyDate', '')
          )::date
        ELSE created_at::date
      END,
      COALESCE(
        NULLIF(BTRIM(details->>'supplier'), ''),
        'Без поставщика'
      ),
      COALESCE(
        NULLIF(BTRIM(details->>'invoiceNumber'), ''),
        ''
      )
    FROM action_logs
    WHERE action = 'supply'
    ON CONFLICT (supply_date, supplier, invoice_number)
    DO UPDATE SET updated_at = NOW();
  `);

  await pool.query(`
    UPDATE action_logs AS log
    SET supply_id = supply.id
    FROM supplies AS supply
    WHERE log.action = 'supply'
      AND log.supply_id IS NULL
      AND supply.supply_date = CASE
        WHEN COALESCE(
          NULLIF(log.details->>'suppliedAt', ''),
          NULLIF(log.details->>'supplyDate', ''),
          ''
        ) ~ '^\\d{4}-\\d{2}-\\d{2}$'
          THEN COALESCE(
            NULLIF(log.details->>'suppliedAt', ''),
            NULLIF(log.details->>'supplyDate', '')
          )::date
        ELSE log.created_at::date
      END
      AND supply.supplier = COALESCE(
        NULLIF(BTRIM(log.details->>'supplier'), ''),
        'Без поставщика'
      )
      AND supply.invoice_number = COALESCE(
        NULLIF(BTRIM(log.details->>'invoiceNumber'), ''),
        ''
      );
  `);
}

async function resolveSupplyForDetails(details, preferredSupplyId = null) {
  await ensureSuppliesSchema();

  const preferredId = Number(preferredSupplyId);

  if (Number.isInteger(preferredId) && preferredId > 0) {
    const preferredResult = await pool.query(
      `
        SELECT *
        FROM supplies
        WHERE id = $1
        LIMIT 1
      `,
      [preferredId]
    );

    if (preferredResult.rows.length > 0) {
      return preferredResult.rows[0];
    }
  }

  const normalizedDetails = parseActionDetailsObject(details);
  const supplyDate = normalizeSupplyDateValue(
    normalizedDetails.suppliedAt || normalizedDetails.supplyDate
  );
  const supplier = normalizeSupplierName(
    normalizedDetails.supplier
  );
  const invoiceNumber = String(
    normalizedDetails.invoiceNumber || normalizedDetails.invoice || ""
  ).trim();

  const result = await pool.query(
    `
      INSERT INTO supplies (
        supply_date,
        supplier,
        invoice_number
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (supply_date, supplier, invoice_number)
      DO UPDATE SET updated_at = NOW()
      RETURNING *
    `,
    [supplyDate, supplier, invoiceNumber]
  );

  return result.rows[0];
}

app.get("/api/action-logs", async (req, res) => {
  try {
    await ensureSuppliesSchema();

    const result = await pool.query(`
      SELECT
        id,
        action,
        flavor_id AS "flavorId",
        supply_id AS "supplyId",
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
  const { action, flavorId, supplyId, brand, name, details } = req.body;

  if (!action) {
    return res.status(400).json({ message: "Не указано действие" });
  }

  try {
    await ensureSuppliesSchema();

    const normalizedDetails = parseActionDetailsObject(details);
    let resolvedSupplyId = null;

    if (action === "supply") {
      normalizedDetails.supplier = normalizeSupplierName(
        normalizedDetails.supplier
      );

      const supply = await resolveSupplyForDetails(
        normalizedDetails,
        supplyId
      );

      resolvedSupplyId = supply.id;
    }

    const result = await pool.query(
      `
        INSERT INTO action_logs (
          action,
          flavor_id,
          supply_id,
          brand,
          name,
          details
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          action,
          flavor_id AS "flavorId",
          supply_id AS "supplyId",
          brand,
          name,
          details,
          created_at AS "createdAt"
      `,
      [
        action,
        flavorId || null,
        resolvedSupplyId,
        normalizeBrandName(brand),
        name || "",
        JSON.stringify(normalizedDetails),
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
    await ensureSuppliesSchema();

    const currentResult = await pool.query(
      `
        SELECT action, supply_id
        FROM action_logs
        WHERE id = $1
        LIMIT 1
      `,
      [logId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ message: "Действие не найдено" });
    }

    const normalizedDetails = parseActionDetailsObject(details);
    const currentLog = currentResult.rows[0];
    let resolvedSupplyId = currentLog.supply_id;

    if (currentLog.action === "supply") {
      normalizedDetails.supplier = normalizeSupplierName(
        normalizedDetails.supplier
      );

      const supply = await resolveSupplyForDetails(normalizedDetails);
      resolvedSupplyId = supply.id;
    }

    const result = await pool.query(
      `
        UPDATE action_logs
        SET
          details = $1,
          supply_id = $2
        WHERE id = $3
        RETURNING
          id,
          action,
          flavor_id AS "flavorId",
          supply_id AS "supplyId",
          brand,
          name,
          details,
          created_at AS "createdAt"
      `,
      [JSON.stringify(normalizedDetails), resolvedSupplyId, logId]
    );

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

    await ensureStrengthSchema();

    const result = await pool.query(`
      SELECT
        f.id,
        f.brand,
        f.name,
        f.packs,
        f.tags,
        f.min_stock AS "minStock",
        f.archived,
        f.low_stock AS "lowStock",
        f.purchase_confirmed AS "purchaseConfirmed",
        f.excluded_from_deadstock AS "excludedFromDeadstock",
        f.strength_override AS "strengthOverride",
        COALESCE(bs.default_strength, 'unknown') AS "brandStrength",
        COALESCE(
          f.strength_override,
          bs.default_strength,
          'unknown'
        ) AS "effectiveStrength",
        f.created_at AS "createdAt",
        f.updated_at AS "updatedAt"
      FROM flavors AS f
      LEFT JOIN brand_settings AS bs
        ON LOWER(bs.brand) = LOWER(f.brand)
      ORDER BY f.brand ASC, f.name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get flavors error:", error);
    res.status(500).json({ message: "Не удалось получить вкусы" });
  }
});

app.get("/api/brand-settings", async (req, res) => {
  try {
    await ensureStrengthSchema();

    const result = await pool.query(`
      SELECT
        brand,
        default_strength AS "defaultStrength",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM brand_settings
      ORDER BY brand ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get brand settings error:", error);
    res.status(500).json({ message: "Не удалось получить крепость брендов" });
  }
});

app.put("/api/brand-settings/:brand", async (req, res) => {
  try {
    await ensureStrengthSchema();

    const brand = normalizeBrandName(decodeURIComponent(req.params.brand || ""));
    const defaultStrength = normalizeStrengthValue(req.body?.defaultStrength);

    if (!brand) {
      return res.status(400).json({ message: "Не указан бренд" });
    }

    const result = await pool.query(
      `
        INSERT INTO brand_settings (brand, default_strength)
        VALUES ($1, $2)
        ON CONFLICT (brand)
        DO UPDATE SET
          default_strength = EXCLUDED.default_strength,
          updated_at = NOW()
        RETURNING
          brand,
          default_strength AS "defaultStrength",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [brand, defaultStrength]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update brand strength error:", error);
    res.status(500).json({ message: "Не удалось сохранить крепость бренда" });
  }
});

app.post("/api/flavors/supply", async (req, res) => {
  const { brand, name, weight, quantity, tags = [], minStock = 0 } = req.body;

  const cleanBrand = normalizeBrandName(brand);
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

  await ensureStrengthSchema();

  if (!Array.isArray(rows)) {
    return res.status(400).json({ message: "Неверный формат Excel-данных" });
  }

  const groupedFlavors = new Map();

  for (const row of rows) {
    const brand = normalizeBrandName(row.brand);
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
    const hasStrengthOverride =
      row.strengthOverride !== undefined ||
      row.strength_override !== undefined;

    const strengthOverride = hasStrengthOverride
      ? normalizeStrengthValue(
          row.strengthOverride ?? row.strength_override,
          { allowEmpty: true }
        )
      : null;

    const brandStrength = normalizeStrengthValue(
      row.brandStrength ?? row.brand_strength
    );

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
        hasStrengthOverride,
        strengthOverride,
        brandStrength,
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

    if (hasStrengthOverride) {
      flavor.hasStrengthOverride = true;
      flavor.strengthOverride = strengthOverride;
    }

    if (brandStrength !== "unknown") {
      flavor.brandStrength = brandStrength;
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
      await client.query(
        `
          INSERT INTO brand_settings (brand, default_strength)
          VALUES ($1, $2)
          ON CONFLICT (brand)
          DO UPDATE SET
            default_strength = CASE
              WHEN EXCLUDED.default_strength = 'unknown'
                THEN brand_settings.default_strength
              ELSE EXCLUDED.default_strength
            END,
            updated_at = NOW()
        `,
        [flavor.brand, flavor.brandStrength || "unknown"]
      );

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
                strength_override = CASE
                  WHEN $6::boolean
                    THEN $7
                  ELSE strength_override
                END,
                updated_at = NOW()
            WHERE id = $8
          `,
          [
            JSON.stringify(packs),
            JSON.stringify(mergedTags),
            flavor.archived,
            flavor.lowStock,
            flavor.excludedFromDeadstock,
            Boolean(flavor.hasStrengthOverride),
            flavor.strengthOverride || null,
            existingFlavor.rows[0].id,
          ]
        );
      } else {
        await client.query(
          `
            INSERT INTO flavors (
              brand,
              name,
              packs,
              tags,
              min_stock,
              archived,
              low_stock,
              excluded_from_deadstock,
              strength_override
            )
            VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)
          `,
          [
            flavor.brand,
            flavor.name,
            JSON.stringify(packs),
            JSON.stringify(tags),
            flavor.archived,
            flavor.lowStock,
            flavor.excludedFromDeadstock,
            flavor.strengthOverride || null,
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
  const client = await pool.connect();

  try {
    const flavorId = Number(req.params.id);
    const {
      brand,
      name,
      packs,
      tags,
      minStock,
      strengthOverride,
      brandStrength,
    } = req.body;

    await ensureStrengthSchema(client);

    if (
      !Number.isInteger(flavorId) ||
      flavorId <= 0 ||
      !brand ||
      !name ||
      !Array.isArray(packs) ||
      packs.length === 0
    ) {
      return res.status(400).json({
        message: "Бренд, вкус и хотя бы одна фасовка обязательны",
      });
    }

    await client.query("BEGIN");

    const currentFlavorResult = await client.query(
      `
        SELECT brand, packs
        FROM flavors
        WHERE id = $1
        FOR UPDATE
      `,
      [flavorId]
    );

    if (currentFlavorResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Вкус не найден",
      });
    }

    const previousBrand = String(
      currentFlavorResult.rows[0].brand || ""
    ).trim();

    const normalizedBrand = normalizeBrandName(brand);
    const normalizedName = String(name).trim();

    const currentPacks = Array.isArray(currentFlavorResult.rows[0].packs)
      ? currentFlavorResult.rows[0].packs
      : [];

    const normalizedPacks = packs
      .map((pack) => {
        const weight = String(pack.weight || "").trim();
        const quantity = Number(pack.quantity);

        const existingPack = currentPacks.find((item) => {
          return (
            String(item.weight || "").trim().toLowerCase() ===
            weight.toLowerCase()
          );
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
      .filter((pack) => {
        return (
          pack.weight &&
          Number.isFinite(pack.quantity) &&
          pack.quantity >= 0
        );
      });

    if (normalizedPacks.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Добавьте хотя бы одну корректную фасовку",
      });
    }

    const normalizedTags = Array.isArray(tags)
      ? tags
          .map((tag) => String(tag).trim())
          .filter(Boolean)
      : [];

    const normalizedBrandStrength = normalizeStrengthValue(brandStrength);
    const normalizedStrengthOverride = normalizeStrengthValue(
      strengthOverride,
      { allowEmpty: true }
    );

    const updatedBrandSetting = await client.query(
      `
        UPDATE brand_settings
        SET brand = $1,
            default_strength = $2,
            updated_at = NOW()
        WHERE LOWER(brand) = LOWER($1)
        RETURNING brand
      `,
      [normalizedBrand, normalizedBrandStrength]
    );

    if (updatedBrandSetting.rows.length === 0) {
      await client.query(
        `
          INSERT INTO brand_settings (
            brand,
            default_strength
          )
          VALUES ($1, $2)
          ON CONFLICT (brand)
          DO UPDATE SET
            default_strength = EXCLUDED.default_strength,
            updated_at = NOW()
        `,
        [normalizedBrand, normalizedBrandStrength]
      );
    }

    const result = await client.query(
      `
        UPDATE flavors
        SET brand = $1,
            name = $2,
            packs = $3::jsonb,
            tags = $4::jsonb,
            min_stock = $5,
            strength_override = $6,
            archived = false,
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `,
      [
        normalizedBrand,
        normalizedName,
        JSON.stringify(normalizedPacks),
        JSON.stringify(normalizedTags),
        Number(minStock) || 1,
        normalizedStrengthOverride,
        flavorId,
      ]
    );

    if (
      previousBrand &&
      previousBrand.toLowerCase() !== normalizedBrand.toLowerCase()
    ) {
      await client.query(
        `
          DELETE FROM brand_settings
          WHERE LOWER(brand) = LOWER($1)
            AND NOT EXISTS (
              SELECT 1
              FROM flavors
              WHERE LOWER(flavors.brand) = LOWER($1)
            )
        `,
        [previousBrand]
      );
    }

    await client.query("COMMIT");

    const brandSettingResult = await pool.query(
      `
        SELECT default_strength
        FROM brand_settings
        WHERE LOWER(brand) = LOWER($1)
        LIMIT 1
      `,
      [normalizedBrand]
    );

    const responseFlavor = normalizeFlavor({
      ...result.rows[0],
      brand_strength:
        brandSettingResult.rows[0]?.default_strength || "unknown",
    });

    res.json(responseFlavor);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("Update flavor error:", error);

    res.status(500).json({
      message: "Не удалось сохранить изменения",
    });
  } finally {
    client.release();
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
