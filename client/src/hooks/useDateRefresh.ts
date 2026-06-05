import { useEffect, useRef } from "react";
import { getTodayLocal, getDateRangeForPreset, type DateRange } from "@/lib/date-utils";

/**
 * Detects when the system date has changed (e.g. after a wrong clock is corrected)
 * and calls onDateChanged so the caller can reset date filters to today.
 *
 * Triggers on:
 * - document visibilitychange (user switches back to the tab)
 * - window focus (user clicks back on the browser window)
 */
export function useDateRefresh(onDateChanged: (newRange: DateRange) => void) {
  const lastKnownDate = useRef<string>(getTodayLocal());

  useEffect(() => {
    function checkDate() {
      const currentDate = getTodayLocal();
      if (currentDate !== lastKnownDate.current) {
        lastKnownDate.current = currentDate;
        onDateChanged(getDateRangeForPreset("today"));
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkDate();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkDate);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", checkDate);
    };
  }, [onDateChanged]);
}
