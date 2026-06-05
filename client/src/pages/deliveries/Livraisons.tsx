import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mapStatusToBackend, type StatutLivraison, type TypeLivraison } from "@/lib/data-transform";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Eye,
  Edit,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Trash2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  X,
  Rows3,
  CircleAlert,
} from "lucide-react";
import { getDeliveries, updateDelivery, type GetDeliveriesParams, type GetDeliveriesResponse } from "@/services/deliveries";
import { searchDeliveries } from "@/services/search";
import { getGroups } from "@/services/groups";
import { toast } from "sonner";
import { getDateRangeForPreset, type DateRange } from "@/lib/date-utils";
import { useDateRefresh } from "@/hooks/useDateRefresh";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DeliveryForm } from "@/components/deliveries/DeliveryForm";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { apiDelete } from "@/services/api";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { FrontendDelivery } from "@/types/delivery";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number | undefined | null) => {
  // Handle NaN, undefined, null, or invalid numbers
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat('fr-FR').format(numValue) + " F";
};

const typeLabels: Record<TypeLivraison, string> = {
  livraison: "Livraison",
  pickup: "Pickup",
  expedition: "Expédition"
};

const TABLE_DENSITY_STORAGE_KEY = "livraisons-table-density";

type TableDensity = "cozy" | "compact";

function readStoredDensity(): TableDensity {
  try {
    const v = localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (v === "compact" || v === "cozy") return v;
  } catch {
    /* ignore */
  }
  return "cozy";
}

/** Backend `sortBy` values supported by GET /deliveries */
type SortableField =
  | "created_at"
  | "phone"
  | "amount_due"
  | "amount_paid"
  | "group_id";

const statutFilterLabels: Record<string, string> = {
  all: "Tous statuts",
  en_cours: "En cours",
  livré: "Livré",
  client_absent: "Client absent",
  annulé: "Annulé",
  renvoyé: "Renvoyé",
  pickup: "Au bureau",
  expedition: "Expédition",
  injoignable: "Injoignable",
  ne_decroche_pas: "Ne décroche pas",
};

function formatRangePillLabel(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return `${new Date(start).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – ${new Date(end).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function compareDeliveriesForSort(
  a: FrontendDelivery,
  b: FrontendDelivery,
  field: SortableField,
  order: "ASC" | "DESC",
  getGroupLabel?: (d: FrontendDelivery) => string
): number {
  let cmp = 0;
  switch (field) {
    case "group_id": {
      const na = getGroupLabel?.(a) ?? "";
      const nb = getGroupLabel?.(b) ?? "";
      cmp = na.localeCompare(nb, "fr", { sensitivity: "base", numeric: true });
      break;
    }
    case "phone":
      cmp = a.telephone.localeCompare(b.telephone, "fr", { numeric: true });
      break;
    case "amount_due":
      cmp = a.montant_total - b.montant_total;
      break;
    case "amount_paid":
      cmp = a.montant_encaisse - b.montant_encaisse;
      break;
    case "created_at":
      cmp = new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime();
      break;
    default:
      break;
  }
  return order === "ASC" ? cmp : -cmp;
}

function SortableTh({
  field,
  label,
  currentField,
  order,
  onSort,
  align = "left",
  className,
}: {
  field: SortableField;
  label: string;
  currentField: SortableField;
  order: "ASC" | "DESC";
  onSort: (f: SortableField) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = currentField === field;
  return (
    <TableHead
      className={cn(
        "whitespace-nowrap bg-muted/95 backdrop-blur-md supports-[backdrop-filter]:bg-muted/85",
        align === "right" && "text-right",
        className
      )}
      aria-sort={active ? (order === "ASC" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1.5 -mx-2 px-2 py-1 rounded-md font-semibold text-foreground hover:text-primary hover:bg-muted/90 transition-colors",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        {active ? (
          order === "ASC" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

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

type MutErr = Error & { data?: { message?: string } };

const Livraisons = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangeForPreset("today"));
  useDateRefresh(setDateRange);
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [quartierFilter, setQuartierFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortableField>("created_at");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [density, setDensity] = useState<TableDensity>(() =>
    typeof window !== "undefined" ? readStoredDensity() : "cozy"
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<FrontendDelivery | null>(null);
  const limit = 20;

  // Fetch groups for filter dropdown
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
  });

  // Create a map of group_id to group_name for quick lookup
  const groupMap = useMemo(() => {
    const map = new Map<number, string>();
    groups.forEach((group) => {
      if (group.id) {
        map.set(group.id, group.name);
      }
    });
    return map;
  }, [groups]);

  // Build API params
  const apiParams: GetDeliveriesParams = useMemo(() => {
    const params: GetDeliveriesParams = {
      page,
      limit,
      sortBy: sortField,
      sortOrder,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };

    // Map status filter
    const backendStatus = mapStatusFilter(statutFilter);
    if (backendStatus) {
      params.status = backendStatus;
    }

    // Group filter
    if (groupFilter !== "all") {
      params.group_id = parseInt(groupFilter);
    }

    // If search is provided and it looks like a phone number, use phone filter
    // Otherwise, we'll use search API
    if (search && /^[\d\s+-]+$/.test(search.trim())) {
      params.phone = search.trim();
    }

    return params;
  }, [page, statutFilter, search, groupFilter, dateRange.startDate, dateRange.endDate, sortField, sortOrder]);

  // Fetch deliveries
  const { 
    data: deliveriesData, 
    isLoading, 
    isError, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['deliveries', apiParams, dateRange.startDate, dateRange.endDate],
    queryFn: () => {
      // If search is provided and not a phone number, use search API
      if (search && search.trim() && !/^[\d\s+-]+$/.test(search.trim())) {
        return searchDeliveries(search.trim()).then(results => ({
          deliveries: results,
          pagination: {
            page: 1,
            limit: results.length,
            total: results.length,
            totalPages: 1,
          },
        }));
      }
      return getDeliveries(apiParams);
    },
    retry: 2,
    refetchOnWindowFocus: false,
    onError: (error) => {
      toast.error('Erreur lors du chargement des livraisons', {
        description: error instanceof Error ? error.message : 'Une erreur est survenue'
      });
    }
  });

  // Get unique quartiers from deliveries for filter dropdown
  const availableQuartiers = useMemo(() => {
    if (!deliveriesData?.deliveries) return [];
    const quartiersSet = new Set<string>();
    deliveriesData.deliveries.forEach(d => {
      if (d.quartier) quartiersSet.add(d.quartier);
    });
    return Array.from(quartiersSet).sort();
  }, [deliveriesData]);

  const isTextSearch =
    Boolean(search.trim()) && !/^[\d\s+-]+$/.test(search.trim());

  // Filter client-side for type and quartier; full-text search results are sorted locally
  const filteredLivraisons = useMemo(() => {
    if (!deliveriesData?.deliveries) return [];

    let rows = deliveriesData.deliveries.filter((l) => {
      const matchType = typeFilter === "all" || l.type === typeFilter;
      const matchQuartier = quartierFilter === "all" || l.quartier === quartierFilter;
      return matchType && matchQuartier;
    });

    if (isTextSearch) {
      const groupLabel = (d: FrontendDelivery) =>
        d.group_id != null && groupMap.has(d.group_id)
          ? groupMap.get(d.group_id)!
          : "";
      rows = [...rows].sort((a, b) =>
        compareDeliveriesForSort(a, b, sortField, sortOrder, groupLabel)
      );
    }

    return rows;
  }, [deliveriesData, typeFilter, quartierFilter, isTextSearch, sortField, sortOrder, groupMap]);

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setPage(1);
  };

  const handleSort = (field: SortableField) => {
    setPage(1);
    if (sortField === field) {
      setSortOrder((prev) => (prev === "DESC" ? "ASC" : "DESC"));
    } else {
      setSortField(field);
      setSortOrder(
        field === "phone" || field === "group_id" ? "ASC" : "DESC"
      );
    }
  };

  const todayRangeDefault = getDateRangeForPreset("today");
  const isNotDefaultDateRange =
    dateRange.startDate !== todayRangeDefault.startDate ||
    dateRange.endDate !== todayRangeDefault.endDate;

  const removableFilterCount =
    (statutFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (quartierFilter !== "all" ? 1 : 0) +
    (groupFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (isNotDefaultDateRange ? 1 : 0);

  const statusUpdateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: StatutLivraison }) => {
      return updateDelivery(id, {
        status: mapStatusToBackend(status),
      });
    },
    onSuccess: (updatedDelivery) => {
      queryClient.setQueriesData<GetDeliveriesResponse>(
        { queryKey: ["deliveries"] },
        (old) => {
          if (!old?.deliveries) return old;
          return {
            ...old,
            deliveries: old.deliveries.map((d) =>
              d.id === updatedDelivery.id ? updatedDelivery : d
            ),
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group-table"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "group"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      toast.success("Statut mis à jour avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la mise à jour du statut");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiDelete(API_ENDPOINTS.DELIVERY_BY_ID(id));
      if (!response.success) {
        throw new Error(response.message || response.error || "Erreur lors de la suppression");
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["delivery"] });
      queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
      setIsDeleteDialogOpen(false);
      setSelectedDelivery(null);
      toast.success("Livraison supprimée avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la suppression");
    },
  });

  // Handlers
  const handleCreate = () => {
    setIsCreateDialogOpen(true);
  };

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

  const refetchDeliveries = () => {
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Livraisons</h1>
          <p className="text-muted-foreground text-sm">Gérez toutes vos livraisons</p>
        </div>
        <Button className="gap-2" onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          Nouvelle livraison
        </Button>
      </div>

      {/* Date range + high-density search + filter pills */}
      <div className="stat-card !p-3 sm:!p-4">
        <div className="flex flex-col gap-2.5">
          <DateRangePicker
            value={dateRange}
            onChange={(next) => {
              setDateRange(next);
              handleFilterChange();
            }}
            className="gap-2"
          />
          <div className="flex flex-col gap-2 border-t border-border/70 pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[min(100%,220px)] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Recherche téléphone, produit, quartier…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    handleFilterChange();
                  }}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 border-dashed"
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                    Filtres
                    {removableFilterCount > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                        {removableFilterCount}
                      </Badge>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(calc(100vw-2rem),320px)] space-y-3 p-3" align="start">
                  <p className="text-sm font-medium leading-none">Affiner la liste</p>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Statut</Label>
                    <Select
                      value={statutFilter}
                      onValueChange={(value) => {
                        setStatutFilter(value);
                        handleFilterChange();
                      }}
                    >
                      <SelectTrigger className="h-9 w-full">
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
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Select
                      value={typeFilter}
                      onValueChange={(value) => {
                        setTypeFilter(value);
                        handleFilterChange();
                      }}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous types</SelectItem>
                        <SelectItem value="livraison">Livraison</SelectItem>
                        <SelectItem value="pickup">Pickup</SelectItem>
                        <SelectItem value="expedition">Expédition</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Quartier</Label>
                    <Select
                      value={quartierFilter}
                      onValueChange={(value) => {
                        setQuartierFilter(value);
                        handleFilterChange();
                      }}
                    >
                      <SelectTrigger className="h-9 w-full">
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
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Prestataire</Label>
                    <Select
                      value={groupFilter}
                      onValueChange={(value) => {
                        setGroupFilter(value);
                        handleFilterChange();
                      }}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Prestataire" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les prestataires</SelectItem>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {removableFilterCount > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full text-muted-foreground"
                      onClick={() => {
                        setStatutFilter("all");
                        setTypeFilter("all");
                        setQuartierFilter("all");
                        setGroupFilter("all");
                        setSearch("");
                        setDateRange(getDateRangeForPreset("today"));
                        handleFilterChange();
                        setFilterPopoverOpen(false);
                      }}
                    >
                      Réinitialiser tout
                    </Button>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>
            {removableFilterCount > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {isNotDefaultDateRange ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="truncate">
                      Période · {formatRangePillLabel(dateRange.startDate, dateRange.endDate)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full"
                      aria-label="Réinitialiser la période"
                      onClick={() => {
                        setDateRange(getDateRangeForPreset("today"));
                        handleFilterChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
                {search.trim() ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="max-w-[180px] truncate">« {search.trim()} »</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full"
                      aria-label="Effacer la recherche"
                      onClick={() => {
                        setSearch("");
                        handleFilterChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
                {statutFilter !== "all" ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="truncate">{statutFilterLabels[statutFilter] ?? statutFilter}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full"
                      aria-label="Retirer le filtre statut"
                      onClick={() => {
                        setStatutFilter("all");
                        handleFilterChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
                {typeFilter !== "all" ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="truncate">{typeLabels[typeFilter as TypeLivraison]}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full"
                      aria-label="Retirer le filtre type"
                      onClick={() => {
                        setTypeFilter("all");
                        handleFilterChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
                {quartierFilter !== "all" ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="truncate">{quartierFilter}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full"
                      aria-label="Retirer le filtre quartier"
                      onClick={() => {
                        setQuartierFilter("all");
                        handleFilterChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
                {groupFilter !== "all" ? (
                  <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="truncate">{groupMap.get(parseInt(groupFilter, 10)) ?? "Prestataire"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full"
                      aria-label="Retirer le filtre prestataire"
                      onClick={() => {
                        setGroupFilter("all");
                        handleFilterChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isError ? <AppErrorExperience error={error} onRetry={() => void refetch()} /> : null}

      {/* Table */}
      <div className="stat-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Rows3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Densité du tableau
          </span>
          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(v) => {
              if (v === "cozy" || v === "compact") setDensity(v);
            }}
            variant="outline"
            size="sm"
            className="shrink-0 gap-0 rounded-md bg-background p-0.5 shadow-sm"
          >
            <ToggleGroupItem
              value="cozy"
              className="h-7 rounded-sm px-2.5 text-xs data-[state=on]:bg-muted"
              aria-label="Affichage confortable"
            >
              Confort
            </ToggleGroupItem>
            <ToggleGroupItem
              value="compact"
              className="h-7 rounded-sm px-2.5 text-xs data-[state=on]:bg-muted"
              aria-label="Affichage compact"
            >
              Compact
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="overflow-x-auto">
          <Table
            className={cn(
              density === "compact" &&
                "text-[13px] [&_tbody_td]:px-3 [&_tbody_td]:py-2 [&_thead_th]:h-9 [&_thead_th]:px-3 [&_thead_th]:py-1.5"
            )}
          >
            <TableHeader className="shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow className="border-b-0 hover:bg-transparent">
                <SortableTh
                  field="phone"
                  label="Téléphone"
                  currentField={sortField}
                  order={sortOrder}
                  onSort={handleSort}
                  className="w-[130px]"
                />
                <TableHead className="w-[200px] bg-muted/95 font-semibold text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-muted/85">
                  Produits
                </TableHead>
                <TableHead className="w-[130px] bg-muted/95 font-semibold text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-muted/85">
                  Quartier
                </TableHead>
                <SortableTh
                  field="group_id"
                  label="Prestataire"
                  currentField={sortField}
                  order={sortOrder}
                  onSort={handleSort}
                  className="min-w-[10.5rem] max-w-[200px]"
                />
                <SortableTh
                  field="amount_due"
                  label="Montant"
                  currentField={sortField}
                  order={sortOrder}
                  onSort={handleSort}
                  align="right"
                  className="min-w-[7.5rem] tabular-nums"
                />
                <SortableTh
                  field="amount_paid"
                  label="Encaissé"
                  currentField={sortField}
                  order={sortOrder}
                  onSort={handleSort}
                  align="right"
                  className="w-[100px] tabular-nums"
                />
                <TableHead className="min-w-[150px] bg-muted/95 font-semibold text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-muted/85">
                  Statut
                </TableHead>
                <TableHead className="w-[140px] bg-muted/95 text-right font-semibold text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-muted/85">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
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
                    className="group cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleEdit(livraison)}
                  >
                    <TableCell className="font-medium">{livraison.telephone}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {livraison.produits}
                    </TableCell>
                    <TableCell>{livraison.quartier}</TableCell>
                    <TableCell className="max-w-[200px]">
                      {livraison.group_id && groupMap.has(livraison.group_id) ? (
                        <span className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-muted/60 py-0.5 pl-0.5 pr-2.5 text-sm font-medium text-foreground shadow-sm dark:bg-muted/40">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted-foreground/45 text-white dark:bg-muted-foreground/55"
                            aria-hidden
                          >
                            <User className="h-3.5 w-3.5" strokeWidth={2} />
                          </span>
                          <span className="min-w-0 truncate pl-2">
                            {groupMap.get(livraison.group_id)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-middle tabular-nums">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-base font-semibold leading-tight text-foreground">
                          {formatCurrency(livraison.montant_total)}
                        </span>
                        {livraison.restant > 0 ? (
                          <span className="text-xs font-medium leading-tight text-amber-600 dark:text-amber-400">
                            Reste {formatCurrency(livraison.restant)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium text-success/90">
                      {formatCurrency(livraison.montant_encaisse)}
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
                          <SelectTrigger className="h-10 w-[140px] border-none shadow-none hover:bg-muted/50 p-1">
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
                        className="flex items-center justify-end gap-0.5 transition-opacity max-md:opacity-100 max-md:pointer-events-auto md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => navigate(`/livraisons/${livraison.id}`)}
                          title="Voir les détails"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleEdit(livraison)}
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(livraison)}
                          title="Supprimer"
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
      {!isLoading && deliveriesData && deliveriesData.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Affichage de {(page - 1) * limit + 1} à {Math.min(page * limit, deliveriesData.pagination.total)} sur {deliveriesData.pagination.total} livraison(s)
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Précédent</span>
                </Button>
              </PaginationItem>
              
              {Array.from({ length: Math.min(5, deliveriesData.pagination.totalPages) }, (_, i) => {
                let pageNum: number;
                if (deliveriesData.pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= deliveriesData.pagination.totalPages - 2) {
                  pageNum = deliveriesData.pagination.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                
                return (
                  <PaginationItem key={pageNum}>
                    <Button
                      variant={page === pageNum ? "outline" : "ghost"}
                      size="sm"
                      onClick={() => setPage(pageNum)}
                      className="w-9"
                    >
                      {pageNum}
                    </Button>
                  </PaginationItem>
                );
              })}
              
              <PaginationItem>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.min(deliveriesData.pagination.totalPages, p + 1))}
                  disabled={page >= deliveriesData.pagination.totalPages}
                  className="gap-1"
                >
                  <span>Suivant</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Pagination info (when no pagination controls) */}
      {!isLoading && deliveriesData && deliveriesData.pagination.totalPages <= 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>{filteredLivraisons.length} livraison(s) trouvée(s)</p>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle livraison</DialogTitle>
            <DialogDescription>
              Créez une nouvelle livraison
            </DialogDescription>
          </DialogHeader>
          <DeliveryForm
            delivery={undefined}
            onSuccess={() => {
              setIsCreateDialogOpen(false);
              refetchDeliveries();
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
                refetchDeliveries();
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
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <LoadingSpinner size="sm" variant="icon" className="gap-0" />
              ) : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Livraisons;
