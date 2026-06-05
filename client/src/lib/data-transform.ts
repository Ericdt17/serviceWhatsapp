/**
 * Data Transformation Utilities
 * Maps backend API data format to frontend display format and vice versa
 */

// Re-export types from types directory for backward compatibility
export type {
  BackendDelivery,
  BackendHistory,
  FrontendDelivery,
  FrontendHistory,
  StatutLivraison,
  TypeLivraison,
  BackendStatus,
  ModificationType,
  FrontendModification,
} from "@/types/delivery";

// Import types for use in this file
import type {
  BackendDelivery,
  BackendHistory,
  FrontendDelivery,
  FrontendHistory,
  StatutLivraison,
} from "@/types/delivery";

/**
 * Map backend status to frontend status
 */
function mapStatusToFrontend(backendStatus: string): StatutLivraison {
  const statusMap: Record<string, StatutLivraison> = {
    pending: "en_cours",
    delivered: "livré",
    failed: "annulé",  // Changé de "échec" à "annulé"
    pickup: "pickup",
    expedition: "expedition",
    cancelled: "annulé",
    postponed: "renvoyé",
    client_absent: "client_absent",
    unreachable: "injoignable",
    no_answer: "ne_decroche_pas",
    present_ne_decroche_zone1: "ne_decroche_pas",
    present_ne_decroche_zone2: "ne_decroche_pas",
  };

  return statusMap[backendStatus.toLowerCase()] || "en_cours";
}

/**
 * Map frontend status to backend status
 */
export function mapStatusToBackend(frontendStatus: StatutLivraison): string {
  const statusMap: Record<StatutLivraison, string> = {
    en_cours: "pending",
    livré: "delivered",
    échec: "failed",  // Gardé pour compatibilité avec anciennes données
    annulé: "failed",  // Changé : "annulé" mappe vers "failed" (pas "cancelled")
    renvoyé: "postponed",
    pickup: "pickup",
    expedition: "expedition",
    client_absent: "client_absent",
    injoignable: "unreachable",
    ne_decroche_pas: "no_answer",
  };

  return statusMap[frontendStatus] || "pending";
}

/**
 * Derive type from backend delivery data
 * - If carrier exists and status is expedition, type is "expedition"
 * - If status is pickup, type is "pickup"
 * - Otherwise type is "livraison"
 */
function deriveType(backendDelivery: BackendDelivery): TypeLivraison {
  const status = backendDelivery.status.toLowerCase();

  if (
    status === "expedition" ||
    (backendDelivery.carrier &&
      status !== "pending" &&
      status !== "delivered" &&
      status !== "failed" &&
      status !== "cancelled")
  ) {
    return "expedition";
  }

  if (status === "pickup") {
    return "pickup";
  }

  return "livraison";
}

/**
 * Transform backend delivery to frontend format
 */
export function transformDeliveryToFrontend(
  backend: BackendDelivery
): FrontendDelivery {
  // Calculate restant (remaining amount)
  // For "delivered" status: restant should be 0 (completely paid)
  // For "pickup" status: restant should be 0 (client picked up at office, applied 1000 FCFA tariff)
  // For "failed"/"cancelled"/"postponed"/"unreachable"/"no_answer" status: restant should be 0 (no delivery made, cannot collect anymore)
  // For other statuses: restant = amount_due - amount_paid
  const backendStatus = backend.status?.toLowerCase();
  const isDelivered = backendStatus === "delivered";
  const isPickup = backendStatus === "pickup";
  const isCancelled = backendStatus === "failed" || backendStatus === "cancelled" || backendStatus === "postponed" || backendStatus === "unreachable" || backendStatus === "no_answer";
  
  // Convertir explicitement en nombres pour éviter les problèmes avec les strings PostgreSQL
  // PostgreSQL retourne les DECIMAL/NUMERIC comme des strings en JavaScript
  const amountDue = typeof backend.amount_due === 'number' 
    ? backend.amount_due 
    : (backend.amount_due !== null && backend.amount_due !== undefined 
        ? parseFloat(String(backend.amount_due)) || 0 
        : 0);
  
  const amountPaid = typeof backend.amount_paid === 'number'
    ? backend.amount_paid
    : (backend.amount_paid !== null && backend.amount_paid !== undefined
        ? parseFloat(String(backend.amount_paid)) || 0
        : 0);
  
  const restant = isDelivered || isPickup || isCancelled
    ? 0 // Delivered, pickup, cancelled, or present_ne_decroche zones: no remaining amount
    : Math.max(0, amountDue - amountPaid);

  // Convertir delivery_fee aussi
  const deliveryFee = backend.delivery_fee !== null && backend.delivery_fee !== undefined
    ? (typeof backend.delivery_fee === 'number' 
        ? backend.delivery_fee 
        : parseFloat(String(backend.delivery_fee)) || undefined)
    : undefined;

  return {
    id: backend.id,
    telephone: backend.phone || "",
    quartier: backend.quartier || "",
    produits: backend.items || "",
    montant_total: amountDue,
    montant_encaisse: amountPaid,
    restant: restant,
    statut: mapStatusToFrontend(backend.status),
    type: deriveType(backend),
    instructions: backend.notes || "",
    date_creation: backend.created_at || "",
    date_mise_a_jour: backend.updated_at || backend.created_at || "",
    carrier: backend.carrier || null,
    group_id: backend.group_id || null,
    agency_id: backend.agency_id || null,
    frais_livraison: deliveryFee,
    tarif_non_applique: Boolean(backend.tariff_pending),
  };
}

/**
 * Transform frontend delivery to backend format (for create/update)
 */
export function transformDeliveryToBackend(
  frontend: Partial<FrontendDelivery>
): Partial<BackendDelivery> {
  const backend: Partial<BackendDelivery> = {};

  if (frontend.telephone !== undefined) {
    backend.phone = frontend.telephone;
  }

  if (frontend.produits !== undefined) {
    backend.items = frontend.produits;
  }

  if (frontend.montant_total !== undefined) {
    backend.amount_due = frontend.montant_total;
  }

  if (frontend.montant_encaisse !== undefined) {
    backend.amount_paid = frontend.montant_encaisse;
  }

  if (frontend.statut !== undefined) {
    backend.status = mapStatusToBackend(frontend.statut);
  }

  if (frontend.quartier !== undefined) {
    backend.quartier = frontend.quartier;
  }

  if (frontend.instructions !== undefined) {
    backend.notes = frontend.instructions;
  }

  if (frontend.frais_livraison !== undefined) {
    backend.delivery_fee = frontend.frais_livraison;
  }

  // If type is expedition, we might want to set carrier
  // For now, we'll leave carrier as-is if not provided
  // This can be enhanced later if needed

  return backend;
}

/**
 * Transform backend history to frontend format
 */
export function transformHistoryToFrontend(
  backend: BackendHistory
): FrontendHistory {
  return {
    id: backend.id,
    livraison_id: backend.delivery_id,
    action: backend.action || "",
    details: backend.details || "",
    date: backend.created_at || "",
  };
}

/**
 * Transform array of backend deliveries to frontend format
 */
export function transformDeliveriesToFrontend(
  backends: BackendDelivery[]
): FrontendDelivery[] {
  return backends.map(transformDeliveryToFrontend);
}

/**
 * Transform array of backend history to frontend format
 */
export function transformHistoriesToFrontend(
  backends: BackendHistory[]
): FrontendHistory[] {
  return backends.map(transformHistoryToFrontend);
}
