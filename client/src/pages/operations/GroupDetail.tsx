/**
 * Group Detail Page
 * Display stats, deliveries, and CRUD operations for a specific group
 */

import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  CheckCircle,
  XCircle,
  Clock,
  ShoppingBag,
  Truck,
  Wallet,
  Receipt,
  HandCoins,
  Calendar,
  RefreshCw,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  ArrowLeft,
  CircleAlert,
  FileText,
  Minus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApiError } from "@/types/api";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import { getGroupById } from "@/services/groups";
import { getDailyStats } from "@/services/stats";
import { API_ENDPOINTS } from "@/lib/api-config";
import { postGroupPdfBlob, type ReportStockLine } from "@/services/reports";
import { getDeliveries, type GetDeliveriesParams, type CreateDeliveryRequest, updateDelivery } from "@/services/deliveries";
import { apiDelete } from "@/services/api";
import { searchDeliveries } from "@/services/search";
import { DeliveryForm } from "@/components/deliveries/DeliveryForm";
import { calculateStatsFromDeliveries } from "@/lib/stats-utils";
import { getDateRangeLocal, getDateRangeForPreset, type DateRange } from "@/lib/date-utils";
import { useDateRefresh } from "@/hooks/useDateRefresh";
import { mapStatusToBackend, type StatutLivraison } from "@/lib/data-transform";
import { toast } from "sonner";
import type { FrontendDelivery } from "@/types/delivery";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { getExpeditionStats } from "@/services/expeditions";

const formatCurrency = (value: number | undefined | null) => {
  // Handle NaN, undefined, null, or invalid numbers
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR").format(numValue) + " F";
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type ApiErr = Error & { data?: { message?: string }; statusCode?: number; status?: number };

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groupId = id ? parseInt(id) : null;
  const { isSuperAdmin } = useAuth();

  const [period, setPeriod] = useState<"jour" | "semaine" | "mois">("jour");
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangeForPreset("today"));
  useDateRefresh(setDateRange);
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [quartierFilter, setQuartierFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<FrontendDelivery | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [pdfModalAction, setPdfModalAction] = useState<"preview" | "download" | null>(null);
  const [stockRows, setStockRows] = useState<{ name: string; quantity: string }[]>([
    { name: "", quantity: "" },
  ]);
  const [lastReportStock, setLastReportStock] = useState<ReportStockLine[]>([]);
  const [isFeeConfirmOpen, setIsFeeConfirmOpen] = useState(false);
  const [pendingFee, setPendingFee] = useState<{ delivery: FrontendDelivery; fee: number } | null>(null);

  const limit = 20;
  const feeShortcuts = [500, 1000, 1500, 2000, 2500, 3000];

  // Fetch group info avec meilleure gestion d'erreur
  const {
    data: group,
    isLoading: isLoadingGroup,
    isError: isErrorGroup,
    error: groupError,
    refetch: refetchGroup,
  } = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => getGroupById(groupId!),
    enabled: !!groupId,
    retry: false, // Ne pas retry sur 404/403
  });

  // Check if it's a single day (for daily stats)
  const isSingleDay = dateRange.startDate === dateRange.endDate;

  // Fetch stats for day view (with group_id filter)
  const {
    data: dailyStats,
    isLoading: isLoadingDailyStats,
    isError: isErrorDailyStats,
    error: dailyStatsError,
    refetch: refetchDailyStats,
  } = useQuery({
    queryKey: ["dailyStats", dateRange.startDate, groupId],
    queryFn: () => getDailyStats(dateRange.startDate, groupId),
    enabled: isSingleDay && !!groupId && !!group, // Attendre que le groupe soit chargé
    retry: (failureCount, error: ApiErr) => {
      // Ne pas retry sur les erreurs 4xx
      const statusCode = error?.statusCode || error?.status;
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  });

  // Fetch deliveries for all periods
  const {
    data: deliveriesData,
    isLoading: isLoadingDeliveries,
    isError: isErrorDeliveries,
    error: deliveriesError,
    refetch: refetchDeliveries,
  } = useQuery({
    queryKey: ["deliveries", "group", groupId, dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      getDeliveries({
        page: 1,
        limit: 1000,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        group_id: groupId!,
        sortBy: "created_at",
        sortOrder: "DESC",
      }),
    enabled: !!groupId && !!group, // Attendre que le groupe soit chargé
    retry: (failureCount, error: ApiErr) => {
      // Ne pas retry sur les erreurs 4xx
      const statusCode = error?.statusCode || error?.status;
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  });

  const { data: expeditionStats } = useQuery({
    queryKey: ["expeditions", "stats", "group-detail", groupId, dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      getExpeditionStats({
        group_id: groupId || undefined,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
    enabled: !!groupId,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Map frontend status to backend status
  const mapStatusFilter = (frontendStatus: string): string | undefined => {
    if (frontendStatus === "all") return undefined;
    const statusMap: Record<string, string> = {
      "en_cours": "pending",
      "livré": "delivered",
      "client_absent": "client_absent",
      "annulé": "failed",  // Changé de "échec": "failed"
      "renvoyé": "postponed",
      "pickup": "pickup",
      "expedition": "expedition",
    };
    return statusMap[frontendStatus];
  };

  // Fetch deliveries for search/table
  const apiParams: GetDeliveriesParams = useMemo(() => {
    const params: GetDeliveriesParams = {
      page,
      limit,
      sortBy: "created_at",
      sortOrder: "DESC",
      group_id: groupId!,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };

    const backendStatus = mapStatusFilter(statutFilter);
    if (backendStatus) {
      params.status = backendStatus;
    }

    if (search && /^[\d\s+-]+$/.test(search.trim())) {
      params.phone = search.trim();
    }

    return params;
  }, [page, statutFilter, search, groupId, dateRange.startDate, dateRange.endDate]);

  const {
    data: tableDeliveriesData,
    isLoading: isLoadingTableDeliveries,
    refetch: refetchTableDeliveries,
  } = useQuery({
    queryKey: ["deliveries", "group-table", apiParams],
    queryFn: () => {
      if (search && search.trim() && !/^[\d\s+-]+$/.test(search.trim())) {
        return searchDeliveries(search.trim()).then((results) => {
          // Filter by group_id client-side
          const filtered = results.filter((d) => d.group_id === groupId);
          return {
            deliveries: filtered,
            pagination: {
              page: 1,
              limit: filtered.length,
              total: filtered.length,
              totalPages: 1,
            },
          };
        });
      }
      return getDeliveries(apiParams);
    },
    enabled: !!groupId,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (isSingleDay) {
      const dayDeliveries = deliveriesData?.deliveries || [];
      const dayStats = calculateStatsFromDeliveries(dayDeliveries);

      if (dailyStats) {
        // For single day view:
        // - Use dailyStats for counts (from backend, more accurate)
        // - Use dayStats for amounts (calculated from deliveries with correct tariff logic)
        // - dayStats.montantEncaisse is already brut (amount_paid + delivery_fee for delivered)
        // - dayStats.montantRestant is already 0 for delivered deliveries
        // - dayStats.totalTarifs is sum of delivery_fee for delivered deliveries
        // - dayStats.montantNetEncaisse is montantEncaisse - totalTarifs (amount to reverse)
        return {
          totalLivraisons: dailyStats.totalLivraisons,
          livreesReussies: dailyStats.livreesReussies,
          echecs: dailyStats.echecs,
          enCours: dailyStats.enCours,
          pickups: dailyStats.pickups,
          expeditions: expeditionStats?.totalExpeditions || 0,
          montantEncaisse: Number(dayStats.montantEncaisse) || 0, // Brut amount (from deliveries calculation)
          montantRestant: Number(dayStats.montantRestant) || 0, // Remaining (0 for delivered)
          totalTarifs: Number(dayStats.totalTarifs) || 0, // Sum of delivery_fee for delivered
          chiffreAffaires: (Number(dayStats.totalTarifs) || 0) + (Number(expeditionStats?.totalFraisDeCourse) || 0),
          montantNetEncaisse: (Number(dayStats.montantNetEncaisse) || 0) - (Number(expeditionStats?.totalFraisDeCourse) || 0), // Net amount to reverse (montantEncaisse - totalTarifs - frais expéditions)
        };
      }
      // Fallback: use dayStats directly if dailyStats is not available
      const expeditionFrais = Number(expeditionStats?.totalFraisDeCourse) || 0;
      return {
        ...dayStats,
        expeditions: expeditionStats?.totalExpeditions || 0,
        chiffreAffaires: (Number(dayStats.totalTarifs) || 0) + expeditionFrais,
        montantNetEncaisse: (dayStats.montantNetEncaisse || (dayStats.montantEncaisse - (dayStats.totalTarifs || 0))) - expeditionFrais,
      };
    }

    // For non-single day (semaine/mois): use deliveries data directly
    if (deliveriesData) {
      const periodStats = calculateStatsFromDeliveries(deliveriesData.deliveries);
      const expeditionFrais = Number(expeditionStats?.totalFraisDeCourse) || 0;
      return {
        ...periodStats,
        expeditions: expeditionStats?.totalExpeditions || 0,
        chiffreAffaires: (Number(periodStats.totalTarifs) || 0) + expeditionFrais,
        montantNetEncaisse: (periodStats.montantNetEncaisse || 0) - expeditionFrais,
      };
    }

    return {
      totalLivraisons: 0,
      livreesReussies: 0,
      echecs: 0,
      enCours: 0,
      pickups: 0,
      expeditions: 0,
      montantEncaisse: 0,
      montantRestant: 0,
      chiffreAffaires: 0,
      totalTarifs: 0,
      montantNetEncaisse: 0,
    };
  }, [isSingleDay, dailyStats, deliveriesData, expeditionStats]);

  // Unique product names from deliveries in the current date range
  const suggestedProducts = useMemo(() => {
    const deliveries = deliveriesData?.deliveries ?? [];
    const seen = new Set<string>();
    deliveries.forEach((d) => {
      if (!d.produits) return;
      d.produits.split(/[,\n]+/).forEach((part) => {
        // Strip leading quantity (e.g. "3 " in "3 packs eau")
        const name = part.replace(/^\d+\s+/, "").trim();
        if (name) seen.add(name);
      });
    });
    return Array.from(seen);
  }, [deliveriesData]);

  // Get unique quartiers
  const availableQuartiers = useMemo(() => {
    if (!tableDeliveriesData?.deliveries) return [];
    const quartiersSet = new Set<string>();
    tableDeliveriesData.deliveries.forEach((d) => {
      if (d.quartier) quartiersSet.add(d.quartier);
    });
    return Array.from(quartiersSet).sort();
  }, [tableDeliveriesData]);

  // Filter deliveries client-side
  const filteredLivraisons = useMemo(() => {
    if (!tableDeliveriesData?.deliveries) return [];
    return tableDeliveriesData.deliveries.filter((l) => {
      const matchType = typeFilter === "all" || l.type === typeFilter;
      const matchQuartier = quartierFilter === "all" || l.quartier === quartierFilter;
      return matchType && matchQuartier;
    });
  }, [tableDeliveriesData, typeFilter, quartierFilter]);


  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateDeliveryRequest> }) =>
      updateDelivery(id, data),
    onSuccess: () => {
      // Invalidate all relevant queries to refresh stats everywhere
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group-table"] });
      setIsEditDialogOpen(false);
      setSelectedDelivery(null);
      toast.success("Livraison modifiée avec succès");
    },
    onError: (error: ApiErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la modification");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiDelete(API_ENDPOINTS.DELIVERY_BY_ID(id));
      if (!response.success) {
        throw new Error(response.message || response.error || "Erreur lors de la suppression");
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate all relevant queries to refresh stats everywhere
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group-table"] });
      setIsDeleteDialogOpen(false);
      setSelectedDelivery(null);
      toast.success("Livraison supprimée avec succès");
    },
    onError: (error: ApiErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la suppression");
    },
  });

  // Status update mutation (quick update from table)
  const statusUpdateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: StatutLivraison }) => {
      return updateDelivery(id, {
        status: mapStatusToBackend(status),
      });
    },
    onSuccess: async (updatedDelivery) => {
      // Log pour debug
      console.log("[Status Update] updatedDelivery reçu:", {
        id: updatedDelivery?.id,
        montant_total: updatedDelivery?.montant_total,
        montant_encaisse: updatedDelivery?.montant_encaisse,
        restant: updatedDelivery?.restant,
        statut: updatedDelivery?.statut,
      });

      // Vérifier que updatedDelivery est valide avant de mettre à jour le cache
      if (!updatedDelivery || !updatedDelivery.id) {
        console.error("Invalid updatedDelivery:", updatedDelivery);
        queryClient.invalidateQueries({ queryKey: ["deliveries", "group-table"] });
        await refetchTableDeliveries();
        toast.success("Statut mis à jour avec succès");
        return;
      }

      // Mettre à jour UNIQUEMENT la query "group-table" avec la clé exacte
      // Ne PAS invalider cette query pour éviter que le refetch écrase la mise à jour
      queryClient.setQueryData(
        ["deliveries", "group-table", apiParams],
        (old: { deliveries: FrontendDelivery[]; pagination: unknown } | undefined) => {
          if (!old || !old.deliveries) {
            console.warn("[Status Update] Old data structure invalid:", old);
            return old;
          }
          const updated = {
            ...old,
            deliveries: old.deliveries.map((d: FrontendDelivery) => 
              d.id === updatedDelivery.id ? updatedDelivery : d
            ),
          };
          console.log("[Status Update] Cache mis à jour pour group-table avec:", {
            totalLivraisons: updated.deliveries.length,
            livraisonUpdated: updated.deliveries.find(d => d.id === updatedDelivery.id),
          });
          return updated;
        }
      );
      
      // Invalider les autres queries pour refresh des stats (mais pas group-table)
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      
      // Refetch les autres queries (mais pas group-table car on l'a déjà mise à jour)
      try {
        await Promise.all([
          refetchDeliveries(),
          isSingleDay ? refetchDailyStats() : Promise.resolve(),
        ]);
        toast.success("Statut mis à jour avec succès");
      } catch (refetchError) {
        console.error("Error refetching after status update:", refetchError);
        toast.success("Statut mis à jour avec succès");
      }
    },
    onError: (error: ApiErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la mise à jour du statut");
    },
  });

  // Fee update mutation (quick update from table)
  const feeUpdateMutation = useMutation({
    mutationFn: async ({ id, fee }: { id: number; fee: number }) => {
      return updateDelivery(id, {
        delivery_fee: fee,
      });
    },
    onSuccess: async (updatedDelivery) => {
      if (!updatedDelivery || !updatedDelivery.id) {
        console.error("Invalid updatedDelivery:", updatedDelivery);
        queryClient.invalidateQueries({ queryKey: ["deliveries", "group-table"] });
        await refetchTableDeliveries();
        toast.error("Erreur lors de la mise à jour des frais de livraison");
        return;
      }

      // Mettre à jour UNIQUEMENT la query "group-table" avec la clé exacte
      queryClient.setQueryData(
        ["deliveries", "group-table", apiParams],
        (old: { deliveries: FrontendDelivery[]; pagination: unknown } | undefined) => {
          if (!old || !old.deliveries) return old;
          return {
            ...old,
            deliveries: old.deliveries.map((d: FrontendDelivery) =>
              d.id === updatedDelivery.id ? updatedDelivery : d
            ),
          };
        }
      );

      // Invalider les autres queries pour refresh des stats (mais pas group-table)
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });

      // Refetch les autres queries (mais pas group-table car on l'a déjà mise à jour)
      try {
        await Promise.all([
          refetchDeliveries(),
          isSingleDay ? refetchDailyStats() : Promise.resolve(),
        ]);
        toast.success("Frais de livraison mis à jour");
      } catch (refetchError) {
        console.error("Error refetching after fee update:", refetchError);
        toast.success("Frais de livraison mis à jour");
      }
    },
    onError: (error: ApiErr) => {
      toast.error(
        error?.data?.message || error?.message || "Erreur lors de la mise à jour des frais"
      );
    },
  });

  const handleEdit = (delivery: FrontendDelivery) => {
    setSelectedDelivery(delivery);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (delivery: FrontendDelivery) => {
    setSelectedDelivery(delivery);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedDelivery) {
      deleteMutation.mutate(selectedDelivery.id);
    }
  };

  const isLoading =
    isSingleDay
      ? isLoadingDailyStats || isLoadingDeliveries
      : isLoadingDeliveries;
  const isError = isSingleDay ? isErrorDailyStats : isErrorDeliveries;
  const error = isSingleDay ? dailyStatsError : deliveriesError;
  const refetch = isSingleDay ? refetchDailyStats : refetchDeliveries;

  const periodLabels = {
    jour: "Aujourd'hui",
    semaine: "Cette semaine",
    mois: "Ce mois",
  };

  if (isLoadingGroup) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isErrorGroup && groupId) {
    return (
      <AppErrorExperience
        error={groupError}
        onRetry={() => void refetchGroup()}
        onBack={() => navigate("/groupes")}
      />
    );
  }

  if (!isLoadingGroup && !group && groupId) {
    return (
      <AppErrorExperience
        error={new ApiError(
          "Le prestataire demandé n'existe pas ou vous n'avez pas accès.",
          404
        )}
        onBack={() => navigate("/groupes")}
      />
    );
  }

  const parseStockRowsForApi = (): ReportStockLine[] => {
    return stockRows
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        name: r.name.trim(),
        quantity: Math.max(0, parseInt(String(r.quantity).replace(/\D/g, ""), 10) || 0),
        subtitle: null,
      }));
  };

  const openPdfStockModal = (action: "preview" | "download") => {
    if (!groupId) return;
    setPdfModalAction(action);
    setStockRows(
      lastReportStock.length > 0
        ? lastReportStock.map((s) => ({ name: s.name, quantity: String(s.quantity) }))
        : [{ name: "", quantity: "" }]
    );
    setIsStockModalOpen(true);
  };

  const handleConfirmPdfStockModal = async () => {
    if (!groupId || !pdfModalAction) return;
    const action = pdfModalAction;
    const stock = parseStockRowsForApi();
    setIsLoadingPdf(true);
    try {
      const { blob, filename } = await postGroupPdfBlob(groupId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        stock,
      });
      setLastReportStock(stock);
      setIsStockModalOpen(false);
      setPdfModalAction(null);
      if (action === "preview") {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl(URL.createObjectURL(blob));
        setIsPdfPreviewOpen(true);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || `rapport-${group?.name?.replace(/[^\w.-]+/g, "_") || "prestataire"}.pdf`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Téléchargement lancé");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de générer le rapport PDF");
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleDownloadPdfFromPreview = async () => {
    if (!groupId) return;
    setIsLoadingPdf(true);
    try {
      const { blob, filename } = await postGroupPdfBlob(groupId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        stock: lastReportStock,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `rapport-${group?.name?.replace(/[^\w.-]+/g, "_") || "prestataire"}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Téléchargement lancé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de télécharger le PDF");
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleClosePdfPreview = () => {
    setIsPdfPreviewOpen(false);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{group.name}</h1>
            <p className="text-muted-foreground">
              Vue d'ensemble des livraisons du prestataire
              {dateRange.startDate === dateRange.endDate ? (
                <span className="ml-2">— {dateRange.startDate}</span>
              ) : (
                <span className="ml-2">— {dateRange.startDate} au {dateRange.endDate}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/groupes")}>
              <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Retour aux prestataires</span>
              <span className="sm:hidden">Retour</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPdfStockModal("preview")}
              disabled={isLoadingPdf}
              className="gap-1 sm:gap-2"
            >
              {isLoadingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Prévisualiser</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => openPdfStockModal("download")}
              disabled={isLoadingPdf}
              className="gap-1 sm:gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Télécharger</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-col gap-4">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={(v) => {
        setPeriod(v as typeof period);
        // Update dateRange when period changes
        const newDateRange = getDateRangeLocal(v as typeof period);
        setDateRange(newDateRange);
      }} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="jour" className="gap-2">
            <Calendar className="w-4 h-4" />
            Jour
          </TabsTrigger>
          <TabsTrigger value="semaine" className="gap-2">
            <Calendar className="w-4 h-4" />
            Semaine
          </TabsTrigger>
          <TabsTrigger value="mois" className="gap-2">
            <Calendar className="w-4 h-4" />
            Mois
          </TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="mt-6 space-y-6">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="stat-card">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {isError && !isLoading && (
            <AppErrorExperience error={error} onRetry={() => void refetch()} />
          )}

          {/* Content */}
          {!isLoading && !isError && stats && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard title="Total livraisons" value={stats.totalLivraisons} icon={Package} />
                <StatCard
                  title="Livrées"
                  value={stats.livreesReussies}
                  icon={CheckCircle}
                  variant="success"
                />
                <StatCard
                  title="Annulés"
                  value={stats.echecs}
                  icon={XCircle}
                  variant="destructive"
                />
                <StatCard title="En cours" value={stats.enCours} icon={Clock} variant="warning" />
                <StatCard
                  title="Au bureau"
                  value={stats.pickups}
                  icon={ShoppingBag}
                  variant="info"
                />
                <StatCard
                  title="Expéditions"
                  value={stats.expeditions}
                  icon={Truck}
                  variant="expedition"
                />
                <StatCard
                  title="Montant collecté"
                  value={formatCurrency(stats.montantEncaisse)}
                  icon={Wallet}
                  variant="success"
                />
                {isSuperAdmin ? (
                  <StatCard
                    title="Montant à collecter"
                    value={formatCurrency(stats.montantRestant || 0)}
                    icon={Wallet}
                    variant="warning"
                  />
                ) : null}
                <StatCard
                  title="Frais de livraison"
                  value={formatCurrency(stats.totalTarifs || 0)}
                  icon={Receipt}
                  variant="info"
                />
                <StatCard
                  title={(stats.montantNetEncaisse || 0) < 0 ? "Dette groupe" : "Partenaire"}
                  value={formatCurrency(Math.abs(stats.montantNetEncaisse || 0))}
                  icon={HandCoins}
                  variant={(stats.montantNetEncaisse || 0) < 0 ? "destructive" : "success"}
                />
              </div>

              <div className="stat-card">
                <h3 className="text-sm font-semibold mb-3">Expéditions (période)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard
                    title="Total expéditions"
                    value={expeditionStats?.totalExpeditions || 0}
                    icon={Truck}
                    variant="expedition"
                  />
                  <StatCard
                    title="Frais de course"
                    value={formatCurrency(expeditionStats?.totalFraisDeCourse || 0)}
                    icon={Wallet}
                    variant="success"
                  />
                  <StatCard
                    title="Frais agence voyage"
                    value={formatCurrency(expeditionStats?.totalFraisDeLAgenceDeVoyage || 0)}
                    icon={Receipt}
                    variant="warning"
                  />
                </div>
              </div>

              {/* Search and Filters */}
              <div className="stat-card">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par téléphone, produit ou quartier..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Select
                      value={statutFilter}
                      onValueChange={(value) => {
                        setStatutFilter(value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Statut" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous statuts</SelectItem>
                        <SelectItem value="en_cours">En cours</SelectItem>
                        <SelectItem value="livré">Livré</SelectItem>
                        <SelectItem value="client_absent">Client absent</SelectItem>
                        <SelectItem value="annulé">Annulé</SelectItem>
                        <SelectItem value="renvoyé">Renvoyé</SelectItem>
                        <SelectItem value="pickup">Au bureau</SelectItem>
                        <SelectItem value="expedition">Expédition</SelectItem>
                        <SelectItem value="injoignable">Injoignable</SelectItem>
                        <SelectItem value="ne_decroche_pas">Ne décroche pas</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={typeFilter}
                      onValueChange={(value) => {
                        setTypeFilter(value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous types</SelectItem>
                        <SelectItem value="livraison">Livraison</SelectItem>
                        <SelectItem value="pickup">Pickup</SelectItem>
                        <SelectItem value="expedition">Expédition</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={quartierFilter}
                      onValueChange={(value) => {
                        setQuartierFilter(value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Quartier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous quartiers</SelectItem>
                        {availableQuartiers.map((q) => (
                          <SelectItem key={q} value={q}>
                            {q}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Deliveries Table */}
              <div className="stat-card overflow-hidden p-0">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-semibold">Livraisons</h3>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nouvelle livraison
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Téléphone</TableHead>
                        <TableHead className="font-semibold hidden lg:table-cell">Quartier</TableHead>
                        <TableHead className="font-semibold text-right">Montant</TableHead>
                        <TableHead className="font-semibold text-right hidden sm:table-cell">
                          Encaissé
                        </TableHead>
                        <TableHead className="font-semibold text-right hidden sm:table-cell">
                          Reste
                        </TableHead>
                        <TableHead className="font-semibold">Statut</TableHead>
                        <TableHead className="font-semibold">Frais livr.</TableHead>
                        <TableHead className="font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingTableDeliveries ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Skeleton className="h-4 w-20" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="h-4 w-16 ml-auto" />
                            </TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              <Skeleton className="h-4 w-16 ml-auto" />
                            </TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              <Skeleton className="h-4 w-16 ml-auto" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-6 w-20" />
                            </TableCell>
                          <TableCell>
                            <Skeleton className="h-8 w-28" />
                          </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="h-8 w-8 ml-auto" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : filteredLivraisons.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                            Aucune livraison trouvée
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLivraisons.map((livraison) => (
                          <TableRow
                            key={livraison.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleEdit(livraison)}
                          >
                            <TableCell className="font-medium">{livraison.telephone}</TableCell>
                            <TableCell className="hidden lg:table-cell">{livraison.quartier}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(livraison.montant_total)}
                            </TableCell>
                            <TableCell className="text-right text-success hidden sm:table-cell">
                              {formatCurrency(livraison.montant_encaisse)}
                            </TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              {livraison.restant > 0 ? (
                                <span className="text-warning font-medium">
                                  {formatCurrency(livraison.restant)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="overflow-visible align-middle pt-1">
                              <div
                                className="relative inline-block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {livraison.tarif_non_applique ? (
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="absolute -left-2 -top-2 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-card text-red-600 shadow-sm outline-none hover:bg-muted/90 focus-visible:ring-2 focus-visible:ring-ring dark:text-red-400"
                                        aria-label="Frais de livraison non appliqués — voir l'info-bulle"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <CircleAlert className="size-3.5" strokeWidth={2.25} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" align="start" className="max-w-xs text-left">
                                      <p className="font-medium text-foreground">Frais de livraison non appliqués</p>
                                      <p className="mt-1 text-muted-foreground">
                                        Le tarif du quartier n&apos;a pas été appliqué automatiquement à cette livraison.
                                        Vérifiez les tarifs ou saisissez les frais à la main si besoin.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}
                                <Select
                                  value={livraison.statut}
                                  onValueChange={(value) => {
                                    if (value !== livraison.statut) {
                                      statusUpdateMutation.mutate({
                                        id: livraison.id,
                                        status: value as StatutLivraison,
                                      });
                                    }
                                  }}
                                  disabled={statusUpdateMutation.isPending}
                                >
                                  <SelectTrigger className="w-[140px] h-8 border-none shadow-none hover:bg-muted/50 p-1">
                                    <SelectValue>
                                      <StatusBadge statut={livraison.statut} />
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="en_cours">En cours</SelectItem>
                                    <SelectItem value="livré">Livré</SelectItem>
                                    <SelectItem value="client_absent">Client absent</SelectItem>
                                    <SelectItem value="annulé">Annulé</SelectItem>
                                    <SelectItem value="renvoyé">Renvoyé</SelectItem>
                                    <SelectItem value="pickup">Au bureau</SelectItem>
                                    <SelectItem value="expedition">Expédition</SelectItem>
                                    <SelectItem value="injoignable">Injoignable</SelectItem>
                                    <SelectItem value="ne_decroche_pas">Ne décroche pas</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div
                                className="flex flex-wrap items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {feeShortcuts.map((fee) => (
                                  <Button
                                    key={fee}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 py-0 text-xs"
                                    disabled={feeUpdateMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingFee({ delivery: livraison, fee });
                                      setIsFeeConfirmOpen(true);
                                    }}
                                  >
                                    {fee} F
                                  </Button>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 py-0 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(livraison);
                                  }}
                                >
                                  Personnaliser
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => navigate(`/livraisons/${livraison.id}`)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEdit(livraison)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDelete(livraison)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Pagination */}
              {!isLoadingTableDeliveries &&
                tableDeliveriesData &&
                tableDeliveriesData.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Affichage de {(page - 1) * limit + 1} à{" "}
                      {Math.min(page * limit, tableDeliveriesData.pagination.total)} sur{" "}
                      {tableDeliveriesData.pagination.total} livraison(s)
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Précédent
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPage((p) =>
                            Math.min(tableDeliveriesData.pagination.totalPages, p + 1)
                          )
                        }
                        disabled={page >= tableDeliveriesData.pagination.totalPages}
                      >
                        Suivant
                      </Button>
                    </div>
                  </div>
                )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle livraison</DialogTitle>
            <DialogDescription>
              Créez une nouvelle livraison pour le prestataire "{group.name}"
            </DialogDescription>
          </DialogHeader>
          <DeliveryForm
            delivery={undefined}
            groupId={groupId!}
            onSuccess={async () => {
              setIsCreateDialogOpen(false);
              toast.success("Livraison créée avec succès");
              
              // Petit délai pour s'assurer que le backend a bien enregistré
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // Invalider toutes les queries pertinentes (sans exact pour matcher toutes les variantes)
              queryClient.invalidateQueries({ queryKey: ["deliveries"] });
              queryClient.invalidateQueries({ queryKey: ["deliveries", "group"] });
              queryClient.invalidateQueries({ queryKey: ["deliveries", "group-table"] });
              queryClient.invalidateQueries({ queryKey: ["deliveries", "dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["deliveries", "reports"] });
              queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
              
              // Refetch explicite de toutes les queries concernées
              try {
                await Promise.all([
                  refetchTableDeliveries(),
                  refetchDeliveries(),
                  isSingleDay ? refetchDailyStats() : Promise.resolve(),
                ]);
              } catch (error) {
                console.error("Error refetching after creation:", error);
                // Même en cas d'erreur, les queries seront invalidées et rechargées au prochain accès
              }
            }}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>Modifier la livraison</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la livraison
            </DialogDescription>
          </DialogHeader>
          {selectedDelivery && (
            <DeliveryForm
              delivery={selectedDelivery}
              onSuccess={() => {
                setIsEditDialogOpen(false);
                setSelectedDelivery(null);
                refetchTableDeliveries();
              }}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setSelectedDelivery(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la livraison</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette livraison ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stock modal */}
      <Dialog
        open={isStockModalOpen}
        onOpenChange={(open) => {
          if (!open && !isLoadingPdf) {
            setIsStockModalOpen(false);
            setPdfModalAction(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock au moment du rapport</DialogTitle>
            <DialogDescription>
              Sélectionnez les produits livrés ce jour et indiquez les quantités restantes.
            </DialogDescription>
          </DialogHeader>
          {suggestedProducts.length > 0 && (
            <div className="space-y-1.5 pb-1">
              <p className="text-xs text-muted-foreground font-medium">Produits du jour</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedProducts.map((product) => {
                  const alreadyAdded = stockRows.some(
                    (r) => r.name.trim().toLowerCase() === product.toLowerCase()
                  );
                  return (
                    <button
                      key={product}
                      type="button"
                      onClick={() => {
                        if (alreadyAdded) return;
                        // Fill first empty row, or append a new one
                        const emptyIdx = stockRows.findIndex((r) => r.name.trim() === "");
                        if (emptyIdx !== -1) {
                          const next = [...stockRows];
                          next[emptyIdx] = { ...next[emptyIdx], name: product };
                          setStockRows(next);
                        } else {
                          setStockRows((rows) => [...rows, { name: product, quantity: "" }]);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        alreadyAdded
                          ? "bg-primary text-primary-foreground border-primary cursor-default"
                          : "bg-background border-border hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      }`}
                    >
                      {product}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-2 py-2">
            {stockRows.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`stock-name-${index}`}>Produit</Label>
                  <Input
                    id={`stock-name-${index}`}
                    value={row.name}
                    onChange={(e) => {
                      const next = [...stockRows];
                      next[index] = { ...next[index], name: e.target.value };
                      setStockRows(next);
                    }}
                    placeholder="Ex: Pack eau 1,5L"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor={`stock-qty-${index}`}>Qté</Label>
                  <Input
                    id={`stock-qty-${index}`}
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = [...stockRows];
                      next[index] = { ...next[index], quantity: e.target.value };
                      setStockRows(next);
                    }}
                    placeholder="0"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground mb-0.5"
                  disabled={stockRows.length <= 1}
                  onClick={() => setStockRows((rows) => rows.filter((_, i) => i !== index))}
                  aria-label="Retirer la ligne"
                >
                  <Minus className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setStockRows((rows) => [...rows, { name: "", quantity: "" }])}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une ligne
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsStockModalOpen(false); setPdfModalAction(null); }}
              disabled={isLoadingPdf}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmPdfStockModal()}
              disabled={isLoadingPdf}
              className="gap-2"
            >
              {isLoadingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              {pdfModalAction === "download" ? "Télécharger" : "Prévisualiser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee Confirmation Dialog */}
      <AlertDialog open={isFeeConfirmOpen} onOpenChange={setIsFeeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer les frais de livraison</AlertDialogTitle>
            <AlertDialogDescription>
              Appliquer <strong>{pendingFee?.fee} F</strong> comme frais de livraison pour{" "}
              <strong>{pendingFee?.delivery.customer_name || pendingFee?.delivery.telephone}</strong> ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingFee) {
                  feeUpdateMutation.mutate({ id: pendingFee.delivery.id, fee: pendingFee.fee });
                }
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview Dialog */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={(open) => { if (!open) handleClosePdfPreview(); }}>
        <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Rapport — {group?.name}</DialogTitle>
                <DialogDescription>
                  {dateRange.startDate === dateRange.endDate
                    ? dateRange.startDate
                    : `${dateRange.startDate} — ${dateRange.endDate}`}
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 mr-8"
                onClick={() => void handleDownloadPdfFromPreview()}
                disabled={isLoadingPdf}
              >
                {isLoadingPdf ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Télécharger
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 px-6 pb-6 min-h-0">
            {pdfPreviewUrl ? (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full rounded-lg border"
                title="Aperçu du rapport PDF"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

