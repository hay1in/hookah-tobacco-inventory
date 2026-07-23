const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const port = Number(process.env.PORT || 3000);
const baseUrl =
  process.env.SMOKE_BASE_URL || `http://localhost:${port}`;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error("ADMIN_PASSWORD is missing.");
}

async function request(pathname, { authenticated = true } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: authenticated
      ? { "x-admin-password": adminPassword }
      : {},
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      `${response.status} ${pathname}: ${JSON.stringify(body)}`
    );
  }

  console.log(`PASS ${response.status} ${pathname}`);

  return body;
}

async function main() {
  const health = await request("/api/health", {
    authenticated: false,
  });

  if (!health || typeof health.message !== "string") {
    throw new Error("/api/health returned an unexpected response.");
  }

  const flavors = await request("/api/flavors");

  if (!Array.isArray(flavors)) {
    throw new Error("/api/flavors did not return an array.");
  }

  const actionLogs = await request("/api/action-logs");

  if (!Array.isArray(actionLogs)) {
    throw new Error("/api/action-logs did not return an array.");
  }

  const brandSettings = await request("/api/brand-settings");

  if (!Array.isArray(brandSettings)) {
    throw new Error("/api/brand-settings did not return an array.");
  }

  console.log("");
  console.log("Smoke test completed successfully.");
  console.log(`Flavors: ${flavors.length}`);
  console.log(`Action logs: ${actionLogs.length}`);
  console.log(`Brand settings: ${brandSettings.length}`);
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exitCode = 1;
});
