/**
 * Search Service
 * Functions for searching deliveries
 */

import { apiGet } from "./api";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  transformDeliveriesToFrontend,
  type BackendDelivery,
  type FrontendDelivery,
} from "@/lib/data-transform";

/**
 * Search deliveries by query string
 * @param query - Search query string
 * @returns Array of matching deliveries in frontend format
 */
export async function searchDeliveries(query: string): Promise<FrontendDelivery[]> {
  const response = await apiGet<BackendDelivery[]>(
    API_ENDPOINTS.SEARCH,
    { q: query }
  );

  if (!response.data) {
    return [];
  }

  return transformDeliveriesToFrontend(response.data);
}

// Re-export FrontendDelivery type for convenience
export type { FrontendDelivery } from "@/lib/data-transform";
