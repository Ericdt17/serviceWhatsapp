export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
  TIMEOUT: 30000, // 30 seconds to handle Render free tier cold starts (10-30s wake time)
};

export function buildApiUrl(path: string): string {
  const prefix = path.startsWith("/") ? "" : "/";
  return `${API_CONFIG.BASE_URL}${prefix}${path}`;
}

export const API_ENDPOINTS = {
  DELIVERIES: "/api/v1/deliveries",
  DELIVERIES_BULK: "/api/v1/deliveries/bulk",
  DELIVERY_BY_ID: (id: number | string) => `/api/v1/deliveries/${id}`,
  DELIVERY_HISTORY: (id: number | string) => `/api/v1/deliveries/${id}/history`,
  EXPEDITIONS: "/api/v1/expeditions",
  EXPEDITION_BY_ID: (id: number | string) => `/api/v1/expeditions/${id}`,
  EXPEDITIONS_STATS: "/api/v1/expeditions/stats/summary",
  STATS_DAILY: "/api/v1/stats/daily",
  SEARCH: "/api/v1/search",
  REMINDER_CONTACTS: "/api/v1/reminder-contacts",
  REMINDERS: "/api/v1/reminders",
  WAITLIST: "/api/v1/waitlist",
};
