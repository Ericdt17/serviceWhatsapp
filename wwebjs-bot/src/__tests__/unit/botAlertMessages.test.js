"use strict";

const msg = require("../../lib/botAlertMessages");

describe("botAlertMessages", () => {
  it("prefixes all messages with [LivSight Bot]", () => {
    expect(msg.startup()).toMatch(/^\[LivSight Bot\]/);
    expect(msg.waDisconnected()).toMatch(/^\[LivSight Bot\]/);
    expect(msg.heartbeat()).toMatch(/^\[LivSight Bot\]/);
  });

  it("startup message", () => {
    expect(msg.startup()).toBe("[LivSight Bot] Bot en ligne — WhatsApp prêt.");
  });

  it("waDisconnected message", () => {
    expect(msg.waDisconnected()).toBe(
      "[LivSight Bot] WhatsApp déconnecté. Reconnexion en cours..."
    );
  });

  it("waReconnected message", () => {
    expect(msg.waReconnected()).toBe(
      "[LivSight Bot] Bot reconnecté — WhatsApp OK."
    );
  });

  it("api session flow messages", () => {
    expect(msg.apiSessionLost()).toContain("Session API LivSight expirée");
    expect(msg.apiReconnecting()).toContain("Reconnexion à l'API LivSight");
    expect(msg.apiReconnected()).toContain("Bot reconnecté à l'API LivSight");
    expect(msg.apiAuthFailed()).toContain("Échec connexion API LivSight");
  });

  it("orderFailed includes phone, amount, quartier", () => {
    expect(
      msg.orderFailed({
        phone: "699132526",
        amount: "15000",
        quartier: "Bastos",
      })
    ).toBe(
      "[LivSight Bot] Commande non enregistrée — Tel 699132526, 15000 FCFA, Bastos."
    );
  });

  it("groupNotLinked includes group name when provided", () => {
    expect(msg.groupNotLinked("Pharmacie Test")).toContain("Pharmacie Test");
    expect(msg.groupNotLinked("Pharmacie Test")).toContain("#link");
  });

  it("heartbeat message", () => {
    expect(msg.heartbeat()).toBe(
      "[LivSight Bot] Bot OK — WhatsApp et API connectés."
    );
  });
});
