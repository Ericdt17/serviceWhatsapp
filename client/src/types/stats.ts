/**
 * Stats Types
 * Type definitions for statistics data structures
 */

// ============================================================================
// Backend Stats Types
// ============================================================================

/**
 * Statistics data structure as returned from the backend API
 */
export interface BackendStats {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  pickup: number;
  total_collected: number;
  total_remaining: number;
}

// ============================================================================
// Frontend Stats Types
// ============================================================================

/**
 * Statistics data structure used in the frontend UI
 */
export interface FrontendStats {
  totalLivraisons: number;
  livreesReussies: number;
  echecs: number;
  enCours: number;
  pickups: number;
  expeditions: number;
  montantTotal: number;
  montantEncaisse: number;
  montantRestant: number;
  chiffreAffaires: number;
}

// ============================================================================
// Report Types
// ============================================================================

/**
 * Report period options
 */
export type ReportPeriod = "jour" | "semaine" | "mois";

/**
 * Report data structure
 */
export interface ReportData {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  stats: FrontendStats;
  deliveries?: Record<string, unknown>[]; // Can be typed more specifically if needed
}






