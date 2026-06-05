/**
 * React Query hooks for deliveries
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getDeliveries,
  getDeliveryById,
  createDelivery,
  updateDelivery,
  type GetDeliveriesParams,
  type GetDeliveriesResponse,
  type CreateDeliveryRequest,
  type UpdateDeliveryRequest,
  type FrontendDelivery,
} from "@/services/deliveries";
import { toast } from "sonner";

/**
 * Hook for fetching deliveries list
 */
export function useDeliveries(
  params?: GetDeliveriesParams,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options || {};

  const result = useQuery({
    queryKey: ["deliveries", params],
    queryFn: () => getDeliveries(params),
    enabled,
    retry: 2,
    refetchOnWindowFocus: true,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (result.isError) {
      const errorMessage = result.error instanceof Error ? result.error.message : "Une erreur est survenue";
      toast.error("Erreur lors du chargement des livraisons", { description: errorMessage });
    }
  }, [result.isError, result.error]);

  return result;
}

/**
 * Hook for fetching a single delivery by ID
 */
export function useDelivery(
  id: number | string | undefined,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options || {};

  const result = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => getDeliveryById(id!),
    enabled: enabled && !!id,
    retry: 2,
    refetchOnWindowFocus: false,
    staleTime: 10000,
  });

  useEffect(() => {
    if (result.isError) {
      const errorMessage = result.error instanceof Error ? result.error.message : "Une erreur est survenue";
      toast.error("Erreur lors du chargement de la livraison", { description: errorMessage });
    }
  }, [result.isError, result.error]);

  return result;
}

/**
 * Hook for creating a new delivery
 */
export function useCreateDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDeliveryRequest) => createDelivery(data),
    onSuccess: () => {
      // Invalidate deliveries queries to refetch
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      toast.success("Livraison créée avec succès");
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : "Une erreur est survenue";
      toast.error("Erreur lors de la création de la livraison", {
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook for updating a delivery
 */
export function useUpdateDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number | string;
      data: UpdateDeliveryRequest;
    }) => updateDelivery(id, data),
    onSuccess: (_, variables) => {
      // Invalidate specific delivery and list queries
      queryClient.invalidateQueries({ queryKey: ["delivery", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      toast.success("Livraison mise à jour avec succès");
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : "Une erreur est survenue";
      toast.error("Erreur lors de la mise à jour de la livraison", {
        description: errorMessage,
      });
    },
  });
}
