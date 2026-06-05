/**
 * Stats API Service
 * Functions for interacting with the stats API endpoints
 */

import { apiGet } from './api';
import { API_ENDPOINTS } from '@/lib/api-config';
import type { BackendStats, FrontendStats } from '@/types/stats';

// Re-export types for backward compatibility
export type { BackendStats, FrontendStats };

/**
 * Get daily statistics
 * @param date - Optional date string (YYYY-MM-DD format). If not provided, returns today's stats
 * @param group_id - Optional group ID to filter stats by group
 * @param agency_id - Optional agency ID to filter stats by agency (for super admin)
 */
export async function getDailyStats(date?: string, group_id?: number | null, agency_id?: number): Promise<FrontendStats> {
  const params: Record<string, string | number> = {};
  if (date) params.date = date;
  if (group_id) params.group_id = group_id;
  if (agency_id) params.agency_id = agency_id;
  const response = await apiGet<BackendStats>(
    API_ENDPOINTS.STATS_DAILY,
    Object.keys(params).length > 0 ? params : undefined
  );
  
  if (!response.data) {
    throw new Error('No stats data returned from API');
  }

  const stats = response.data;
  
  // Calculate total amount due (collected + remaining)
  const montantTotal = (stats.total_collected || 0) + (stats.total_remaining || 0);
  
  // For expeditions, we'll need to count deliveries with carrier field
  // Since the stats endpoint doesn't provide this, we'll set it to 0 for now
  // This can be enhanced later by making an additional API call if needed
  const expeditions = 0;
  
  return {
    totalLivraisons: stats.total || 0,
    livreesReussies: stats.delivered || 0,
    echecs: stats.failed || 0,
    enCours: stats.pending || 0,
    pickups: stats.pickup || 0,
    expeditions: expeditions,
    montantTotal: montantTotal,
    montantEncaisse: stats.total_collected || 0,
    montantRestant: stats.total_remaining || 0,
    chiffreAffaires: stats.total_collected || 0, // Same as montantEncaisse
  };
}

