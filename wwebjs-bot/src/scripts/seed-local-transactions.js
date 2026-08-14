"use strict";

/**
 * Local-only helper: create 5 stock + 5 pickup transactions for "today"
 * so the dashboard has data to play with.
 *
 * Docs: wwebjs-bot/local-dev/README.md
 *
 * Usage (from wwebjs-bot/, with .env loaded):
 *   npm run seed:local-tx
 *
 * Requires: gateway + backend_core running, CORE_* in .env
 *
 * Optional env:
 *   CORE_SEED_CLIENT_KEYCLOAK_ID  default = clientlocal@gmail.com keycloak sub
 *   CORE_SEED_STOCK=5
 *   CORE_SEED_PICKUP=5
 */

require("dotenv").config();

const config = require("../config");
const coreApi = require("../services/coreApiClient");
const { extractTransactionRef } = require("../lib/transactionResponse");

const DEFAULT_CLIENT_KEYCLOAK_ID = "e25791eb-c678-4bf8-acee-aa9117a7c819";

const QUARTIERS = ["Akwa", "Bonapriso", "Makepe", "Deido", "Bali"];
const PICKUP_NAMES = [
  "Colis seed pickup A",
  "Colis seed pickup B",
  "Colis seed pickup C",
  "Colis seed pickup D",
  "Colis seed pickup E",
];

function todayIso(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function uniquePhone(i) {
  const n = (Date.now() + i) % 10000000;
  return `67${String(n).padStart(7, "0")}`.slice(0, 9);
}

function pickInStockPackages(packages, count) {
  const inStock = packages.filter((p) => Number(p.quantity) > 0 && p.package_name);
  const uniqueByName = [];
  const seen = new Set();
  for (const pkg of inStock) {
    const name = String(pkg.package_name);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    uniqueByName.push(pkg);
  }
  return uniqueByName.slice(0, count);
}

async function postTransaction(clientKeycloakId, fields) {
  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const token = await coreApi.getAccessToken();
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && String(value).length > 0) {
      form.append(key, String(value));
    }
  }
  const res = await fetch(`${base}/api/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-User-Id": clientKeycloakId,
    },
    body: form,
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${body.error || body.message || text.slice(0, 200)}`);
    err.body = body;
    throw err;
  }
  return body;
}

function baseFields({ packageName, source, phone, quartier, amount, seedId }) {
  const date = todayIso(config.TIME_ZONE);
  const raw = `${phone}\n${packageName}\n${amount}\n${quartier}\naujourd'hui`;
  return {
    package_name: String(packageName).slice(0, 120),
    description: `seed local ${source} ${date} — ${packageName}`,
    receiver_name: `Seed ${source}`,
    receiver_phone: phone,
    receiver_gender: "Unknown",
    destination_street: quartier,
    destination_city: config.CORE_DESTINATION_CITY || "Douala",
    destination_region: config.CORE_DESTINATION_REGION || "Littoral",
    departure_city: config.CORE_DEPARTURE_CITY || "Douala",
    departure_region: config.CORE_DEPARTURE_REGION || "Littoral",
    departure_street: config.CORE_DEPARTURE_STREET || "Bonapriso Shop",
    source,
    type: "delivery",
    quantity: "1",
    cash_collect: "true",
    amount: String(amount),
    raw_input: raw.slice(0, 4000),
    scheduled_delivery_date: date,
    created_via: "whatsapp",
    whatsapp_message_id: seedId,
  };
}

async function main() {
  const clientKeycloakId =
    process.env.CORE_SEED_CLIENT_KEYCLOAK_ID || DEFAULT_CLIENT_KEYCLOAK_ID;
  const stockCount = Number(process.env.CORE_SEED_STOCK || 5);
  const pickupCount = Number(process.env.CORE_SEED_PICKUP || 5);

  if (!config.CORE_API_BASE_URL) {
    throw new Error("CORE_API_BASE_URL is not set");
  }

  console.log("Seeding local transactions");
  console.log(`  gateway: ${config.CORE_API_BASE_URL}`);
  console.log(`  client:  ${clientKeycloakId}`);
  console.log(`  date:    ${todayIso(config.TIME_ZONE)}`);
  console.log(`  counts:  ${stockCount} stock + ${pickupCount} pickup\n`);

  await coreApi.login();
  const catalog = await coreApi.getPackages(clientKeycloakId);
  const stockPkgs = pickInStockPackages(catalog, stockCount);

  if (stockPkgs.length < stockCount) {
    console.warn(
      `  ⚠️  Only ${stockPkgs.length}/${stockCount} in-stock catalog items — creating what we can`
    );
  }

  const runId = Date.now();
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < stockPkgs.length; i++) {
    const pkg = stockPkgs[i];
    const fields = baseFields({
      packageName: pkg.package_name,
      source: "stock",
      phone: uniquePhone(i),
      quartier: QUARTIERS[i % QUARTIERS.length],
      amount: 5000 + i * 500,
      seedId: `seed-local-${runId}-stock-${i}`,
    });
    fields[`items[0].package_name`] = String(pkg.package_name).slice(0, 50);
    fields[`items[0].quantity`] = "1";
    try {
      const body = await postTransaction(clientKeycloakId, fields);
      console.log(`  ✓ stock  ${pkg.package_name}  → ${extractTransactionRef(body)}`);
      ok += 1;
    } catch (err) {
      console.error(`  ✗ stock  ${pkg.package_name}  ${err.message}`);
      fail += 1;
    }
  }

  for (let i = 0; i < pickupCount; i++) {
    const name = PICKUP_NAMES[i] || `Colis seed pickup ${i + 1}`;
    const fields = baseFields({
      packageName: name,
      source: "pickup",
      phone: uniquePhone(100 + i),
      quartier: QUARTIERS[i % QUARTIERS.length],
      amount: 8000 + i * 1000,
      seedId: `seed-local-${runId}-pickup-${i}`,
    });
    try {
      const body = await postTransaction(clientKeycloakId, fields);
      console.log(`  ✓ pickup ${name}  → ${extractTransactionRef(body)}`);
      ok += 1;
    } catch (err) {
      console.error(`  ✗ pickup ${name}  ${err.message}`);
      fail += 1;
    }
  }

  console.log(`\nDone: ${ok} created, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("seed:local-tx failed:", err.message || err);
  process.exit(1);
});
