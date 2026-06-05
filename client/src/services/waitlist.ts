/**
 * Waitlist API (super admin list; public POST is used by the landing site)
 */

import { apiGet } from "./api";
import type { PaginationInfo } from "@/types/api";
import { API_ENDPOINTS } from "@/lib/api-config";

export interface WaitlistEntry {
  id: number;
  email: string;
  phone: string;
  created_at: string;
}

export interface GetWaitlistResponse {
  entries: WaitlistEntry[];
  pagination: PaginationInfo;
}

export async function getWaitlist(
  page?: number,
  limit?: number
): Promise<GetWaitlistResponse> {
  const response = await apiGet<WaitlistEntry[]>(API_ENDPOINTS.WAITLIST, {
    page,
    limit,
  });

  if (!response.success || response.data === undefined) {
    throw new Error(
      response.error || response.message || "Impossible de charger la liste d'attente"
    );
  }

  const entries = Array.isArray(response.data) ? response.data : [];
  const pagination =
    response.pagination ||
    ({
      page: page ?? 1,
      limit: limit ?? 50,
      total: entries.length,
      totalPages: 1,
    } satisfies PaginationInfo);

  return { entries, pagination };
}
