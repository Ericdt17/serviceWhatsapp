/**
 * Deliveries API Service
 * Functions for interacting with the deliveries API endpoints
 */

import { apiGet, apiPost, apiPut, ApiResponse, PaginationInfo } from "./api";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  transformDeliveryToFrontend,
  transformDeliveryToBackend,
  transformDeliveriesToFrontend,
  transformHistoryToFrontend,
  transformHistoriesToFrontend,
  type BackendDelivery,
  type FrontendDelivery,
  type BackendHistory,
  type FrontendHistory,
} from "@/lib/data-transform";

// Query parameters for getting deliveries
export interface GetDeliveriesParams {
  page?: number;
  limit?: number;
  status?: string;
  date?: string;
  phone?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  group_id?: number | null;
  agency_id?: number;
}

// Response type for getDeliveries
export interface GetDeliveriesResponse {
  deliveries: FrontendDelivery[];
  pagination: PaginationInfo;
}

// Request body for creating/updating delivery
export interface CreateDeliveryRequest {
  phone: string;
  customer_name?: string;
  items: string;
  amount_due: number;
  amount_paid?: number;
  status?: string;
  quartier?: string;
  notes?: string;
  carrier?: string;
  delivery_fee?: number;
  group_id?: number | null;
}

export type UpdateDeliveryRequest = Partial<CreateDeliveryRequest>;

/**
 * Get all deliveries with optional filters and pagination
 */
export async function getDeliveries(
  params?: GetDeliveriesParams
): Promise<GetDeliveriesResponse> {
  const response = await apiGet<BackendDelivery[]>(
    API_ENDPOINTS.DELIVERIES,
    params
  );

  if (!response.data) {
    throw new Error("No data returned from API");
  }

  const deliveries = transformDeliveriesToFrontend(response.data);
  const pagination = response.pagination || {
    page: params?.page || 1,
    limit: params?.limit || 50,
    total: deliveries.length,
    totalPages: 1,
  };

  return {
    deliveries,
    pagination,
  };
}

/**
 * Get a single delivery by ID
 */
export async function getDeliveryById(
  id: number | string
): Promise<FrontendDelivery> {
  const response = await apiGet<BackendDelivery>(
    API_ENDPOINTS.DELIVERY_BY_ID(id)
  );

  if (!response.data) {
    throw new Error("Delivery not found");
  }

  return transformDeliveryToFrontend(response.data);
}

/**
 * Create a new delivery
 */
export async function createDelivery(
  data: CreateDeliveryRequest
): Promise<FrontendDelivery> {
  const response = await apiPost<BackendDelivery>(
    API_ENDPOINTS.DELIVERIES,
    data
  );

  if (!response.data) {
    throw new Error("Failed to create delivery");
  }

  return transformDeliveryToFrontend(response.data);
}

/**
 * Update an existing delivery
 */
export async function updateDelivery(
  id: number | string,
  data: UpdateDeliveryRequest
): Promise<FrontendDelivery> {
  const response = await apiPut<BackendDelivery>(
    API_ENDPOINTS.DELIVERY_BY_ID(id),
    data
  );

  if (!response.data) {
    throw new Error("Failed to update delivery");
  }

  return transformDeliveryToFrontend(response.data);
}

/**
 * Get delivery history
 */
export async function getDeliveryHistory(
  id: number | string
): Promise<FrontendHistory[]> {
  const response = await apiGet<BackendHistory[]>(
    API_ENDPOINTS.DELIVERY_HISTORY(id)
  );

  if (!response.data) {
    return [];
  }

  return transformHistoriesToFrontend(response.data);
}

/**
 * Create multiple deliveries at once (bulk insert)
 */
export async function createDeliveriesBulk(
  deliveries: CreateDeliveryRequest[]
): Promise<{
  success: number;
  failed: number;
  results: {
    success: Array<{ index: number; id: number; data: FrontendDelivery }>;
    failed: Array<{
      index: number;
      data: CreateDeliveryRequest;
      error: string;
    }>;
  };
}> {
  const response = await apiPost<{
    created: number;
    failed: number;
    results: {
      success: Array<{ index: number; id: number; data: BackendDelivery }>;
      failed: Array<{
        index: number;
        data: CreateDeliveryRequest;
        error: string;
      }>;
    };
  }>(API_ENDPOINTS.DELIVERIES_BULK, { deliveries });

  if (!response.data) {
    throw new Error("Failed to create deliveries");
  }

  // Transform successful deliveries
  const transformedSuccess = response.data.results.success.map((item) => ({
    index: item.index,
    id: item.id,
    data: transformDeliveryToFrontend(item.data),
  }));

  return {
    success: response.data.created,
    failed: response.data.failed,
    results: {
      success: transformedSuccess,
      failed: response.data.results.failed,
    },
  };
}
