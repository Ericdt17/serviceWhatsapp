import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getAgencies, type Agency } from "@/services/agencies";
import { getGroups } from "@/services/groups";
import { getReminderContacts } from "@/services/reminder-contacts";
import { createReminder, cancelReminder, deleteReminder, getReminderById, getReminders, retryFailedReminder } from "@/services/reminders";
import type { Reminder, ReminderContact, ReminderStatus, ReminderAudienceMode } from "@/types/reminders";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bell, CalendarClock, Clock, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<ReminderStatus, string> = {
  scheduled: "Programmé",
  running: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
  failed: "Erreur",
};

const STATUS_BADGE: Record<ReminderStatus, "secondary" | "outline" | "destructive"> = {
  scheduled: "secondary",
  running: "secondary",
  completed: "outline",
  cancelled: "outline",
  failed: "destructive",
};

const defaultTimezone = "Africa/Douala";

export default function RemindersPage() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [agencyId, setAgencyId] = useState<string>("all");
  const [contactId, setContactId] = useState<string>("none");
  /** Numeric DB ids for audience_mode "groups" */
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [quickNumbers, setQuickNumbers] = useState("");
  const [audienceMode, setAudienceMode] = useState<ReminderAudienceMode>("contacts");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [message, setMessage] = useState("");
  const [sendAtLocal, setSendAtLocal] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [intervalMin, setIntervalMin] = useState("60");
  const [intervalMax, setIntervalMax] = useState("120");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [reminderToDelete, setReminderToDelete] = useState<Reminder | null>(null);
  const [reminderToReschedule, setReminderToReschedule] = useState<Reminder | null>(null);

  const { data: agencies = [], isLoading: isLoadingAgencies } = useQuery({
    queryKey: ["agencies"],
    queryFn: getAgencies,
    enabled: isSuperAdmin,
  });

  const selectedAgency: Agency | undefined = useMemo(() => {
    if (agencyId === "all") return undefined;
    return agencies.find((a) => a.id === Number(agencyId));
  }, [agencyId, agencies]);

  const {
    data: contacts = [],
    isLoading: isLoadingContacts,
  } = useQuery({
    queryKey: ["reminder-contacts", "admin", agencyId],
    queryFn: () => getReminderContacts({ agency_id: agencyId === "all" ? undefined : Number(agencyId) }),
    enabled: isSuperAdmin && agencyId !== "all",
    retry: 1,
  });

  const contactsById = useMemo(() => {
    const map = new Map<number, ReminderContact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups", "admin-broadcast-count"],
    queryFn: getGroups,
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });

  const broadcastEligibleCount = useMemo(
    () =>
      allGroups.filter(
        (g) =>
          g.is_active &&
          g.whatsapp_group_id != null &&
          String(g.whatsapp_group_id).trim() !== ""
      ).length,
    [allGroups]
  );

  const agencyGroupsSelectable = useMemo(() => {
    if (agencyId === "all") return [];
    const aid = Number(agencyId);
    return allGroups.filter(
      (g) =>
        g.agency_id === aid &&
        g.is_active &&
        g.whatsapp_group_id != null &&
        String(g.whatsapp_group_id).trim() !== ""
    );
  }, [allGroups, agencyId]);

  const {
    data: reminders = [],
    isLoading: isLoadingReminders,
    isError: isErrorReminders,
    error: remindersError,
    refetch: refetchReminders,
  } = useQuery({
    queryKey: ["reminders", "admin", agencyId, statusFilter, contactId],
    queryFn: () =>
      getReminders({
        agency_id: agencyId === "all" ? undefined : Number(agencyId),
        status: statusFilter === "all" ? undefined : statusFilter,
        contact_id: contactId === "none" ? undefined : Number(contactId),
        limit: 200,
        offset: 0,
      }),
    enabled: isSuperAdmin,
    retry: 1,
  });

  useEffect(() => {
    if (isErrorReminders && remindersError) {
      toast.error("Erreur lors du chargement des rappels", {
        description: remindersError instanceof Error ? remindersError.message : "Une erreur est survenue",
      });
    }
  }, [isErrorReminders, remindersError]);

  useEffect(() => {
    setSelectedGroupIds([]);
  }, [agencyId]);

  const toggleGroupSelected = useCallback((id: number, checked: boolean) => {
    setSelectedGroupIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const selectAllAgencyGroups = useCallback(() => {
    setSelectedGroupIds(agencyGroupsSelectable.map((g) => g.id));
  }, [agencyGroupsSelectable]);

  const clearGroupSelection = useCallback(() => {
    setSelectedGroupIds([]);
  }, []);

  const selectedCount = useMemo(() => {
    if (audienceMode === "all_groups") return broadcastEligibleCount;
    if (audienceMode === "contacts") return contactId === "none" ? 0 : 1;
    if (audienceMode === "groups") return selectedGroupIds.length;
    return quickNumbers.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).length;
  }, [audienceMode, contactId, selectedGroupIds, quickNumbers, broadcastEligibleCount]);

  const formNeedsAgency = audienceMode !== "all_groups";

  const canSchedule =
    (!formNeedsAgency || agencyId !== "all") &&
    selectedCount > 0 &&
    message.trim().length > 0 &&
    sendAtLocal.trim().length > 0;

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const sendAtIso = new Date(sendAtLocal).toISOString();
      return createReminder({
        agency_id:
          audienceMode === "all_groups" ? null : Number(agencyId),
        contact_id: audienceMode === "contacts" && contactId !== "none" ? Number(contactId) : undefined,
        contact_ids: audienceMode === "contacts" && contactId !== "none" ? [Number(contactId)] : undefined,
        group_ids: audienceMode === "groups" ? selectedGroupIds : undefined,
        quick_numbers: audienceMode === "quick_numbers"
          ? quickNumbers.split(/[\n,]/).map((v) => v.trim()).filter(Boolean)
          : undefined,
        audience_mode: audienceMode,
        message: message.trim(),
        send_at: sendAtIso,
        timezone,
        send_interval_min_sec: Number(intervalMin || "60"),
        send_interval_max_sec: Number(intervalMax || "120"),
        window_start: windowStart || undefined,
        window_end: windowEnd || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Rappel programmé");
      setMessage("");
      setSendAtLocal("");
      setQuickNumbers("");
      setSelectedGroupIds([]);
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["groups", "admin-broadcast-count"] });
    },
    onError: (error: Error) => {
      toast.error("Impossible de programmer le rappel", {
        description: error?.message || "Une erreur est survenue",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelReminder(id),
    onSuccess: () => {
      toast.success("Rappel annulé");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (error: Error) => {
      toast.error("Impossible d'annuler le rappel", {
        description: error?.message || "Une erreur est survenue",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => retryFailedReminder(id),
    onSuccess: () => {
      toast.success("Cibles en erreur relancées");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (error: Error) => {
      toast.error("Impossible de relancer", {
        description: error?.message || "Une erreur est survenue",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteReminder(id),
    onSuccess: () => {
      toast.success("Rappel supprimé");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (error: Error) => {
      toast.error("Impossible de supprimer le rappel", {
        description: error?.message || "Une erreur est survenue",
      });
    },
  });

  const retestNumberMutation = useMutation({
    mutationFn: async (r: Reminder) => {
      const rawPhone = String(r.contact_phone || "").replace(/\D/g, "");
      if (!rawPhone) {
        throw new Error("Aucun numéro valide à retester pour ce rappel.");
      }
      if (r.agency_id == null) {
        throw new Error("Retest non disponible pour une diffusion globale.");
      }
      // Immediate retry campaign for one quick number target.
      return createReminder({
        agency_id: Number(r.agency_id),
        audience_mode: "quick_numbers",
        quick_numbers: [rawPhone],
        message: String(r.message || ""),
        send_at: new Date().toISOString(),
        timezone: r.timezone || defaultTimezone,
        send_interval_min_sec: 5,
        send_interval_max_sec: 10,
      });
    },
    onSuccess: () => {
      toast.success("Retest lancé immédiatement");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (error: Error) => {
      toast.error("Impossible de retester ce numéro", {
        description: error?.message || "Une erreur est survenue",
      });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ reminderId, minutes }: { reminderId: number; minutes: number }) => {
      const reminder = await getReminderById(reminderId);
      if (!reminder) throw new Error("Rappel introuvable");

      const sendAt = new Date(Date.now() + minutes * 60_000).toISOString();
      const audience = reminder.audience_mode || "contacts";

      if (audience === "all_groups") {
        return createReminder({
          agency_id: null,
          audience_mode: "all_groups",
          message: reminder.message,
          send_at: sendAt,
          timezone: reminder.timezone || defaultTimezone,
          send_interval_min_sec: reminder.send_interval_min_sec ?? 60,
          send_interval_max_sec: reminder.send_interval_max_sec ?? 120,
          window_start: reminder.window_start || undefined,
          window_end: reminder.window_end || undefined,
        });
      }

      // Re-schedule from existing reminder data. Contacts mode uses contact_id;
      // fallback to quick_numbers when contact_phone is available.
      if (audience === "contacts" && reminder.contact_id && reminder.agency_id != null) {
        return createReminder({
          agency_id: reminder.agency_id,
          audience_mode: "contacts",
          contact_id: reminder.contact_id,
          contact_ids: [reminder.contact_id],
          message: reminder.message,
          send_at: sendAt,
          timezone: reminder.timezone || defaultTimezone,
          send_interval_min_sec: reminder.send_interval_min_sec ?? 60,
          send_interval_max_sec: reminder.send_interval_max_sec ?? 120,
          window_start: reminder.window_start || undefined,
          window_end: reminder.window_end || undefined,
        });
      }

      const quickTargets =
        (reminder.targets || [])
          .filter((t) => t.target_type === "quick_number" || t.target_type === "contact")
          .map((t) => String(t.target_value || "").trim())
          .filter(Boolean);

      if (quickTargets.length === 0 && reminder.contact_phone) {
        quickTargets.push(String(reminder.contact_phone).replace(/\D/g, ""));
      }
      if (quickTargets.length === 0) {
        throw new Error("Aucune cible reprogrammable (contacts/numéros) pour ce rappel.");
      }

      if (reminder.agency_id == null) {
        throw new Error("Reprogrammation impossible : agence manquante pour ce rappel.");
      }

      return createReminder({
        agency_id: reminder.agency_id,
        audience_mode: "quick_numbers",
        quick_numbers: quickTargets,
        message: reminder.message,
        send_at: sendAt,
        timezone: reminder.timezone || defaultTimezone,
        send_interval_min_sec: reminder.send_interval_min_sec ?? 60,
        send_interval_max_sec: reminder.send_interval_max_sec ?? 120,
        window_start: reminder.window_start || undefined,
        window_end: reminder.window_end || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Rappel reprogrammé");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (error: Error) => {
      toast.error("Impossible de reprogrammer", {
        description: error?.message || "Une erreur est survenue",
      });
    },
  });

  const renderContactLabel = (r: Reminder) => {
    if (r.audience_mode === "all_groups") return "Diffusion — tous les groupes";
    if (r.contact_label) return r.contact_label;
    const cid = r.contact_id;
    if (cid != null) {
      const c = contactsById.get(cid);
      return c?.label || `Contact #${cid}`;
    }
    return "—";
  };

  const renderContactPhone = (r: Reminder) => {
    if (r.audience_mode === "all_groups") {
      const n = r.total_targets ?? 0;
      return `${n} groupe${n === 1 ? "" : "s"}`;
    }
    if (r.contact_phone) return r.contact_phone;
    const cid = r.contact_id;
    if (cid != null) {
      const c = contactsById.get(cid);
      return c?.phone || "";
    }
    return "";
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">Rappels</h1>
        <p className="text-muted-foreground">
          Programmez des rappels WhatsApp (contacts, groupes d&apos;une agence, ou diffusion vers tous les groupes actifs enregistrés).
        </p>
      </div>

      <div className="space-y-4">
        <div className="stat-card space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <p className="font-semibold">Programmer un rappel</p>
          </div>

          <div className="grid gap-3">
            <div>
              <p className="text-sm font-medium">Agence</p>
              <Select
                value={agencyId}
                onValueChange={(v) => {
                  setAgencyId(v);
                  setContactId("none");
                }}
                disabled={audienceMode === "all_groups"}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner une agence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sélectionner…</SelectItem>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {audienceMode === "all_groups" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Non requis : la diffusion cible tous les groupes actifs (ID WhatsApp renseigné).
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-medium">Audience</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button type="button" variant={audienceMode === "contacts" ? "default" : "outline"} onClick={() => setAudienceMode("contacts")}>Contacts</Button>
                <Button type="button" variant={audienceMode === "groups" ? "default" : "outline"} onClick={() => setAudienceMode("groups")}>Groupes</Button>
                <Button type="button" variant={audienceMode === "quick_numbers" ? "default" : "outline"} onClick={() => setAudienceMode("quick_numbers")}>Audience rapide</Button>
                <Button type="button" variant={audienceMode === "all_groups" ? "default" : "outline"} onClick={() => setAudienceMode("all_groups")}>Tous les groupes</Button>
              </div>
              {agencyId !== "all" && contacts.length === 0 && !isLoadingContacts ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Aucun numéro enregistré pour cette agence (à ajouter côté agence dans Paramètres).
                </p>
              ) : null}
            </div>

            {audienceMode === "contacts" ? (
              <div>
                <p className="text-sm font-medium">Contact</p>
                <Select value={contactId} onValueChange={setContactId} disabled={agencyId === "all" || isLoadingContacts}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sélectionner un numéro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sélectionner…</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.label} — {c.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audienceMode === "groups" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Groupes prestataires (WhatsApp)</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={agencyId === "all" || agencyGroupsSelectable.length === 0}
                      onClick={selectAllAgencyGroups}
                    >
                      Tout sélectionner
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={selectedGroupIds.length === 0}
                      onClick={clearGroupSelection}
                    >
                      Tout désélectionner
                    </Button>
                  </div>
                </div>
                {agencyId === "all" ? (
                  <p className="text-sm text-muted-foreground">
                    Choisissez d&apos;abord une agence pour afficher ses groupes enregistrés.
                  </p>
                ) : agencyGroupsSelectable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun groupe actif avec ID WhatsApp pour cette agence. Ajoutez-en dans Opérations / Groupes.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/10 p-2 space-y-2">
                    {agencyGroupsSelectable.map((g) => {
                      const checked = selectedGroupIds.includes(g.id);
                      return (
                        <div
                          key={g.id}
                          className="flex items-start gap-3 rounded-sm px-2 py-1.5 hover:bg-muted/40"
                        >
                          <Checkbox
                            id={`reminder-group-${g.id}`}
                            checked={checked}
                            onCheckedChange={(v) => toggleGroupSelected(g.id, v === true)}
                            className="mt-0.5"
                          />
                          <Label
                            htmlFor={`reminder-group-${g.id}`}
                            className="cursor-pointer text-sm font-normal leading-snug"
                          >
                            <span className="font-medium">{g.name || `Groupe #${g.id}`}</span>
                            {g.whatsapp_group_id ? (
                              <span className="block text-xs text-muted-foreground font-mono truncate max-w-[280px] sm:max-w-md">
                                {g.whatsapp_group_id}
                              </span>
                            ) : null}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {selectedGroupIds.length} groupe{selectedGroupIds.length === 1 ? "" : "s"} sélectionné
                  {selectedGroupIds.length === 0 ? " — cochez au moins un groupe ou utilisez « Tout sélectionner »." : "."}
                </p>
              </div>
            ) : null}

            {audienceMode === "quick_numbers" ? (
              <div>
                <p className="text-sm font-medium">Numéros rapides (virgule ou ligne)</p>
                <Textarea className="mt-1" rows={3} value={quickNumbers} onChange={(e) => setQuickNumbers(e.target.value)} placeholder="+237690..., +237691..." />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Date & heure</p>
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={sendAtLocal}
                  onChange={(e) => setSendAtLocal(e.target.value)}
                  disabled={formNeedsAgency && agencyId === "all"}
                />
              </div>
              <div>
                <p className="text-sm font-medium">Fuseau</p>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Fuseau horaire" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Douala">Africa/Douala</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Africa/Abidjan">Africa/Abidjan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Intervalle min (sec)</p>
                <Input type="number" min={1} className="mt-1" value={intervalMin} onChange={(e) => setIntervalMin(e.target.value)} />
              </div>
              <div>
                <p className="text-sm font-medium">Intervalle max (sec)</p>
                <Input type="number" min={1} className="mt-1" value={intervalMax} onChange={(e) => setIntervalMax(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Heure début (optionnel)</p>
                <Input type="time" className="mt-1" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
              </div>
              <div>
                <p className="text-sm font-medium">Heure fin (optionnel)</p>
                <Input type="time" className="mt-1" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Message</p>
              <Textarea
                className="mt-1"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: Rappel: réunion à 08:00 au bureau."
                disabled={formNeedsAgency && agencyId === "all"}
              />
            </div>
            <div className="rounded border bg-muted/20 p-2 text-xs text-muted-foreground">
              Cibles: {selectedCount} • Duree estimee: {Math.max(0, selectedCount - 1) * Math.round((Number(intervalMin || 60) + Number(intervalMax || 120)) / 2)} sec
            </div>

            <Button
              className="gap-2"
              disabled={!canSchedule || scheduleMutation.isPending}
              onClick={() => scheduleMutation.mutate()}
            >
              <CalendarClock className="h-4 w-4" />
              Programmer
            </Button>
          </div>
        </div>

        <div className="stat-card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">Rappels — {selectedAgency?.name ?? "Agence"}</p>
              <p className="text-sm text-muted-foreground">
                Derniers rappels programmés/envoyés.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="scheduled">Programmés</SelectItem>
                  <SelectItem value="running">En cours</SelectItem>
                  <SelectItem value="completed">Terminés</SelectItem>
                  <SelectItem value="cancelled">Annulés</SelectItem>
                  <SelectItem value="failed">Erreurs</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void refetchReminders()}>
                Actualiser
              </Button>
            </div>
          </div>

          {isLoadingReminders ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : null}

          {isErrorReminders && !isLoadingReminders ? (
            <AppErrorExperience error={remindersError} onRetry={() => void refetchReminders()} />
          ) : null}

          {!isLoadingReminders && !isErrorReminders ? (
            reminders.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Aucun rappel.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Contact</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Dernière erreur</TableHead>
                      <TableHead>Progression</TableHead>
                      <TableHead>Envoi</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="min-w-[220px]">
                          <p className="font-medium">{renderContactLabel(r)}</p>
                          <p className="text-xs text-muted-foreground">{renderContactPhone(r)}</p>
                        </TableCell>
                        <TableCell className="min-w-[260px]">
                          <p className="line-clamp-2 text-sm">{r.message}</p>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          {r.last_error ? (
                            <Badge variant="destructive" className="max-w-full whitespace-normal break-words">
                              {r.last_error}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Aucune</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.sent_count ?? 0}/{r.total_targets ?? 0} envoyes
                          <p className="text-xs text-muted-foreground">erreurs: {r.failed_count ?? 0} • ignores: {r.skipped_count ?? 0}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(r.send_at).toLocaleString("fr-FR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[r.status]}>
                            {STATUS_LABELS[r.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              title="Reprogrammer"
                              aria-label="Reprogrammer"
                              onClick={() => setReminderToReschedule(r)}
                              disabled={rescheduleMutation.isPending}
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                            {(r.status === "scheduled" || r.status === "running") ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Annuler"
                                aria-label="Annuler"
                                onClick={() => cancelMutation.mutate(r.id)}
                                disabled={cancelMutation.isPending}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {(r.status === "failed" || (r.failed_count ?? 0) > 0 || (r.skipped_count ?? 0) > 0) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => retryMutation.mutate(r.id)}
                                disabled={retryMutation.isPending}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Relancer
                              </Button>
                            ) : null}
                            {(r.last_error && r.contact_phone) ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => retestNumberMutation.mutate(r)}
                                disabled={retestNumberMutation.isPending}
                              >
                                Retester ce numéro
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setReminderToDelete(r)}
                              disabled={deleteMutation.isPending}
                              title="Supprimer"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </div>
      </div>

      {isLoadingAgencies ? (
        <p className="text-sm text-muted-foreground">Chargement des agences…</p>
      ) : null}

      <Dialog open={!!reminderToReschedule} onOpenChange={(open) => { if (!open) setReminderToReschedule(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reprogrammer le rappel</DialogTitle>
            <DialogDescription>
              Choisissez dans combien de temps envoyer à nouveau ce message
              {reminderToReschedule ? ` (rappel #${reminderToReschedule.id})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-4">
            {([1, 5, 15, 30] as const).map((minutes) => (
              <Button
                key={minutes}
                type="button"
                variant="outline"
                className="w-full"
                disabled={rescheduleMutation.isPending || !reminderToReschedule}
                onClick={() => {
                  if (!reminderToReschedule) return;
                  rescheduleMutation.mutate(
                    { reminderId: reminderToReschedule.id, minutes },
                    { onSettled: () => setReminderToReschedule(null) }
                  );
                }}
              >
                Dans {minutes} min
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReminderToReschedule(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!reminderToDelete} onOpenChange={(open) => { if (!open) setReminderToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le rappel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera définitivement le rappel{" "}
              {reminderToDelete ? `#${reminderToDelete.id}` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!reminderToDelete) return;
                deleteMutation.mutate(reminderToDelete.id, {
                  onSettled: () => setReminderToDelete(null),
                });
              }}
              disabled={deleteMutation.isPending}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

