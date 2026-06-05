/**
 * Delivery Types
 * Type definitions for delivery-related data structures
 * Separated into backend (API) and frontend (UI) types
 */

// ============================================================================
// Status and Type Enums
// ============================================================================

/**
 * Delivery status values used in the frontend (French)
 */
export type StatutLivraison =
  | "en_cours"
  | "livré"
  | "échec"
  | "pickup"
  | "expedition"
  | "annulé"
  | "renvoyé"
  | "client_absent"
  | "injoignable"
  | "ne_decroche_pas";

/**
 * Delivery type values
 */
export type TypeLivraison = "livraison" | "pickup" | "expedition";

/**
 * Backend delivery status values (English)
 */
export type BackendStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "pickup"
  | "expedition"
  | "cancelled"
  | "postponed"
  | "client_absent"
  | "unreachable"
  | "no_answer";

/**
 * Modification type values
 */
export type ModificationType =
  | "numero"
  | "montant"
  | "produits"
  | "quartier"
  | "ajout_produit"
  | "suppression_produit"
  | "statut"
  | "notes"
  | "carrier";

// ============================================================================
// Backend Types (API/Database)
// ============================================================================

/**
 * Delivery data structure as returned from the backend API
 */
export interface BackendDelivery {
  id: number;
  phone: string;
  customer_name?: string | null;
  items: string;
  amount_due: number;
  amount_paid: number;
  status: BackendStatus | string; // Allow string for flexibility
  quartier?: string | null;
  notes?: string | null;
  carrier?: string | null;
  group_id?: number | null;
  agency_id?: number | null;
  delivery_fee?: number | null;
  tariff_pending?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Delivery history entry as returned from the backend API
 */
export interface BackendHistory {
  id: number;
  delivery_id: number;
  action: string;
  details?: string | null;
  actor?: string | null;
  created_at: string;
}

/**
 * Request body for creating a new delivery
 */
export interface CreateDeliveryRequest {
  phone: string;
  customer_name?: string;
  items: string;
  amount_due: number;
  amount_paid?: number;
  status?: BackendStatus | string;
  quartier?: string;
  notes?: string;
  carrier?: string;
}

/**
 * Request body for updating an existing delivery
 */
export interface UpdateDeliveryRequest extends Partial<CreateDeliveryRequest> {
  id?: number; // Usually not needed in body, but included for completeness
}

/**
 * Request body for bulk creating deliveries
 */
export interface BulkCreateDeliveryRequest {
  deliveries: CreateDeliveryRequest[];
}

// ============================================================================
// Frontend Types (UI/Display)
// ============================================================================

/**
 * Delivery data structure used in the frontend UI
 */
export interface FrontendDelivery {
  id: number;
  telephone: string;
  customer_name?: string | null;
  quartier: string;
  produits: string;
  montant_total: number;
  montant_encaisse: number;
  restant: number;
  statut: StatutLivraison;
  type: TypeLivraison;
  instructions: string;
  date_creation: string;
  date_mise_a_jour: string;
  carrier?: string | null;
  group_id?: number | null;
  group_name?: string | null;
  agency_id?: number | null;
  frais_livraison?: number;
  tarif_non_applique?: boolean;
}

/**
 * Delivery history entry used in the frontend UI
 */
export interface FrontendHistory {
  id: number;
  livraison_id: number;
  action: string;
  details: string;
  actor: string;
  date: string;
}

/**
 * Modification entry displayed in the modifications page
 */
export interface FrontendModification {
  id: number;
  livraison_id: number;
  type: ModificationType;
  ancienne_valeur: string;
  nouvelle_valeur: string;
  date: string;
  auteur: string;
  telephone?: string; // Optional, added for display purposes
}

// ============================================================================
// Query and Filter Types
// ============================================================================

/**
 * Query parameters for fetching deliveries
 */
export interface GetDeliveriesParams {
  page?: number;
  limit?: number;
  status?: BackendStatus | string;
  date?: string; // YYYY-MM-DD format
  phone?: string;
  startDate?: string; // YYYY-MM-DD format
  endDate?: string; // YYYY-MM-DD format
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  group_id?: number | null;
}

/**
 * Response structure for getDeliveries query
 */
export interface GetDeliveriesResponse {
  deliveries: FrontendDelivery[];
  pagination: PaginationInfo;
}

/**
 * Search response structure
 */
export interface SearchDeliveriesResponse {
  deliveries: FrontendDelivery[];
  count: number;
  query: string;
}

// ============================================================================
// Re-export PaginationInfo from api types
// ============================================================================

import type { PaginationInfo } from "./api";

// Re-export for convenience
export type { PaginationInfo };
