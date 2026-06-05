/**
 * React Query hook for fetching daily statistics
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getDailyStats, type FrontendStats } from "@/services/stats";
import { toast } from "sonner";

interface UseStatsOptions {
  date?: string;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

export function useStats(options: UseStatsOptions = {}) {
  const { date, enabled = true, onError } = options;

  const result = useQuery({
    queryKey: ['dailyStats', date],
    queryFn: () => getDailyStats(date),
    enabled,
    retry: 2,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  useEffect(() => {
    if (result.isError) {
      const errorMessage = result.error instanceof Error ? result.error.message : 'Une erreur est survenue';
      toast.error('Erreur lors du chargement des statistiques', { description: errorMessage });
      onError?.(result.error as Error);
    }
  }, [result.isError, result.error, onError]);

  return result;
}
















