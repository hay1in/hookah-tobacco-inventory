const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createPool } = require("./pool");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATION_LOCK_ID = 84629173;
const STATUS_ONLY = process.argv.includes("--status");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const pool = createPool();

function calculateChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function readMigrations() {
  const names = await fs.readdir(MIGRATIONS_DIR);

  const sqlFiles = names
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right, "en"));

  return Promise.all(
    sqlFiles.map(async (name) => {
      const filePath = path.join(MIGRATIONS_DIR, name);
      const sql = await fs.readFile(filePath, "utf8");

      return {
        name,
        sql,
        checksum: calculateChecksum(sql),
      };
    })
  );
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`
    SELECT name, checksum, applied_at
    FROM schema_migrations
    ORDER BY name
  `);

  return new Map(
    result.rows.map((row) => [
      row.name,
      {
        checksum: row.checksum,
        appliedAt: row.applied_at,
      },
    ])
  );
}

async function applyMigration(client, migration) {
  await client.query("BEGIN");

  try {
    await client.query(migration.sql);

    await client.query(
      `
        INSERT INTO schema_migrations (name, checksum)
        VALUES ($1, $2)
      `,
      [migration.name, migration.checksum]
    );

    await client.query("COMMIT");
    console.log(`Applied: ${migration.name}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  }
}

function printStatus(migrations, applied) {
  if (migrations.length === 0) {
    console.log("No migration files found.");
    return;
  }

  for (const migration of migrations) {
    const existing = applied.get(migration.name);

    if (!existing) {
      console.log(`PENDING   ${migration.name}`);
      continue;
    }

    if (existing.checksum !== migration.checksum) {
      console.log(`MODIFIED  ${migration.name}`);
      continue;
    }

    console.log(`APPLIED   ${migration.name}`);
  }
}

async function migrationTableExists(client) {
  const result = await client.query(`
    SELECT TO_REGCLASS('public.schema_migrations') AS table_name
  `);

  return Boolean(result.rows[0]?.table_name);
}

async function showStatus(client, migrations) {
  const tableExists = await migrationTableExists(client);

  if (!tableExists) {
    printStatus(migrations, new Map());
    return;
  }

  const applied = await getAppliedMigrations(client);
  printStatus(migrations, applied);
}

async function migrate() {
  const migrations = await readMigrations();
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    if (STATUS_ONLY) {
      await showStatus(client, migrations);
      return;
    }

    await client.query(
      "SELECT pg_advisory_lock($1)",
      [MIGRATION_LOCK_ID]
    );
    lockAcquired = true;

    await ensureMigrationTable(client);

    const applied = await getAppliedMigrations(client);

    for (const migration of migrations) {
      const existing = applied.get(migration.name);

      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.name} was modified after it was applied.`
          );
        }

        console.log(`Already applied: ${migration.name}`);
        continue;
      }

      await applyMigration(client, migration);
    }

    console.log("Database migrations are up to date.");
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
        .catch(() => null);
    }

    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
