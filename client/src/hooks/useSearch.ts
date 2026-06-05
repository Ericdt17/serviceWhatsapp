/**
 * React Query hook for searching deliveries
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { searchDeliveries, type FrontendDelivery } from "@/services/search";
import { toast } from "sonner";

interface UseSearchOptions {
  enabled?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Hook for searching deliveries
 */
export function useSearch(
  query: string,
  options: UseSearchOptions = {}
) {
  const { enabled = true, onError } = options;

  const result = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchDeliveries(query),
    enabled: enabled && !!query && query.trim().length > 0,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10000,
  });

  useEffect(() => {
    if (result.isError) {
      const errorMessage = result.error instanceof Error ? result.error.message : 'Une erreur est survenue';
      toast.error('Erreur lors de la recherche', { description: errorMessage });
      onError?.(result.error as Error);
    }
  }, [result.isError, result.error, onError]);

  return result;
}
















