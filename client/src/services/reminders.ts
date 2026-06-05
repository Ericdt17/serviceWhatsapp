import { apiDelete, apiGet, apiPost } from "./api";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { Reminder, ReminderAudienceMode, ReminderStatus } from "@/types/reminders";

export interface GetRemindersParams {
  agency_id?: number;
  status?: ReminderStatus | string;
  contact_id?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface CreateReminderRequest {
  agency_id?: number | null;
  contact_id?: number;
  contact_ids?: number[];
  group_ids?: number[];
  quick_numbers?: string[];
  audience_mode?: ReminderAudienceMode;
  message: string;
  send_at: string; // ISO datetime
  timezone?: string;
  send_interval_min_sec?: number;
  send_interval_max_sec?: number;
  window_start?: string;
  window_end?: string;
}

export async function getReminders(params?: GetRemindersParams): Promise<Reminder[]> {
  const response = await apiGet<Reminder[]>(API_ENDPOINTS.REMINDERS, params);
  return Array.isArray(response.data) ? response.data : [];
}

export async function getReminderById(id: number | string): Promise<Reminder | null> {
  const response = await apiGet<Reminder>(`${API_ENDPOINTS.REMINDERS}/${id}`);
  return response.data ?? null;
}

export async function createReminder(payload: CreateReminderRequest): Promise<Reminder | null> {
  const response = await apiPost<Reminder>(API_ENDPOINTS.REMINDERS, payload);
  return response.data ?? null;
}

export async function cancelReminder(id: number | string): Promise<boolean> {
  const response = await apiPost(`${API_ENDPOINTS.REMINDERS}/${id}/cancel`, {});
  return Boolean(response.success);
}

export async function retryFailedReminder(id: number | string): Promise<boolean> {
  const response = await apiPost(`${API_ENDPOINTS.REMINDERS}/${id}/retry-failed`, {});
  return Boolean(response.success);
}

export async function deleteReminder(id: number | string): Promise<boolean> {
  const response = await apiDelete(`${API_ENDPOINTS.REMINDERS}/${id}`);
  return Boolean(response.success);
}

