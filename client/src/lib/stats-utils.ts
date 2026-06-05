/**
 * Statistics calculation utilities
 * Centralized functions for calculating statistics from deliveries data
 */

import type { FrontendDelivery } from "@/types/delivery";

/**
 * Statistics result structure
 */
export interface CalculatedStats {
  totalLivraisons: number;
  livreesReussies: number;
  echecs: number;
  enCours: number;
  pickups: number;
  expeditions: number;
  montantEncaisse: number; // Montant brut (amount_paid + delivery_fee pour delivered et pickup)
  montantRestant: number; // Reste à payer (0 pour delivered car complètement payé)
  chiffreAffaires: number;
  totalTarifs?: number; // Somme des frais_livraison des livraisons "livré" et "pickup"
  montantNetEncaisse?: number; // Montant net = montantEncaisse - totalTarifs (à reverser au groupe)
}

/**
 * Calculate statistics from an array of deliveries
 * @param deliveries - Array of frontend delivery objects
 * @returns Calculated statistics object
 */
export function calculateStatsFromDeliveries(
  deliveries: FrontendDelivery[]
): CalculatedStats {
  const total = deliveries.length;
  const livrees = deliveries.filter((d) => d.statut === "livré").length;
  const annules = deliveries.filter((d) => d.statut === "annulé").length;
  const pickups = deliveries.filter((d) => d.statut === "pickup").length;
  const expeditions = deliveries.filter(
    (d) => d.statut === "expedition"
  ).length;
  const enCours = deliveries.filter((d) => d.statut === "en_cours").length;

  // Calculate total tariffs (sum of delivery_fee for "delivered", "pickup", and "client_absent")
  const totalTarifs = deliveries
    .filter((d) => d.statut === "livré" || d.statut === "pickup" || d.statut === "client_absent")
    .reduce((sum, d) => {
      const fee = Number(d.frais_livraison) || 0;
      return sum + fee;
    }, 0);

  // Calculate montantEncaisse (brut amount collected from customer):
  // - For "delivered" and "pickup": amount_due (total collected, regardless of how amount_paid/delivery_fee are stored)
  // - For "injoignable", "ne_decroche_pas", "annulé", "renvoyé": 0 (no delivery made)
  // - For others: amount_paid only
  //
  // NOTE: We use amount_due (montant_total) instead of amount_paid + delivery_fee to avoid
  // double-counting when delivery_fee is set manually after creation (in that case amount_paid
  // is not recalculated by the backend and would still equal amount_due).
  const encaisse = deliveries.reduce((sum, d) => {
    if (d.statut === "livré" || d.statut === "pickup") {
      // Total collected from customer = amount_due
      return sum + (Number(d.montant_total) || 0);
    } else if (d.statut === "annulé" || d.statut === "renvoyé" || d.statut === "injoignable" || d.statut === "ne_decroche_pas") {
      return sum + 0;
    } else {
      return sum + (Number(d.montant_encaisse) || 0);
    }
  }, 0);

  // Calculate montantRestant:
  // - For "delivered" and "pickup": 0 (completely paid)
  // - For "injoignable", "ne_decroche_pas", "annulé", "renvoyé": 0 (no delivery made, cannot collect anymore)
  // - For others: restant as calculated (amount_due - amount_paid)
  const restant = deliveries.reduce((sum, d) => {
    if (d.statut === "livré" || d.statut === "pickup") {
      // Delivered and pickup deliveries are completely paid, no remaining amount
      return sum + 0;
    } else if (d.statut === "annulé" || d.statut === "renvoyé" || d.statut === "injoignable" || d.statut === "ne_decroche_pas") {
      // Cancelled/returned/injoignable/ne_decroche_pas: no delivery made or cannot collect anymore, restant = 0
      return sum + 0;
    } else {
      const remaining = Number(d.restant) || 0;
      return sum + remaining;
    }
  }, 0);

  // Calculate montantNetEncaisse (amount to reverse to group = partenaire)
  // = amount_due - delivery_fee for "delivered" and "pickup" deliveries
  //
  // NOTE: We use amount_due - delivery_fee instead of amount_paid because amount_paid
  // may equal amount_due when delivery_fee was set manually (backend doesn't recalculate
  // amount_paid on fee-only updates).
  const montantNetEncaisse = deliveries.reduce((sum, d) => {
    if (d.statut === "livré" || d.statut === "pickup") {
      const amountDue = Number(d.montant_total) || 0;
      const deliveryFee = Number(d.frais_livraison) || 0;
      return sum + (amountDue - deliveryFee);
    } else {
      return sum + 0;
    }
  }, 0);

  return {
    totalLivraisons: total,
    livreesReussies: livrees,
    echecs: annules,  // Variable garde le nom "echecs" pour compatibilité, mais compte "annulé"
    enCours,
    pickups,
    expeditions,
    montantEncaisse: encaisse,
    montantRestant: restant,
    chiffreAffaires: encaisse + restant,
    totalTarifs,
    montantNetEncaisse,
  };
}




