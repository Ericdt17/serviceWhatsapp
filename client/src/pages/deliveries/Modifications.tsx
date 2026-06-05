import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, History, ArrowRight, Phone, DollarSign, Package, MapPin, Plus, Minus, RefreshCw } from "lucide-react";
import { getDeliveries } from "@/services/deliveries";
import { getDeliveryHistory } from "@/services/deliveries";
import { DeliveryForm } from "@/components/deliveries/DeliveryForm";
import type { FrontendDelivery } from "@/types/delivery";
import { toast } from "sonner";
import { getDateRangeForPreset, type DateRange } from "@/lib/date-utils";
import { useDateRefresh } from "@/hooks/useDateRefresh";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { StatCard } from "@/components/ui/stat-card";

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const typeLabels = {
  status: "Changement de statut",
  tarif: "Changement de tarif",
  numero: "Changement de numéro",
  montant: "Changement de montant",
  produits: "Modification produits",
  quartier: "Changement de quartier",
  ajout_produit: "Ajout de produit",
  suppression_produit: "Suppression de produit"
};

const typeIcons = {
  status: RefreshCw,
  tarif: DollarSign,
  numero: Phone,
  montant: DollarSign,
  produits: Package,
  quartier: MapPin,
  ajout_produit: Plus,
  suppression_produit: Minus
};

const typeBadgeStyles = {
  numero: "bg-info/15 text-info",
  montant: "bg-warning/15 text-warning",
  produits: "bg-primary/15 text-primary",
  quartier: "bg-expedition/15 text-expedition",
  ajout_produit: "bg-success/15 text-success",
  suppression_produit: "bg-destructive/15 text-destructive"
};

const typeCardVariants: Record<string, "info" | "warning" | "default" | "expedition" | "success" | "destructive"> = {
  status: "info",
  tarif: "warning",
  numero: "info",
  montant: "warning",
  produits: "default",
  quartier: "expedition",
  ajout_produit: "success",
  suppression_produit: "destructive",
};

// Modification data structure
interface ModificationData {
  id: number;
  livraison_id: number;
  type: string;
  ancienne_valeur: string;
  nouvelle_valeur: string;
  date: string;
  auteur: string;
  telephone?: string;
}

const mapFieldToType = (field: string): string | null => {
  const fieldLower = field.toLowerCase();

  if (fieldLower.includes("status") || fieldLower.includes("statut")) return "status";
  if (
    fieldLower.includes("tarif") ||
    fieldLower.includes("fee") ||
    fieldLower.includes("frais") ||
    fieldLower.includes("amount") ||
    fieldLower.includes("montant") ||
    fieldLower.includes("prix")
  ) {
    return "tarif";
  }
  if (
    fieldLower.includes("phone") ||
    fieldLower.includes("numero") ||
    fieldLower.includes("number") ||
    fieldLower.includes("telephone")
  ) {
    return "numero";
  }
  if (
    fieldLower.includes("items") ||
    fieldLower.includes("produits") ||
    fieldLower.includes("product") ||
    fieldLower.includes("article")
  ) {
    return "produits";
  }
  if (fieldLower.includes("quartier") || fieldLower.includes("location") || fieldLower.includes("address")) {
    return "quartier";
  }

  return null;
};

// Map history entry to modification type
const mapActionToType = (action: string, details: string | null): string | null => {
  const actionLower = action.toLowerCase();
  
  // First priority: explicit changed field in details payload
  if (details) {
    try {
      const parsedDetails = JSON.parse(details) as Record<string, unknown>;
      if (typeof parsedDetails === "object" && parsedDetails !== null) {
        const field = (parsedDetails.field ?? parsedDetails.champ ?? "").toString();
        const byField = mapFieldToType(field);
        if (byField) return byField;
      }
    } catch {
      // Ignore parse error and fallback on action name
    }
  }
  
  // Fallback: infer from action text when field is unavailable
  if (actionLower.includes('status') || actionLower.includes('statut')) {
    return 'status';
  }
  if (actionLower.includes('tarif') || actionLower.includes('fee') || actionLower.includes('frais')) {
    return 'tarif';
  }
  if (actionLower.includes('phone') || actionLower.includes('numero') || actionLower.includes('number')) {
    return 'numero';
  }
  if (actionLower.includes('amount') || actionLower.includes('montant') || actionLower.includes('payment')) {
    return 'tarif';
  }
  if (actionLower.includes('items') || actionLower.includes('produits') || actionLower.includes('product')) {
    return 'produits';
  }
  if (actionLower.includes('quartier') || actionLower.includes('location') || actionLower.includes('address')) {
    return 'quartier';
  }
  
  // Default to a generic type
  return 'produits';
};

// Helper function to format currency
const formatCurrency = (value: number | undefined | null) => {
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat('fr-FR').format(numValue) + " FCFA";
};

// Helper function to translate status
const translateStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    "pending": "En cours",
    "delivered": "Livré",
    "failed": "Annulé",  // Changé de "Échec" à "Annulé"
    "pickup": "Au bureau",
    "expedition": "Expédition",
    "cancelled": "Annulé",
    "postponed": "Renvoyé",
    "client_absent": "Client absent",
    "en_cours": "En cours",
    "livré": "Livré",
    "échec": "Annulé",  // Changé de "Échec" à "Annulé" (pour compatibilité)
    "annulé": "Annulé",
    "renvoyé": "Renvoyé",
    "present_ne_decroche_zone1": "Ne décroche pas",
    "present_ne_decroche_zone2": "Ne décroche pas",
  };
  return statusMap[status.toLowerCase()] || status;
};

// Extract old/new values from history details
const extractModificationValues = (action: string, details: string | null, delivery: Record<string, unknown>): { old: string; new: string } => {
  // Creation entries store the full delivery object — there is no old/new value to show
  if (action === 'created') {
    return { old: '', new: 'Nouvelle livraison' };
  }

  let oldValue = '';
  let newValue = '';

  if (details) {
    try {
      const parsed = JSON.parse(details);

      if (typeof parsed === 'object' && parsed !== null) {
        const field = parsed.field || parsed.champ || "";

        oldValue = parsed.old_value !== undefined ? String(parsed.old_value) :
                   parsed.ancienne_valeur !== undefined ? String(parsed.ancienne_valeur) :
                   parsed.from !== undefined ? String(parsed.from) : "";

        newValue = parsed.new_value !== undefined ? String(parsed.new_value) :
                   parsed.nouvelle_valeur !== undefined ? String(parsed.nouvelle_valeur) :
                   parsed.to !== undefined ? String(parsed.to) : "";

        // Formater les valeurs selon le type de champ
        if (field && (field.toLowerCase().includes("status") || field.toLowerCase().includes("statut"))) {
          if (oldValue) oldValue = translateStatus(oldValue);
          if (newValue) newValue = translateStatus(newValue);
        } else if (field && (field.toLowerCase().includes("amount") || field.toLowerCase().includes("montant") ||
                             field.toLowerCase().includes("fee") || field.toLowerCase().includes("frais"))) {
          if (oldValue) {
            const oldNum = parseFloat(oldValue);
            if (!isNaN(oldNum)) oldValue = formatCurrency(oldNum);
          }
          if (newValue) {
            const newNum = parseFloat(newValue);
            if (!isNaN(newNum)) newValue = formatCurrency(newNum);
          }
        }
      } else {
        newValue = String(parsed);
      }
    } catch {
      // Not JSON, use details as new value
      newValue = details;
      oldValue = '';
    }
  }

  if (!oldValue && !newValue) {
    newValue = action || 'Modification';
  }

  return { old: oldValue, new: newValue };
};

const Modifications = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangeForPreset("today"));
  useDateRefresh(setDateRange);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<FrontendDelivery | null>(null);

  // Fetch recent deliveries (last 200 to get modifications)
  const { 
    data: deliveriesData, 
    isLoading: isLoadingDeliveries,
    isError: isErrorDeliveries,
    error: deliveriesError,
    refetch: refetchDeliveries 
  } = useQuery({
    queryKey: ['deliveries', 'modifications'],
    queryFn: () => getDeliveries({ page: 1, limit: 200, sortBy: 'updated_at', sortOrder: 'DESC' }),
    retry: 2,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isErrorDeliveries && deliveriesError) {
      toast.error('Erreur lors du chargement des livraisons', {
        description: deliveriesError instanceof Error ? deliveriesError.message : 'Une erreur est survenue',
      });
    }
  }, [isErrorDeliveries, deliveriesError]);

  // Fetch history for all deliveries (in parallel, but limit to avoid too many requests)
  const deliveryIds = useMemo(() => {
    return deliveriesData?.deliveries?.slice(0, 100).map(d => d.id) || [];
  }, [deliveriesData]);

  // Fetch histories for deliveries (limit to first 50 to avoid too many API calls)
  const historyQueries = useQuery({
    queryKey: ['deliveryHistories', deliveryIds.slice(0, 50)],
    queryFn: async () => {
      const histories = await Promise.allSettled(
        deliveryIds.slice(0, 50).map(id => getDeliveryHistory(id))
      );
      
      // Combine all histories with their delivery IDs
      const results: Array<{ deliveryId: number; history: Record<string, unknown>[] }> = [];
      histories.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push({
            deliveryId: deliveryIds[index],
            history: result.value as Record<string, unknown>[]
          });
        }
      });
      return results;
    },
    enabled: deliveryIds.length > 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Transform history entries to modifications
  const modifications: ModificationData[] = useMemo(() => {
    if (!historyQueries.data || !deliveriesData?.deliveries) return [];
    
    const allModifications: ModificationData[] = [];
    const deliveryMap = new Map(deliveriesData.deliveries.map(d => [d.id, d]));
    
    historyQueries.data.forEach(({ deliveryId, history }) => {
      const delivery = deliveryMap.get(deliveryId);
      if (!delivery) return;
      
      history.forEach((entry: Record<string, unknown>) => {
        // Skip "created" actions as they're not modifications
        if (entry.action === 'created') return;
        
        const modType = mapActionToType(entry.action, entry.details);
        if (!modType) return;
        
        const { old, new: newVal } = extractModificationValues(entry.action, entry.details, delivery);
        
        allModifications.push({
          id: entry.id,
          livraison_id: deliveryId,
          type: modType,
          ancienne_valeur: old,
          nouvelle_valeur: newVal,
          date: entry.created_at || entry.date || new Date().toISOString(),
          auteur: entry.actor || 'bot',
          telephone: delivery.telephone,
        });
      });
    });
    
    // Sort by date (most recent first)
    return allModifications.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [historyQueries.data, deliveriesData]);

  // Filter modifications
  const filteredModifications = useMemo(() => {
    return modifications.filter((m) => {
      // Date filter: check if modification date is within the selected range
      const modificationDate = new Date(m.date);
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      // Set time to start/end of day for proper comparison
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      
      const matchDate = modificationDate >= startDate && modificationDate <= endDate;
      
      const matchSearch = 
        m.telephone?.toLowerCase().includes(search.toLowerCase()) ||
        m.ancienne_valeur.toLowerCase().includes(search.toLowerCase()) ||
        m.nouvelle_valeur.toLowerCase().includes(search.toLowerCase()) ||
        m.auteur.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || m.type === typeFilter;
      return matchDate && matchSearch && matchType;
    });
  }, [modifications, search, typeFilter, dateRange.startDate, dateRange.endDate]);

  const isLoading = isLoadingDeliveries || historyQueries.isLoading;
  const isError = isErrorDeliveries || historyQueries.isError;
  const error = deliveriesError || historyQueries.error;

  const handleModificationRowClick = (deliveryId: number) => {
    const delivery = deliveriesData?.deliveries?.find((d) => d.id === deliveryId);
    if (!delivery) {
      navigate(`/livraisons/${deliveryId}`);
      return;
    }
    setSelectedDelivery(delivery);
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedDelivery(null);
  };

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["deliveryHistories"] });
    queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Modifications</h1>
        <p className="text-muted-foreground">Historique des modifications apportées aux livraisons</p>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-col gap-4">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {isError ? (
        <AppErrorExperience
          error={error}
          onRetry={() => {
            void refetchDeliveries();
            void historyQueries.refetch();
          }}
        />
      ) : null}

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
          {Object.entries(typeLabels).map(([type, label]) => {
            const Icon = typeIcons[type as keyof typeof typeIcons];
            const count = modifications.filter(m => m.type === type).length;
            return (
              <StatCard
                key={type}
                title={label}
                value={count}
                icon={Icon}
                variant={typeCardVariants[type] || "default"}
              />
            );
          })}
        </div>
      )}

      {/* Loading Stats */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card">
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="stat-card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par téléphone, valeur, auteur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Type de modification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="stat-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Livraison</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold hidden md:table-cell">Ancienne valeur</TableHead>
                <TableHead className="font-semibold hidden md:table-cell"></TableHead>
                <TableHead className="font-semibold hidden md:table-cell">Nouvelle valeur</TableHead>
                <TableHead className="font-semibold">Auteur</TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">Date</TableHead>
                <TableHead className="font-semibold text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredModifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                    Aucune modification trouvée
                  </TableCell>
                </TableRow>
              ) : (
                filteredModifications.map((modification) => {
                  const Icon = (typeIcons[modification.type as keyof typeof typeIcons] || History) as React.ElementType;
                  const typeLabel = typeLabels[modification.type as keyof typeof typeLabels] || modification.type;
                  const badgeStyle = typeBadgeStyles[modification.type as keyof typeof typeBadgeStyles] || "bg-muted text-muted-foreground";
                  
                  return (
                    <TableRow 
                      key={modification.id} 
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleModificationRowClick(modification.livraison_id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">#{modification.livraison_id}</span>
                          {modification.telephone && (
                            <span className="text-xs text-muted-foreground hidden lg:inline">
                              {modification.telephone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`status-badge ${badgeStyle}`}>
                          <Icon className="w-3 h-3 mr-1" />
                          <span className="hidden sm:inline">{typeLabel}</span>
                          <span className="sm:hidden">{modification.type}</span>
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate hidden md:table-cell">
                        <span className="text-muted-foreground line-through">
                          {modification.ancienne_valeur}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate hidden md:table-cell font-medium">
                        {modification.nouvelle_valeur}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-md bg-muted text-sm">
                          {modification.auteur}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                        {formatDate(modification.date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModificationRowClick(modification.livraison_id);
                          }}
                        >
                          Voir
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Info */}
      <div className="stat-card bg-muted/50">
        <div className="flex items-start gap-3">
          <History className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-medium">À propos des modifications</p>
            <p className="text-sm text-muted-foreground mt-1">
              Toutes les modifications apportées aux livraisons sont automatiquement enregistrées ici. 
              Cet historique permet de suivre les changements et d'assurer la traçabilité des opérations.
            </p>
          </div>
        </div>
      </div>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setSelectedDelivery(null);
          }
        }}
      >
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
                closeEditDialog();
                refreshData();
              }}
              onCancel={closeEditDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Modifications;
