import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import { API_ENDPOINTS } from "@/lib/api-config";
import type {
  BackendExpedition,
  ExpeditionStatus,
  FrontendExpedition,
  ExpeditionStats,
} from "@/types/expedition";
import type { PaginationInfo } from "./api";

export interface GetExpeditionsParams {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  status?: ExpeditionStatus | string;
  group_id?: number;
  agency_id?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

export interface CreateExpeditionRequest {
  group_id: number;
  destination: string;
  agence_de_voyage: string;
  frais_de_course: number;
  frais_de_lagence_de_voyage: number;
  status?: ExpeditionStatus;
  notes?: string;
  agency_id?: number;
}

export type UpdateExpeditionRequest = Partial<CreateExpeditionRequest>;

export interface GetExpeditionsResponse {
  expeditions: FrontendExpedition[];
  pagination: PaginationInfo;
}

function toFrontendExpedition(expedition: BackendExpedition): FrontendExpedition {
  return {
    id: expedition.id,
    agencyId: expedition.agency_id,
    groupId: expedition.group_id,
    groupName: expedition.group_name || undefined,
    destination: expedition.destination || "",
    agenceDeVoyage: expedition.agence_de_voyage || "",
    fraisDeCourse: Number(expedition.frais_de_course) || 0,
    fraisDeLAgenceDeVoyage: Number(expedition.frais_de_lagence_de_voyage) || 0,
    status: (expedition.status || "en_attente") as ExpeditionStatus,
    notes: expedition.notes || "",
    createdAt: expedition.created_at || "",
    updatedAt: expedition.updated_at || "",
  };
}

export async function getExpeditions(
  params?: GetExpeditionsParams
): Promise<GetExpeditionsResponse> {
  const response = await apiGet<BackendExpedition[]>(
    API_ENDPOINTS.EXPEDITIONS,
    params
  );

  const expeditions = Array.isArray(response.data)
    ? response.data.map(toFrontendExpedition)
    : [];

  return {
    expeditions,
    pagination: response.pagination || {
      page: params?.page || 1,
      limit: params?.limit || 50,
      total: expeditions.length,
      totalPages: 1,
    },
  };
}

export async function getExpeditionById(id: number | string): Promise<FrontendExpedition | null> {
  const response = await apiGet<BackendExpedition>(API_ENDPOINTS.EXPEDITION_BY_ID(id));
  return response.data ? toFrontendExpedition(response.data) : null;
}

export async function createExpedition(
  payload: CreateExpeditionRequest
): Promise<FrontendExpedition | null> {
  const response = await apiPost<BackendExpedition>(API_ENDPOINTS.EXPEDITIONS, payload);
  return response.data ? toFrontendExpedition(response.data) : null;
}

export async function updateExpedition(
  id: number | string,
  payload: UpdateExpeditionRequest
): Promise<FrontendExpedition | null> {
  const response = await apiPut<BackendExpedition>(API_ENDPOINTS.EXPEDITION_BY_ID(id), payload);
  return response.data ? toFrontendExpedition(response.data) : null;
}

export async function deleteExpedition(id: number | string): Promise<boolean> {
  const response = await apiDelete(API_ENDPOINTS.EXPEDITION_BY_ID(id));
  return Boolean(response.success);
}

export async function getExpeditionStats(
  params?: Omit<GetExpeditionsParams, "page" | "limit" | "sortBy" | "sortOrder" | "search">
): Promise<ExpeditionStats> {
  const response = await apiGet<{
    total_expeditions: number;
    total_frais_de_course: number;
    total_frais_de_lagence_de_voyage: number;
  }>(API_ENDPOINTS.EXPEDITIONS_STATS, params);

  const data = response.data;
  return {
    totalExpeditions: Number(data?.total_expeditions) || 0,
    totalFraisDeCourse: Number(data?.total_frais_de_course) || 0,
    totalFraisDeLAgenceDeVoyage: Number(data?.total_frais_de_lagence_de_voyage) || 0,
  };
}
