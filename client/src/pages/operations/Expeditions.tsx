import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getGroups } from "@/services/groups";
import {
  createExpedition,
  deleteExpedition,
  getExpeditions,
  updateExpedition,
  type CreateExpeditionRequest,
} from "@/services/expeditions";
import type { FrontendExpedition, ExpeditionStatus } from "@/types/expedition";
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
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { Plus, Search, Truck, Wallet, HandCoins, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<ExpeditionStatus, string> = {
  en_attente: "En attente",
  envoye: "Envoyée",
  livre: "Livrée",
  annule: "Annulée",
};

const statusBadgeStyles: Record<ExpeditionStatus, string> = {
  en_attente: "bg-warning/15 text-warning",
  envoye: "bg-info/15 text-info",
  livre: "bg-success/15 text-success",
  annule: "bg-destructive/15 text-destructive",
};

const formatCurrency = (value: number | undefined | null) => {
  const num = typeof value === "number" && isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat("fr-FR").format(num)} F`;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type FormState = {
  group_id: string;
  destination: string;
  agence_de_voyage: string;
  frais_de_course: string;
  frais_de_lagence_de_voyage: string;
  status: ExpeditionStatus;
  notes: string;
};

const emptyForm: FormState = {
  group_id: "",
  destination: "",
  agence_de_voyage: "",
  frais_de_course: "",
  frais_de_lagence_de_voyage: "",
  status: "en_attente",
  notes: "",
};

const Expeditions = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpedition, setEditingExpedition] = useState<FrontendExpedition | null>(null);
  const [expeditionToDelete, setExpeditionToDelete] = useState<FrontendExpedition | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups", "expeditions-form"],
    queryFn: getGroups,
  });

  const params = useMemo(
    () => ({
      page: 1,
      limit: 1000,
      search: search || undefined,
      group_id: groupFilter !== "all" ? Number(groupFilter) : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      sortBy: "created_at",
      sortOrder: "DESC" as const,
    }),
    [search, groupFilter, statusFilter]
  );

  const {
    data: expeditionsResult,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["expeditions", params],
    queryFn: () => getExpeditions(params),
  });

  useEffect(() => {
    if (isError && error) {
      toast.error("Erreur lors du chargement des expéditions", {
        description: error instanceof Error ? error.message : "Une erreur est survenue",
      });
    }
  }, [isError, error]);

  const expeditions = expeditionsResult?.expeditions || [];

  const stats = useMemo(() => ({
    totalExpeditions: expeditions.length,
    totalFraisDeCourse: expeditions.reduce((sum, e) => sum + (e.fraisDeCourse || 0), 0),
    totalFraisDeLAgenceDeVoyage: expeditions.reduce((sum, e) => sum + (e.fraisDeLAgenceDeVoyage || 0), 0),
  }), [expeditions]);

  const resetForm = () => {
    setEditingExpedition(null);
    setForm(emptyForm);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (expedition: FrontendExpedition) => {
    setEditingExpedition(expedition);
    setForm({
      group_id: String(expedition.groupId),
      destination: expedition.destination,
      agence_de_voyage: expedition.agenceDeVoyage,
      frais_de_course: String(expedition.fraisDeCourse),
      frais_de_lagence_de_voyage: String(expedition.fraisDeLAgenceDeVoyage),
      status: expedition.status,
      notes: expedition.notes || "",
    });
    setIsModalOpen(true);
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["expeditions"] });
    queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateExpeditionRequest = {
        group_id: Number(form.group_id),
        destination: form.destination.trim(),
        agence_de_voyage: form.agence_de_voyage.trim(),
        frais_de_course: Number(form.frais_de_course),
        frais_de_lagence_de_voyage: Number(form.frais_de_lagence_de_voyage),
        status: form.status,
        notes: form.notes.trim() || undefined,
      };

      if (editingExpedition) {
        return updateExpedition(editingExpedition.id, payload);
      }
      return createExpedition(payload);
    },
    onSuccess: () => {
      toast.success(editingExpedition ? "Expédition mise à jour" : "Expédition créée");
      setIsModalOpen(false);
      resetForm();
      refreshAll();
    },
    onError: (err) => {
      toast.error("Impossible d'enregistrer l'expédition", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteExpedition(id),
    onSuccess: () => {
      toast.success("Expédition supprimée");
      refreshAll();
    },
    onError: (err) => {
      toast.error("Suppression impossible", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    },
  });

  const handleSubmit = () => {
    if (!form.group_id || !form.destination.trim() || !form.agence_de_voyage.trim()) {
      toast.error("Champs obligatoires manquants");
      return;
    }
    if (
      Number.isNaN(Number(form.frais_de_course)) ||
      Number(form.frais_de_course) < 0 ||
      Number.isNaN(Number(form.frais_de_lagence_de_voyage)) ||
      Number(form.frais_de_lagence_de_voyage) < 0
    ) {
      toast.error("Les frais doivent être des montants valides >= 0");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6 pb-8 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Expéditions</h1>
          <p className="text-muted-foreground">Gestion des expéditions inter-ville (liées au groupe)</p>
        </div>
        <Button className="gap-2 w-full sm:w-auto" onClick={openCreateModal}>
          <Plus className="w-4 h-4" />
          Nouvelle expédition
        </Button>
      </div>

      {isError ? <AppErrorExperience error={error} onRetry={() => void refetch()} /> : null}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total expéditions" value={stats?.totalExpeditions ?? expeditions.length} icon={Truck} variant="expedition" />
          <StatCard title="Frais de course" value={formatCurrency(stats?.totalFraisDeCourse)} icon={Wallet} variant="success" />
          <StatCard title="Frais agence voyage" value={formatCurrency(stats?.totalFraisDeLAgenceDeVoyage)} icon={HandCoins} variant="warning" />
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="stat-card">
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
        </div>
      )}

      <div className="stat-card">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher destination, agence de voyage, groupe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Groupe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous groupes</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="stat-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Groupe</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Agence de voyage</TableHead>
                <TableHead>Frais de course</TableHead>
                <TableHead>Frais agence voyage</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : expeditions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                    Aucune expédition trouvée
                  </TableCell>
                </TableRow>
              ) : (
                expeditions.map((expedition) => (
                  <TableRow key={expedition.id}>
                    <TableCell>{expedition.groupName || `#${expedition.groupId}`}</TableCell>
                    <TableCell>{expedition.destination}</TableCell>
                    <TableCell>{expedition.agenceDeVoyage}</TableCell>
                    <TableCell>{formatCurrency(expedition.fraisDeCourse)}</TableCell>
                    <TableCell>{formatCurrency(expedition.fraisDeLAgenceDeVoyage)}</TableCell>
                    <TableCell>
                      <span className={`status-badge ${statusBadgeStyles[expedition.status as ExpeditionStatus] || statusBadgeStyles.en_attente}`}>
                        {statusLabels[expedition.status as ExpeditionStatus] || expedition.status}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(expedition.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(expedition)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpeditionToDelete(expedition)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
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

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpedition ? "Modifier l'expédition" : "Nouvelle expédition"}</DialogTitle>
            <DialogDescription>Renseignez les informations de l'expédition.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Prestataire</label>
              <Select
                value={form.group_id}
                onValueChange={(v) => setForm((prev) => ({ ...prev, group_id: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionnez un groupe" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Destination</label>
                <Input
                  className="mt-1"
                  value={form.destination}
                  onChange={(e) => setForm((prev) => ({ ...prev, destination: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Agence de voyage</label>
                <Input
                  className="mt-1"
                  value={form.agence_de_voyage}
                  onChange={(e) => setForm((prev) => ({ ...prev, agence_de_voyage: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Frais de course</label>
                <Input
                  className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  type="number"
                  min={0}
                  onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  value={form.frais_de_course}
                  onChange={(e) => setForm((prev) => ({ ...prev, frais_de_course: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Frais de l'agence de voyage</label>
                <Input
                  className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  type="number"
                  min={0}
                  onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  value={form.frais_de_lagence_de_voyage}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, frais_de_lagence_de_voyage: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Statut</label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as ExpeditionStatus }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                className="mt-1"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
              {editingExpedition ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!expeditionToDelete} onOpenChange={(open) => { if (!open) setExpeditionToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'expédition ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera définitivement l'expédition vers{" "}
              <span className="font-semibold">{expeditionToDelete?.destination}</span>.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (expeditionToDelete) {
                  deleteMutation.mutate(expeditionToDelete.id);
                  setExpeditionToDelete(null);
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Expeditions;
