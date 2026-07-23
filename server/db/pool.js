const { Pool } = require("pg");

const DEFAULT_CONNECTION_TIMEOUT_MS = 30000;
const DEFAULT_IDLE_TIMEOUT_MS = 30000;

function isLocalDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);

  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "db"
  );
}

function normalizeDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  const url = new URL(databaseUrl);

  if (isLocalDatabaseUrl(databaseUrl)) {
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    url.searchParams.delete("channel_binding");

    return url.toString();
  }

  // Явно сохраняем строгую проверку сертификата и имени хоста.
  url.searchParams.set("sslmode", "verify-full");

  return url.toString();
}

function createPool(options = {}) {
  const databaseUrl = normalizeDatabaseUrl(
    options.databaseUrl || process.env.DATABASE_URL
  );

  return new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ||
      DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis:
      options.idleTimeoutMillis ||
      DEFAULT_IDLE_TIMEOUT_MS,
    max: options.max,
  });
}

module.exports = {
  createPool,
  isLocalDatabaseUrl,
  normalizeDatabaseUrl,
};
