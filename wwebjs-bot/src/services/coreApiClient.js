"use strict";

const config = require("../config");
const { resolvePackageMatch } = require("../lib/packageCatalogMatch");
const { throwApiError } = require("../lib/formatApiError");
const botAlerts = require("../lib/botAlerts");
const { guardCoreApiCall } = require("../lib/coreApiCircuitBreaker");
const {
  extractTransactionRef,
  isIdempotentReplay,
} = require("../lib/transactionResponse");

/** @type {{ token: string, expiresAt: number } | null} */
let authCache = null;

/** @type {Map<string, { packages: object[], expiresAt: number }>} */
const catalogCache = new Map();

const CATALOG_CACHE_TTL_MS = (() => {
  const n = parseInt(process.env.CATALOG_CACHE_TTL_MS || "300000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 300000;
})();

const TOKEN_REFRESH_BUFFER_MS = (() => {
  const n = parseInt(process.env.CORE_TOKEN_REFRESH_BUFFER_MS || "60000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 60000;
})();

const DEFAULT_TOKEN_TTL_MS = 13 * 60 * 1000;

/** Probe group id — expect 404 when auth is valid. */
const HEALTH_PROBE_GROUP_ID = "__health_probe__";

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

function parseJwtExpMs(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8")
    );
    if (typeof payload.exp === "number" && payload.exp > 0) {
      return payload.exp * 1000;
    }
  } catch {
    /* ignore malformed JWT */
  }
  return null;
}

function cacheExpiryFromToken(token) {
  const jwtExp = parseJwtExpMs(token);
  if (jwtExp) {
    return Math.max(Date.now(), jwtExp - TOKEN_REFRESH_BUFFER_MS);
  }
  return Date.now() + DEFAULT_TOKEN_TTL_MS;
}

function clearAuthCache() {
  authCache = null;
}

function setAuthCache(token) {
  authCache = {
    token,
    expiresAt: cacheExpiryFromToken(token),
  };
}

/**
 * Run an authenticated fetch; on 401 clear cache, re-login, retry once.
 * @param {(token: string) => Promise<Response>} doFetch
 */
async function withAuthRetry(doFetch) {
  let res = await doFetch(await getAccessToken());
  if (res.status !== 401) {
    return res;
  }

  botAlerts.notifyCoreApiSessionLost();
  botAlerts.notifyCoreApiReconnecting();
  clearAuthCache();

  try {
    await login({ skipAlerts: true });
    botAlerts.notifyCoreApiReconnected();
  } catch (loginErr) {
    botAlerts.notifyCoreApiAuthFailure(loginErr);
    throw loginErr;
  }

  res = await doFetch(await getAccessToken());
  if (res.status === 401) {
    botAlerts.notifyCoreApiAuthFailure();
  }
  return res;
}

async function login(options = {}) {
  if (!config.CORE_API_BASE_URL || !config.CORE_BOT_USERNAME || !config.CORE_BOT_PASSWORD) {
    throw new Error(
      "Core API login skipped — missing env: CORE_API_BASE_URL, CORE_BOT_USERNAME, and/or CORE_BOT_PASSWORD"
    );
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
    throwApiError({
      operation: "Core API login",
      method: "POST",
      url: config.CORE_AUTH_URL,
      status: res.status,
      statusText: res.statusText,
      body,
      context: {
        username: config.CORE_BOT_USERNAME,
        hint: "Check CORE_BOT_USERNAME / CORE_BOT_PASSWORD on the bot VPS",
      },
    });
  }

  const token = body.accessToken || body.access_token || body.token;
  if (!token) {
    throw new Error(
      `Core API login response missing accessToken — POST ${config.CORE_AUTH_URL} returned HTTP ${res.status} but no token field (keys: ${Object.keys(body).join(", ") || "none"})`
    );
  }

  setAuthCache(token);
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
 * Verify Core API credentials and token (for /health and monitoring).
 * Uses a probe lookup; 404 means auth OK, 401/403 means broken.
 */
async function checkCoreApiHealth() {
  if (!config.USE_CORE_API) {
    return { ok: true, skipped: true };
  }
  if (!config.CORE_API_BASE_URL || !config.CORE_BOT_USERNAME || !config.CORE_BOT_PASSWORD) {
    return {
      ok: false,
      error:
        "Core API credentials not configured — set CORE_API_BASE_URL, CORE_BOT_USERNAME, CORE_BOT_PASSWORD",
    };
  }

  try {
    const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
    const url = `${base}/api/users/whatsapp/${encodeURIComponent(HEALTH_PROBE_GROUP_ID)}`;
    const res = await guardCoreApiCall("core-health", () =>
      withAuthRetry((token) =>
        fetch(url, {
          headers: {
            ...authHeaders(),
            Authorization: `Bearer ${token}`,
          },
        })
      )
    );

    const body = await parseJsonResponse(res);

    if (res.status === 401 || res.status === 403) {
      const { formatApiError } = require("../lib/formatApiError");
      return {
        ok: false,
        error: formatApiError({
          operation: "Core API health check (auth probe)",
          method: "GET",
          url,
          status: res.status,
          statusText: res.statusText,
          body,
          context: {
            hint: "JWT rejected after re-login — verify bot user on staging gateway",
          },
        }),
      };
    }

    if (res.status === 404) {
      return { ok: true };
    }

    if (res.ok) {
      return { ok: true };
    }

    const { formatApiError } = require("../lib/formatApiError");
    return {
      ok: false,
      error: formatApiError({
        operation: "Core API health check",
        method: "GET",
        url,
        status: res.status,
        statusText: res.statusText,
        body,
      }),
    };
  } catch (err) {
    return {
      ok: false,
      error: err.formatted || err.message || String(err),
    };
  }
}

/**
 * Resolve WhatsApp group id → client (keycloakId).
 * GET /api/users/whatsapp/{whatsappGroupId}
 */
async function getClientByWhatsappGroup(whatsappGroupId) {
  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/api/users/whatsapp/${encodeURIComponent(whatsappGroupId)}`;

  const res = await guardCoreApiCall("client-lookup", () =>
    withAuthRetry((token) =>
      fetch(url, {
        headers: {
          ...authHeaders(),
          Authorization: `Bearer ${token}`,
        },
      })
    )
  );

  const body = await parseJsonResponse(res);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throwApiError({
      operation: "WhatsApp group → client lookup",
      method: "GET",
      url,
      status: res.status,
      statusText: res.statusText,
      body,
      context: {
        whatsappGroupId,
        hint:
          res.status === 401 || res.status === 403
            ? "Auth failed — bot will retry login on next message; check CORE_BOT_* credentials if persistent"
            : "Verify group is linked on dashboard (#link → paste group id on client profile)",
      },
    });
  }

  const keycloakId = body.keycloakId || body.keycloak_id;
  if (!keycloakId) {
    throw new Error(
      `Client lookup response missing keycloakId — GET ${url} returned HTTP ${res.status} but no keycloakId field (keys: ${Object.keys(body).join(", ") || "none"})`
    );
  }

  return { keycloakId: String(keycloakId), source: "api", raw: body };
}

/**
 * Fetch client catalog packages (cached per keycloakId).
 * GET /api/packages?userId={keycloakId}
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

  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/api/packages?userId=${encodeURIComponent(clientKeycloakId)}`;

  const res = await guardCoreApiCall("packages", () =>
    withAuthRetry((token) =>
      fetch(url, {
        headers: {
          ...authHeaders(clientKeycloakId),
          Authorization: `Bearer ${token}`,
        },
      })
    )
  );

  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throwApiError({
      operation: "Client catalog (packages) fetch",
      method: "GET",
      url,
      status: res.status,
      statusText: res.statusText,
      body,
      context: {
        clientKeycloakId,
        clientUserId: clientUserId ?? "(not scoped)",
        hint: "Backend /api/packages bug — bot will default to pickup for this order",
      },
    });
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
  const base = config.CORE_API_BASE_URL.replace(/\/+$/, "");
  const clientUserId = options.clientUserId ?? null;
  const txUrl = `${base}/api/transactions`;

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
    const detail = catalogErr.formatted || catalogErr.message;
    console.warn(
      `   ⚠️  Catalog fetch/match failed — defaulting to pickup:\n${detail
        .split("\n")
        .map((l) => `      ${l}`)
        .join("\n")}`
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

  const res = await guardCoreApiCall("create-transaction", () =>
    withAuthRetry((token) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null && String(value).length > 0) {
          form.append(key, String(value));
        }
      }
      return fetch(txUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-User-Id": clientKeycloakId,
        },
        body: form,
      });
    })
  );

  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throwApiError({
      operation: "Create transaction (save order)",
      method: "POST",
      url: txUrl,
      status: res.status,
      statusText: res.statusText,
      body,
      context: {
        clientKeycloakId,
        receiver_phone: fields.receiver_phone,
        amount: fields.amount || "(none)",
        destination_street: fields.destination_street,
        package_name: fields.package_name,
        source: fields.source,
        quantity: fields.quantity,
        whatsapp_message_id: fields.whatsapp_message_id || "(none)",
        hint:
          res.status === 400
            ? "Validation rejected by backend — check API response above for field errors"
            : undefined,
      },
    });
  }

  return {
    ...body,
    _packageMatch: packageMatch,
    _transactionRef: extractTransactionRef(body),
    _idempotentReplay: isIdempotentReplay(body),
  };
}

module.exports = {
  login,
  getAccessToken,
  clearAuthCache,
  checkCoreApiHealth,
  getClientByWhatsappGroup,
  getPackages,
  clearCatalogCache,
  createTransaction,
  mapParsedToTransaction,
  /** @internal — exported for unit tests */
  withAuthRetry,
  HEALTH_PROBE_GROUP_ID,
};
