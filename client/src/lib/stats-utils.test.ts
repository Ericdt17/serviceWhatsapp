import { describe, it, expect } from "vitest";
import { calculateStatsFromDeliveries } from "./stats-utils";
import type { FrontendDelivery } from "@/types/delivery";

// Minimal delivery factory — only the fields stats-utils actually reads
function makeDelivery(overrides: Partial<FrontendDelivery>): FrontendDelivery {
  return {
    id: 1,
    telephone: "0600000000",
    quartier: "Cocody",
    produits: "Test",
    montant_total: 0,
    montant_encaisse: 0,
    restant: 0,
    statut: "livré",
    type: "livraison",
    instructions: "",
    date_creation: "2026-03-30T00:00:00.000Z",
    date_mise_a_jour: "2026-03-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("calculateStatsFromDeliveries — montantEncaisse", () => {
  it("cas normal : auto-tarif appliqué (amount_paid = amount_due - fee)", () => {
    // Backend a calculé amount_paid = 8000, delivery_fee = 2000
    const deliveries = [
      makeDelivery({ montant_total: 10000, montant_encaisse: 8000, frais_livraison: 2000, statut: "livré" }),
      makeDelivery({ montant_total: 10000, montant_encaisse: 8000, frais_livraison: 2000, statut: "livré" }),
    ];
    const stats = calculateStatsFromDeliveries(deliveries);
    expect(stats.montantEncaisse).toBe(20000);
    expect(stats.montantNetEncaisse).toBe(16000);
    expect(stats.totalTarifs).toBe(4000);
  });

  it("bug corrigé : frais fixés manuellement (amount_paid non recalculé = amount_due)", () => {
    // amount_paid reste à 10000 car le backend ne recalcule pas lors d'un PUT delivery_fee seul
    const deliveries = [
      makeDelivery({ montant_total: 10000, montant_encaisse: 10000, frais_livraison: 2000, statut: "livré" }),
      makeDelivery({ montant_total: 10000, montant_encaisse: 10000, frais_livraison: 2000, statut: "livré" }),
    ];
    const stats = calculateStatsFromDeliveries(deliveries);
    // Avant le fix : montantEncaisse aurait été 24000 (10000 + 2000) × 2
    expect(stats.montantEncaisse).toBe(20000);
    expect(stats.montantNetEncaisse).toBe(16000);
    expect(stats.totalTarifs).toBe(4000);
  });

  it("sans frais : montantEncaisse = sum(amount_due), partenaire = sum(amount_due)", () => {
    const deliveries = [
      makeDelivery({ montant_total: 10000, montant_encaisse: 10000, frais_livraison: undefined, statut: "livré" }),
      makeDelivery({ montant_total: 10000, montant_encaisse: 10000, frais_livraison: undefined, statut: "livré" }),
    ];
    const stats = calculateStatsFromDeliveries(deliveries);
    expect(stats.montantEncaisse).toBe(20000);
    expect(stats.montantNetEncaisse).toBe(20000);
    expect(stats.totalTarifs).toBe(0);
  });

  it("mix livré + pickup + en_cours", () => {
    const deliveries = [
      makeDelivery({ montant_total: 10000, montant_encaisse: 8000, frais_livraison: 2000, statut: "livré" }),
      makeDelivery({ montant_total: 5000, montant_encaisse: 4000, frais_livraison: 1000, statut: "pickup" }),
      makeDelivery({ montant_total: 8000, montant_encaisse: 0, frais_livraison: undefined, statut: "en_cours" }),
    ];
    const stats = calculateStatsFromDeliveries(deliveries);
    // livré: 10000, pickup: 5000, en_cours: amount_paid=0
    expect(stats.montantEncaisse).toBe(15000);
    // partenaire: livré 10000-2000=8000, pickup 5000-1000=4000
    expect(stats.montantNetEncaisse).toBe(12000);
    expect(stats.totalTarifs).toBe(3000);
  });

  it("annulé n'est pas compté", () => {
    const deliveries = [
      makeDelivery({ montant_total: 10000, montant_encaisse: 10000, frais_livraison: 0, statut: "annulé" }),
    ];
    const stats = calculateStatsFromDeliveries(deliveries);
    expect(stats.montantEncaisse).toBe(0);
    expect(stats.montantNetEncaisse).toBe(0);
  });
});
