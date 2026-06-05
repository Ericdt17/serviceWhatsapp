import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { ReminderContact } from "@/types/reminders";

export interface GetReminderContactsParams {
  agency_id?: number;
  includeInactive?: boolean;
}

export interface CreateReminderContactRequest {
  label: string;
  phone: string;
  is_active?: boolean;
  agency_id?: number; // super admin only
}

export type UpdateReminderContactRequest = Partial<CreateReminderContactRequest>;

export async function getReminderContacts(
  params?: GetReminderContactsParams
): Promise<ReminderContact[]> {
  const response = await apiGet<ReminderContact[]>(
    API_ENDPOINTS.REMINDER_CONTACTS,
    params
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function createReminderContact(
  payload: CreateReminderContactRequest
): Promise<ReminderContact | null> {
  const response = await apiPost<ReminderContact>(
    API_ENDPOINTS.REMINDER_CONTACTS,
    payload
  );
  return response.data ?? null;
}

export async function updateReminderContact(
  id: number | string,
  payload: UpdateReminderContactRequest
): Promise<ReminderContact | null> {
  const response = await apiPut<ReminderContact>(
    `${API_ENDPOINTS.REMINDER_CONTACTS}/${id}`,
    payload
  );
  return response.data ?? null;
}

export async function deleteReminderContact(id: number | string): Promise<boolean> {
  const response = await apiDelete(`${API_ENDPOINTS.REMINDER_CONTACTS}/${id}`);
  return Boolean(response.success);
}

