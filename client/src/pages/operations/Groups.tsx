/**
 * Groups Page
 * Display groups (filtered by agency for agency admins)
 * Agencies and super admins can add new WhatsApp groups
 */

import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGroups, createGroup, updateGroup, deleteGroup, hardDeleteGroup, type Group, type CreateGroupRequest } from "@/services/groups";
import { getAgencies } from "@/services/agencies";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Users,
  Building2,
  Plus,
  Copy,
  Check,
  Trash2,
  Edit,
  Search,
  X,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  Rows3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type MutErr = Error & { data?: { message?: string } };

type SortableField = "name" | "created_at" | "updated_at" | "agency_name";
type TableDensity = "cozy" | "compact";

const DENSITY_KEY = "groupes-table-density";

function readStoredDensity(): TableDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "compact" || v === "cozy") return v;
  } catch { /* ignore */ }
  return "cozy";
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
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export default function Groups() {
  const navigate = useNavigate();
  const { user: _user, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHardDeleteDialogOpen, setIsHardDeleteDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "" });
  const [formData, setFormData] = useState<CreateGroupRequest>({
    name: "",
    whatsapp_group_id: "",
    agency_id: undefined,
    is_active: true,
  });
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Table state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [sortField, setSortField] = useState<SortableField>("name");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("ASC");
  const [density, setDensity] = useState<TableDensity>(() =>
    typeof window !== "undefined" ? readStoredDensity() : "cozy"
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* ignore */ }
  }, [density]);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ["agencies"],
    queryFn: getAgencies,
    enabled: isSuperAdmin,
  });

  const createMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", whatsapp_group_id: "", agency_id: undefined, is_active: true });
      toast.success("Prestataire créé avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la création du prestataire");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; is_active?: boolean } }) =>
      updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setIsEditDialogOpen(false);
      setSelectedGroup(null);
      setEditFormData({ name: "" });
      toast.success("Prestataire modifié avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la modification du prestataire");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateGroup(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Statut du prestataire mis à jour");
    },
    onError: (error: MutErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la mise à jour du statut");
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: hardDeleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setIsHardDeleteDialogOpen(false);
      setSelectedGroup(null);
      toast.success("Prestataire supprimé définitivement");
    },
    onError: (error: MutErr) => {
      toast.error(error?.data?.message || error?.message || "Erreur lors de la suppression définitive");
    },
  });

  // Keep deleteGroup imported to avoid unused warning — soft-delete kept in mutation map
  void deleteGroup;

  const handleSort = (field: SortableField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "DESC" ? "ASC" : "DESC"));
    } else {
      setSortField(field);
      setSortOrder("ASC");
    }
  };

  const handleEditClick = (group: Group) => {
    setSelectedGroup(group);
    setEditFormData({ name: group.name });
    setIsEditDialogOpen(true);
  };

  const handleEdit = () => {
    if (!selectedGroup || !editFormData.name.trim()) {
      toast.error("Le nom du prestataire est requis");
      return;
    }
    updateMutation.mutate({ id: selectedGroup.id, data: { name: editFormData.name.trim() } });
  };

  const handleToggleActive = (group: Group, newStatus: boolean) => {
    toggleActiveMutation.mutate({ id: group.id, is_active: newStatus });
  };

  const handleHardDeleteClick = (group: Group) => {
    setSelectedGroup(group);
    setIsHardDeleteDialogOpen(true);
  };

  const confirmHardDelete = () => {
    if (selectedGroup) hardDeleteMutation.mutate(selectedGroup.id);
  };

  const handleCreate = () => {
    if (!formData.name || !formData.whatsapp_group_id) {
      toast.error("Veuillez remplir tous les champs requis");
      return;
    }
    if (isSuperAdmin && !formData.agency_id) {
      toast.error("Veuillez sélectionner une agence");
      return;
    }
    const whatsappIdPattern = /^\d+@g\.us$/;
    if (!whatsappIdPattern.test(formData.whatsapp_group_id.trim())) {
      toast.error("Format d'ID WhatsApp invalide. Format attendu: nombres@g.us");
      return;
    }
    const createData: CreateGroupRequest = {
      name: formData.name.trim(),
      whatsapp_group_id: formData.whatsapp_group_id.trim(),
      is_active: formData.is_active,
    };
    if (isSuperAdmin && formData.agency_id) createData.agency_id = formData.agency_id;
    createMutation.mutate(createData);
  };

  const handleCopyId = (group: Group) => {
    if (!group.whatsapp_group_id) return;
    navigator.clipboard.writeText(group.whatsapp_group_id);
    setCopiedId(group.id);
    toast.success("ID copié dans le presse-papiers");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Reset to page 1 whenever filters or sort change
  useEffect(() => { setPage(1); }, [search, statusFilter, sortField, sortOrder]);

  const removableFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const filteredAndSorted = useMemo(() => {
    let rows = groups.filter((g) => {
      const matchSearch =
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.agency_name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && g.is_active) ||
        (statusFilter === "inactive" && !g.is_active);
      return matchSearch && matchStatus;
    });

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
          break;
        case "agency_name":
          cmp = (a.agency_name ?? "").localeCompare(b.agency_name ?? "", "fr", { sensitivity: "base" });
          break;
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "updated_at":
          cmp = new Date(a.last_delivery_at ?? 0).getTime() - new Date(b.last_delivery_at ?? 0).getTime();
          break;
      }
      return sortOrder === "ASC" ? cmp : -cmp;
    });

    return rows;
  }, [groups, search, statusFilter, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const paginated = filteredAndSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Prestataires</h1>
          <p className="text-muted-foreground text-sm">
            {isSuperAdmin
              ? "Tous les prestataires de toutes les agences"
              : "Prestataires de votre agence"}
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Ajouter un prestataire
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter un prestataire WhatsApp</DialogTitle>
              <DialogDescription>
                Ajoutez un prestataire WhatsApp pour commencer à recevoir des messages.
                Utilisez la commande #link dans le prestataire pour obtenir l'ID.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <div className="space-y-4 py-4">
                {isSuperAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="agency">Agence *</Label>
                    <Select
                      value={formData.agency_id?.toString() || ""}
                      onValueChange={(value) => setFormData({ ...formData, agency_id: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une agence" />
                      </SelectTrigger>
                      <SelectContent>
                        {agencies.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id.toString()}>
                            {agency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du prestataire *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Prestataire de livraison"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_group_id">ID du prestataire WhatsApp *</Label>
                  <Input
                    id="whatsapp_group_id"
                    value={formData.whatsapp_group_id}
                    onChange={(e) => setFormData({ ...formData, whatsapp_group_id: e.target.value })}
                    placeholder="Ex: 120363424120563204@g.us"
                    className="font-mono"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Utilisez la commande <code className="bg-muted px-1 rounded">#link</code> dans
                    le prestataire WhatsApp pour obtenir cet ID.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" className="gap-2" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search + filter bar */}
      <div className="stat-card !p-3 sm:!p-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[min(100%,220px)] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un prestataire…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 border-dashed">
                  <ListFilter className="h-3.5 w-3.5" />
                  Filtres
                  {removableFilterCount > 0 ? (
                    <Badge variant="secondary" className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                      {removableFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(calc(100vw-2rem),280px)] space-y-3 p-3" align="start">
                <p className="text-sm font-medium leading-none">Affiner la liste</p>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Statut</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="active">Actifs seulement</SelectItem>
                      <SelectItem value="inactive">Inactifs seulement</SelectItem>
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
                      setStatusFilter("all");
                      setSearch("");
                      setFilterPopoverOpen(false);
                    }}
                  >
                    Réinitialiser tout
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>

          {/* Active filter pills */}
          {removableFilterCount > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {search.trim() ? (
                <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                  <span className="max-w-[180px] truncate">« {search.trim()} »</span>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 shrink-0 rounded-full"
                    onClick={() => setSearch("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ) : null}
              {statusFilter !== "all" ? (
                <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-0.5 text-xs text-foreground">
                  <span className="truncate">{statusFilter === "active" ? "Actifs" : "Inactifs"}</span>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 shrink-0 rounded-full"
                    onClick={() => setStatusFilter("all")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Aucun prestataire
            </CardTitle>
            <CardDescription>
              Ajoutez un prestataire WhatsApp pour commencer à recevoir des messages.
              <br />
              <span className="mt-2 block">
                Utilisez la commande <code className="bg-muted px-1 rounded">#link</code> dans
                le prestataire WhatsApp pour obtenir l'ID du prestataire.
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="stat-card overflow-hidden p-0">
          {/* Density toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Rows3 className="h-3.5 w-3.5 shrink-0" />
              Densité du tableau
            </span>
            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(v) => { if (v === "cozy" || v === "compact") setDensity(v); }}
              variant="outline"
              size="sm"
              className="shrink-0 gap-0 rounded-md bg-background p-0.5 shadow-sm"
            >
              <ToggleGroupItem value="cozy" className="h-7 rounded-sm px-2.5 text-xs data-[state=on]:bg-muted" aria-label="Affichage confortable">
                Confort
              </ToggleGroupItem>
              <ToggleGroupItem value="compact" className="h-7 rounded-sm px-2.5 text-xs data-[state=on]:bg-muted" aria-label="Affichage compact">
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
                  <SortableTh field="name" label="Nom" currentField={sortField} order={sortOrder} onSort={handleSort} className="min-w-[160px]" />
                  {isSuperAdmin && (
                    <SortableTh field="agency_name" label="Agence" currentField={sortField} order={sortOrder} onSort={handleSort} className="min-w-[140px]" />
                  )}
                  <TableHead className="bg-muted/95 backdrop-blur-md supports-[backdrop-filter]:bg-muted/85 font-semibold text-foreground whitespace-nowrap">
                    Statut
                  </TableHead>
                  <SortableTh field="created_at" label="Ajouté le" currentField={sortField} order={sortOrder} onSort={handleSort} className="min-w-[120px]" />
                  <SortableTh field="updated_at" label="Dernière activité" currentField={sortField} order={sortOrder} onSort={handleSort} className="min-w-[150px]" />
                  <TableHead className="bg-muted/95 backdrop-blur-md supports-[backdrop-filter]:bg-muted/85 font-semibold text-foreground whitespace-nowrap min-w-[180px]">
                    ID WhatsApp
                  </TableHead>
                  <TableHead className="bg-muted/95 backdrop-blur-md supports-[backdrop-filter]:bg-muted/85 font-semibold text-foreground text-right whitespace-nowrap">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isSuperAdmin ? 7 : 6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      Aucun prestataire ne correspond à votre recherche
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((group) => (
                    <TableRow
                      key={group.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        !group.is_active && "opacity-60"
                      )}
                      onClick={() => navigate(`/groupes/${group.id}`)}
                    >
                      <TableCell className="font-medium">{group.name}</TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{group.agency_name || `Agence #${group.agency_id}`}</span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={group.is_active}
                            onCheckedChange={(checked) => handleToggleActive(group, checked)}
                            disabled={toggleActiveMutation.isPending}
                          />
                          <Badge variant={group.is_active ? "default" : "secondary"}>
                            {group.is_active ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(group.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {group.last_delivery_at
                          ? new Date(group.last_delivery_at).toLocaleDateString("fr-FR", {
                              day: "2-digit", month: "short", year: "numeric",
                            })
                          : <span className="italic">Aucune livraison</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                        {group.whatsapp_group_id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground truncate max-w-[140px]">
                              {group.whatsapp_group_id}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => handleCopyId(group)}
                              title="Copier l'ID"
                            >
                              {copiedId === group.id ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => handleEditClick(group)}
                            title="Modifier le nom"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleHardDeleteClick(group)}
                            title="Supprimer définitivement"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer: count + pagination */}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {filteredAndSorted.length} prestataire{filteredAndSorted.length !== 1 ? "s" : ""}
              {filteredAndSorted.length !== groups.length ? ` sur ${groups.length}` : ""}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[80px] text-center text-xs tabular-nums text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le prestataire</DialogTitle>
            <DialogDescription>
              Modifiez le nom du prestataire "{selectedGroup?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom du prestataire *</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="Ex: Prestataire de livraison"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="gap-2"
              onClick={handleEdit}
              disabled={updateMutation.isPending || !editFormData.name.trim()}
            >
              {updateMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Dialog */}
      <AlertDialog open={isHardDeleteDialogOpen} onOpenChange={setIsHardDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression définitive</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ Cette action supprimera définitivement le prestataire "{selectedGroup?.name}" de la base de données.
              <br />
              <span className="font-semibold mt-2 block text-destructive">
                Cette action est irréversible et supprimera toutes les données associées.
              </span>
              <br />
              Êtes-vous absolument sûr de vouloir continuer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmHardDelete}
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={hardDeleteMutation.isPending}
            >
              {hardDeleteMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
