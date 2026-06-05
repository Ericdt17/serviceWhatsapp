/**
 * Date utility functions
 * Handles date formatting in local timezone (not UTC)
 */

/**
 * Format a date to YYYY-MM-DD string in local timezone
 * @param date - Date object or date string
 * @returns Date string in YYYY-MM-DD format (local timezone)
 */
export function formatDateLocal(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in local timezone as YYYY-MM-DD
 * @returns Today's date string in YYYY-MM-DD format (local timezone)
 */
export function getTodayLocal(): string {
  return formatDateLocal(new Date());
}

/**
 * Get date range for a period (jour/semaine/mois) in local timezone
 * @param period - Period type
 * @returns Object with startDate and endDate in YYYY-MM-DD format (local timezone)
 */
export function getDateRangeLocal(period: "jour" | "semaine" | "mois"): {
  startDate: string;
  endDate: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case "jour":
      return {
        startDate: formatDateLocal(today),
        endDate: formatDateLocal(today),
      };
    case "semaine": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      return {
        startDate: formatDateLocal(weekStart),
        endDate: formatDateLocal(today),
      };
    }
    case "mois": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: formatDateLocal(monthStart),
        endDate: formatDateLocal(today),
      };
    }
  }
}

/**
 * Preset date range options
 */
export type DateRangePreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "custom";

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Get date range for a preset option
 */
export function getDateRangeForPreset(preset: DateRangePreset): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today": {
      return {
        startDate: formatDateLocal(today),
        endDate: formatDateLocal(today),
      };
    }
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: formatDateLocal(yesterday),
        endDate: formatDateLocal(yesterday),
      };
    }
    case "thisWeek": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday = 0)
      return {
        startDate: formatDateLocal(weekStart),
        endDate: formatDateLocal(today),
      };
    }
    case "lastWeek": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() - 7); // Last week start
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // Last week end
      return {
        startDate: formatDateLocal(weekStart),
        endDate: formatDateLocal(weekEnd),
      };
    }
    case "thisMonth": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: formatDateLocal(monthStart),
        endDate: formatDateLocal(today),
      };
    }
    case "lastMonth": {
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of last month
      return {
        startDate: formatDateLocal(lastMonthStart),
        endDate: formatDateLocal(lastMonthEnd),
      };
    }
    case "thisYear": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return {
        startDate: formatDateLocal(yearStart),
        endDate: formatDateLocal(today),
      };
    }
    case "lastYear": {
      const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
      return {
        startDate: formatDateLocal(lastYearStart),
        endDate: formatDateLocal(lastYearEnd),
      };
    }
    case "custom":
    default:
      return {
        startDate: formatDateLocal(today),
        endDate: formatDateLocal(today),
      };
  }
}

/**
 * Get label for a preset option
 */
export function getPresetLabel(preset: DateRangePreset): string {
  const labels: Record<DateRangePreset, string> = {
    today: "Aujourd'hui",
    yesterday: "Hier",
    thisWeek: "Cette semaine",
    lastWeek: "Semaine dernière",
    thisMonth: "Ce mois",
    lastMonth: "Mois dernier",
    thisYear: "Cette année",
    lastYear: "Année dernière",
    custom: "Personnalisé",
  };
  return labels[preset];
}
