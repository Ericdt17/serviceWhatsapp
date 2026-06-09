"use strict";

const {
  extractApiErrorDetail,
  formatApiError,
  CoreApiError,
  throwApiError,
  formatBotAlertMessage,
} = require("../../lib/formatApiError");

describe("formatApiError", () => {
  it("extracts Spring-style validation errors", () => {
    const detail = extractApiErrorDetail({
      message: "Validation failed",
      errors: [
        { field: "amount", defaultMessage: "must be positive" },
        "duplicate whatsapp_message_id",
      ],
    });
    expect(detail).toMatch(/Validation failed/);
    expect(detail).toMatch(/amount/);
    expect(detail).toMatch(/duplicate whatsapp_message_id/);
  });

  it("formats multi-line error with context", () => {
    const text = formatApiError({
      operation: "Create transaction (save order)",
      method: "POST",
      url: "https://core.test/api/transactions",
      status: 400,
      statusText: "Bad Request",
      body: { message: "Invalid phone", path: "/api/transactions" },
      context: {
        clientKeycloakId: "abc-123",
        receiver_phone: "699132526",
      },
    });
    expect(text).toContain("HTTP 400");
    expect(text).toContain("POST https://core.test/api/transactions");
    expect(text).toContain("clientKeycloakId: abc-123");
    expect(text).toContain("Invalid phone");
  });

  it("throwApiError attaches formatted on CoreApiError", () => {
    try {
      throwApiError({
        operation: "Client lookup",
        method: "GET",
        url: "https://core.test/api/users/whatsapp/x@g.us",
        status: 401,
        body: { error: "Unauthorized" },
        context: { whatsappGroupId: "x@g.us" },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CoreApiError);
      expect(err.message).toMatch(/401/);
      expect(err.formatted).toContain("GET https://core.test");
      expect(err.status).toBe(401);
    }
  });

  it("handles empty response body", () => {
    expect(extractApiErrorDetail({})).toBe("(no error detail in response)");
    expect(extractApiErrorDetail(null)).toBe("(empty response body)");
  });

  it("formatBotAlertMessage order_not_saved uses short French template", () => {
    const err = new CoreApiError("Create transaction failed (400): bad phone", {
      formatted: "…",
      status: 400,
      operation: "Create transaction (save order)",
      url: "https://core.test/api/transactions",
      body: { message: "Invalid phone number" },
      context: {
        receiver_phone: "699132526",
        amount: "15000",
        destination_street: "Bastos",
        clientKeycloakId: "abc-123",
        package_name: "Doliprane",
      },
    });
    const text = formatBotAlertMessage("order_not_saved", err);
    expect(text).toBe(
      "[LivSight Bot] Commande non enregistrée — Tel 699132526, 15000 FCFA, Bastos."
    );
    expect(text).not.toMatch(/HTTP/);
    expect(text).not.toMatch(/Invalid phone/);
  });

  it("formatBotAlertMessage client_lookup explains #link on 404", () => {
    const err = new CoreApiError("lookup failed", {
      status: 404,
      operation: "WhatsApp group → client lookup",
      context: { whatsappGroupId: "120363@g.us" },
    });
    const text = formatBotAlertMessage("client_lookup", err, {
      groupName: "Pharmacie Test",
    });
    expect(text).toMatch(/Groupe non lié/);
    expect(text).toMatch(/#link/);
    expect(text).toMatch(/Pharmacie Test/);
  });

  it("formatBotAlertMessage core_api_auth is short", () => {
    const text = formatBotAlertMessage("core_api_auth", new CoreApiError("401", { status: 401 }));
    expect(text).toBe(
      "[LivSight Bot] Échec connexion API LivSight. Vérifier identifiants bot."
    );
  });
});
