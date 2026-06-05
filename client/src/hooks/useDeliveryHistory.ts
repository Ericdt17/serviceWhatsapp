/**
 * React Query hook for delivery history
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getDeliveryHistory, type FrontendHistory } from "@/services/deliveries";
import { toast } from "sonner";

interface UseDeliveryHistoryOptions {
  enabled?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Hook for fetching delivery history
 */
export function useDeliveryHistory(
  deliveryId: number | string | undefined,
  options: UseDeliveryHistoryOptions = {}
) {
  const { enabled = true, onError } = options;

  const result = useQuery({
    queryKey: ['deliveryHistory', deliveryId],
    queryFn: () => getDeliveryHistory(deliveryId!),
    enabled: enabled && !!deliveryId,
    retry: 2,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  useEffect(() => {
    if (result.isError) {
      const errorMessage = result.error instanceof Error ? result.error.message : 'Une erreur est survenue';
      toast.error("Erreur lors du chargement de l'historique", { description: errorMessage });
      onError?.(result.error as Error);
    }
  }, [result.isError, result.error, onError]);

  return result;
}
















