"use strict";

const config = require("../config");
const { resolvePackageMatch } = require("../lib/packageCatalogMatch");

/** @type {{ token: string, expiresAt: number } | null} */
let authCache = null;

/** @type {Map<string, { packages: object[], expiresAt: number }>} */
const catalogCache = new Map();

const CATALOG_CACHE_TTL_MS = (() => {
  const n = parseInt(process.env.CATALOG_CACHE_TTL_MS || "300000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 300000;
})();

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function login() {
  if (!config.CORE_AUTH_URL || !config.CORE_BOT_USERNAME || !config.CORE_BOT_PASSWORD) {
    throw new Error("CORE_AUTH_URL, CORE_BOT_USERNAME, CORE_BOT_PASSWORD are required");
  }

  const res = await fetch(config.CORE_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: config.CORE_BOT_USERNAME,
      password: config.CORE_BOT_PASSWORD,
    }),
  });

  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      `Core login failed (${res.status}): ${body.message || body.error || body._raw || res.statusText}`
    );
  }

  const token = body.accessToken || body.access_token || body.token;
  if (!token) {
    throw new Error("Core login response missing accessToken");
  }

  authCache = {
    token,
    expiresAt: Date.now() + 14 * 60 * 1000,
  };
  return token;
}

async function getAccessToken() {
  if (authCache && authCache.expiresAt > Date.now()) {
    return authCache.token;
  }
  return login();
}

function authHeaders(clientKeycloakId) {
  const headers = { Accept: "application/json" };
  if (clientKeycloakId) {
    headers["X-User-Id"] = clientKeycloakId;
  }
  return headers;
}

/**
 * Resolve WhatsApp group id → client (keycloakId).
 * GET /api/users/whatsapp/{whatsappGroupId}
 */
async function getClientByWhatsappGroup(whatsappGroupId) {
  const token = await getAccessToken();
  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/api/users/whatsapp/${encodeURIComponent(whatsappGroupId)}`;

  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await parseJsonResponse(res);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(
      `Client lookup failed (${res.status}): ${body.message || body.error || body._raw || res.statusText}`
    );
  }

  const keycloakId = body.keycloakId || body.keycloak_id;
  if (!keycloakId) {
    throw new Error("Client lookup response missing keycloakId");
  }

  return { keycloakId: String(keycloakId), source: "api", raw: body };
}

/**
 * Fetch client catalog packages (cached per keycloakId).
 * GET /api/packages?userId={keycloakId}
 * @param {string} clientKeycloakId
 * @param {number|null} [clientUserId] - when set, keep only packages for this user (API may return others)
 */
async function getPackages(clientKeycloakId, clientUserId = null) {
  const cacheKey =
    clientUserId != null
      ? `${clientKeycloakId}:uid:${clientUserId}`
      : String(clientKeycloakId);
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.packages;
  }

  const token = await getAccessToken();
  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/api/packages?userId=${encodeURIComponent(clientKeycloakId)}`;

  const res = await fetch(url, {
    headers: {
      ...authHeaders(clientKeycloakId),
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      `Packages fetch failed (${res.status}): ${body.message || body.error || body._raw || res.statusText}`
    );
  }

  let packages = Array.isArray(body) ? body : body.content || body.data || [];
  if (clientUserId != null) {
    const uid = Number(clientUserId);
    const scoped = packages.filter((p) => Number(p.user_id) === uid);
    if (scoped.length > 0) {
      packages = scoped;
    }
  }

  catalogCache.set(cacheKey, {
    packages,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  });
  return packages;
}

/** Clear catalog cache (for tests). */
function clearCatalogCache() {
  catalogCache.clear();
}

function mapParsedToTransaction(parsed, messageText, packageMatch) {
  const rawItems = parsed.items ? String(parsed.items) : "Colis";
  const match = packageMatch || {
    source: "pickup",
    package_name: rawItems.slice(0, 120),
    quantity: 1,
  };

  const package_name = String(match.package_name || rawItems).slice(0, 120);
  const description = rawItems;
  const destination_street =
    parsed.quartier || config.CORE_DESTINATION_STREET || "N/A";

  const fields = {
    package_name,
    description,
    receiver_name: parsed.customer_name || "Client",
    receiver_phone: parsed.phone ? String(parsed.phone) : "",
    receiver_gender: "Unknown",
    destination_street,
    destination_city: config.CORE_DESTINATION_CITY,
    destination_region: config.CORE_DESTINATION_REGION,
    departure_city: config.CORE_DEPARTURE_CITY,
    departure_region: config.CORE_DEPARTURE_REGION,
    departure_street: config.CORE_DEPARTURE_STREET || "N/A",
    source: match.source === "stock" ? "stock" : "pickup",
    type: "delivery",
    quantity: match.quantity > 0 ? match.quantity : 1,
    cash_collect: parsed.amount_due ? "true" : "false",
  };

  if (parsed.amount_due) {
    fields.amount = String(Math.trunc(Number(parsed.amount_due)));
  }

  if (messageText) {
    fields.raw_input = messageText.slice(0, 4000);
  }

  return fields;
}

async function createTransaction(
  clientKeycloakId,
  parsed,
  messageText,
  whatsappMessageId,
  options = {}
) {
  const token = await getAccessToken();
  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const clientUserId = options.clientUserId ?? null;

  let packageMatch;
  try {
    const catalog = await getPackages(clientKeycloakId, clientUserId);
    packageMatch = await resolvePackageMatch(parsed.items, catalog, {
      config,
      messageText,
    });
    console.log(
      `   📦 Catalog match: source=${packageMatch.source} method=${packageMatch.matchMethod} package="${packageMatch.package_name}" qty=${packageMatch.quantity}`
    );
  } catch (catalogErr) {
    console.warn(
      `   ⚠️  Catalog fetch/match failed (${catalogErr.message}) — defaulting to pickup`
    );
    packageMatch = {
      source: "pickup",
      package_name: parsed.items ? String(parsed.items).slice(0, 120) : "Colis",
      quantity: 1,
      matchMethod: "none",
    };
  }

  const fields = mapParsedToTransaction(parsed, messageText, packageMatch);

  if (whatsappMessageId) {
    fields.whatsapp_message_id = whatsappMessageId;
  }
  fields.created_via = "whatsapp";

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

  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      `Create transaction failed (${res.status}): ${body.message || body.error || body._raw || res.statusText}`
    );
  }

  return { ...body, _packageMatch: packageMatch };
}

module.exports = {
  login,
  getAccessToken,
  getClientByWhatsappGroup,
  getPackages,
  clearCatalogCache,
  createTransaction,
  mapParsedToTransaction,
};
