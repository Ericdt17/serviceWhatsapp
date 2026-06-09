"use strict";

jest.mock("../../lib/botAlerts", () => ({
  notifyCoreApiSessionLost: jest.fn(),
  notifyCoreApiReconnecting: jest.fn(),
  notifyCoreApiReconnected: jest.fn(),
  notifyCoreApiAuthFailure: jest.fn(),
}));

describe("coreApiClient auth retry", () => {
  const originalFetch = global.fetch;
  let botAlerts;

  beforeEach(() => {
    jest.resetModules();
    botAlerts = require("../../lib/botAlerts");
    process.env.USE_ENV_FILE = "false";
    process.env.USE_CORE_API = "true";
    process.env.CORE_API_BASE_URL = "https://core.test";
    process.env.CORE_BOT_USERNAME = "bot";
    process.env.CORE_BOT_PASSWORD = "secret";
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.USE_ENV_FILE;
    delete process.env.USE_CORE_API;
    delete process.env.CORE_API_BASE_URL;
    delete process.env.CORE_BOT_USERNAME;
    delete process.env.CORE_BOT_PASSWORD;
  });

  function loginResponse(token = "token-a") {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessToken: token }),
    };
  }

  function jsonResponse(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  }

  it("retries client lookup once after 401 and fires API alert sequence", async () => {
    const {
      getClientByWhatsappGroup,
      clearAuthCache,
    } = require("../../services/coreApiClient");
    clearAuthCache();

    global.fetch
      .mockResolvedValueOnce(loginResponse("stale-token"))
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(loginResponse("fresh-token"))
      .mockResolvedValueOnce(jsonResponse(200, { keycloakId: "abc-123" }));

    const client = await getClientByWhatsappGroup("120363@test@g.us");
    expect(client.keycloakId).toBe("abc-123");
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(botAlerts.notifyCoreApiSessionLost).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiReconnecting).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiReconnected).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiAuthFailure).not.toHaveBeenCalled();
  });

  it("notifies auth failure when 401 persists after re-login", async () => {
    const { getClientByWhatsappGroup, clearAuthCache } = require("../../services/coreApiClient");
    clearAuthCache();

    global.fetch
      .mockResolvedValueOnce(loginResponse("stale-token"))
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(loginResponse("fresh-token"))
      .mockResolvedValueOnce(jsonResponse(401, { error: "still expired" }));

    await expect(getClientByWhatsappGroup("120363@test@g.us")).rejects.toThrow();
    expect(botAlerts.notifyCoreApiSessionLost).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiReconnecting).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiReconnected).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("notifies auth failure when re-login throws", async () => {
    const { getClientByWhatsappGroup, clearAuthCache } = require("../../services/coreApiClient");
    clearAuthCache();

    global.fetch
      .mockResolvedValueOnce(loginResponse("stale-token"))
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "invalid credentials" }));

    await expect(getClientByWhatsappGroup("120363@test@g.us")).rejects.toThrow();
    expect(botAlerts.notifyCoreApiSessionLost).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiReconnecting).toHaveBeenCalledTimes(1);
    expect(botAlerts.notifyCoreApiReconnected).not.toHaveBeenCalled();
    expect(botAlerts.notifyCoreApiAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("checkCoreApiHealth treats 404 probe as healthy auth", async () => {
    const { checkCoreApiHealth, clearAuthCache } = require("../../services/coreApiClient");
    clearAuthCache();

    global.fetch
      .mockResolvedValueOnce(loginResponse("good-token"))
      .mockResolvedValueOnce(jsonResponse(404, { message: "not found" }));

    const result = await checkCoreApiHealth();
    expect(result.ok).toBe(true);
    expect(botAlerts.notifyCoreApiSessionLost).not.toHaveBeenCalled();
  });

  it("checkCoreApiHealth fails when auth stays 401 after retry", async () => {
    const { checkCoreApiHealth, clearAuthCache } = require("../../services/coreApiClient");
    clearAuthCache();

    global.fetch
      .mockResolvedValueOnce(loginResponse("bad-token"))
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(loginResponse("still-bad"))
      .mockResolvedValueOnce(jsonResponse(401, {}));

    const result = await checkCoreApiHealth();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
    expect(botAlerts.notifyCoreApiAuthFailure).toHaveBeenCalled();
  });

  it("uses JWT exp for cache when present", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const jwt = `${header}.${payload}.sig`;

    const { getAccessToken, clearAuthCache } = require("../../services/coreApiClient");
    clearAuthCache();

    global.fetch.mockResolvedValueOnce(loginResponse(jwt));

    await getAccessToken();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await getAccessToken();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("createTransaction maps TransactionResponse ref fields", async () => {
    const {
      createTransaction,
      clearAuthCache,
      clearCatalogCache,
    } = require("../../services/coreApiClient");
    clearAuthCache();
    clearCatalogCache();

    global.fetch
      .mockResolvedValueOnce(loginResponse("token-a"))
      .mockResolvedValueOnce(jsonResponse(200, [{ package_name: "Robe", user_id: 1 }]))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 99,
          transactionReference: "TX-2026-99",
        })
      );

    const result = await createTransaction(
      "client-kc",
      {
        phone: "612345678",
        items: "2 robes",
        amount_due: 15000,
        quartier: "Makepe",
      },
      "612345678\n2 robes\n15000\nMakepe",
      "true_120363@g.us_TEST",
      { clientUserId: 1 }
    );

    expect(result._transactionRef).toBe(99);
    expect(result.id).toBe(99);
    expect(result.transactionReference).toBe("TX-2026-99");
  });
});
