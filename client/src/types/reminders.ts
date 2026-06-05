export type ReminderStatus = "scheduled" | "running" | "completed" | "cancelled" | "failed";
export type ReminderAudienceMode = "contacts" | "groups" | "quick_numbers" | "all_groups";
export type ReminderTargetStatus = "queued" | "sent" | "failed" | "skipped" | "cancelled";

export interface ReminderTarget {
  id: number;
  reminder_id: number;
  target_type: "contact" | "group" | "quick_number";
  target_value: string;
  status: ReminderTargetStatus;
  attempts: number;
  last_error?: string | null;
  sent_at?: string | null;
}

export interface ReminderContact {
  id: number;
  agency_id: number;
  label: string;
  phone: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Reminder {
  id: number;
  agency_id: number | null;
  contact_id?: number | null;
  contact_label?: string | null;
  contact_phone?: string | null;
  message: string;
  send_at: string;
  timezone: string;
  audience_mode?: ReminderAudienceMode;
  send_interval_min_sec?: number;
  send_interval_max_sec?: number;
  window_start?: string | null;
  window_end?: string | null;
  status: ReminderStatus;
  total_targets?: number;
  sent_count?: number;
  failed_count?: number;
  skipped_count?: number;
  progress_percent?: number;
  targets?: ReminderTarget[];
  sent_at?: string | null;
  last_error?: string | null;
  created_by_user_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

