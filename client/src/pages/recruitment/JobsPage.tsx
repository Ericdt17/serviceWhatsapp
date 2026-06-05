/**
 * Recrutement — gestion des offres d'emploi
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  useAdminJobs,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
} from "@/hooks/useRecruitment";
import type { AdminJobOffer } from "@/services/recruitment";
import { ApiError } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { Briefcase, Plus, Pencil, Trash2, MessageSquareText, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { QuestionsPanel } from "./QuestionsPanel";
import {
  recruitmentThClass,
  useRecruitmentTableDensity,
} from "./useRecruitmentTableDensity";

const JOBS_TABLE_DENSITY_KEY = "recruitment-jobs-table-density";

const JOB_TYPE_MAX_LEN = 50;

function JobFormFields({
  title,
  setTitle,
  type,
  setType,
  description,
  setDescription,
  location,
  setLocation,
  slots,
  setSlots,
  isOpen,
  setIsOpen,
}: {
  title: string;
  setTitle: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  slots: number;
  setSlots: (v: number) => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="job-title">Titre *</Label>
        <Input
          id="job-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Intitulé du poste"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="job-type">Type de poste *</Label>
        <Input
          id="job-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          maxLength={JOB_TYPE_MAX_LEN}
          placeholder="Ex. Livreur, Agent commercial, Magasinier…"
        />
        <p className="text-xs text-muted-foreground">
          {type.length}/{JOB_TYPE_MAX_LEN} caractères
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="job-desc">Description</Label>
        <Textarea
          id="job-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="job-loc">Localisation</Label>
        <Input
          id="job-loc"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="job-slots">Nombre de postes</Label>
        <Input
          id="job-slots"
          type="number"
          min={1}
          value={slots}
          onChange={(e) => setSlots(parseInt(e.target.value, 10) || 1)}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="job-open">Offre ouverte</Label>
        <Switch id="job-open" checked={isOpen} onCheckedChange={setIsOpen} />
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [density, setDensity] = useRecruitmentTableDensity(JOBS_TABLE_DENSITY_KEY);
  const { data: jobs = [], isLoading } = useAdminJobs();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminJobOffer | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("Hippodrome, Yaoundé");
  const [slots, setSlots] = useState(1);
  const [isOpen, setIsOpen] = useState(true);

  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questionsJob, setQuestionsJob] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminJobOffer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setType("");
    setDescription("");
    setLocation("Hippodrome, Yaoundé");
    setSlots(1);
    setIsOpen(true);
    setDialogOpen(true);
  }

  function openEdit(row: AdminJobOffer) {
    setEditing(row);
    setTitle(row.title);
    setType(row.type);
    setDescription(row.description ?? "");
    setLocation(row.location);
    setSlots(row.slots);
    setIsOpen(row.is_open);
    setDialogOpen(true);
  }

  async function handleSaveJob() {
    const t = title.trim();
    const typeTrim = type.trim();
    if (!t || !typeTrim) return;
    if (editing) {
      await updateJob.mutateAsync({
        id: editing.id,
        data: {
          title: t,
          type: typeTrim,
          description: description || null,
          location,
          slots,
          is_open: isOpen,
        },
      });
    } else {
      await createJob.mutateAsync({
        title: t,
        type: typeTrim,
        description: description || null,
        location,
        slots,
        is_open: isOpen,
      });
    }
    setDialogOpen(false);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteJob.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 400) {
        setDeleteError(
          e.message ||
            "Impossible de supprimer une offre avec des candidatures existantes."
        );
      } else {
        const msg =
          e instanceof Error ? e.message : "Suppression impossible";
        toast.error("Erreur", { description: msg });
      }
    }
  }

  const saveDisabled =
    !title.trim() ||
    !type.trim() ||
    createJob.isPending ||
    updateJob.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Briefcase className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Recrutement</h1>
            <p className="text-muted-foreground">
              Gérez les offres d&apos;emploi et leurs questions
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle offre
        </Button>
      </div>

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
                <TableHead className={cn(recruitmentThClass, "min-w-[10rem]")}>
                  Titre
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "w-[100px]")}>
                  Type
                </TableHead>
                <TableHead
                  className={cn(recruitmentThClass, "text-right tabular-nums w-[90px]")}
                >
                  Postes
                </TableHead>
                <TableHead
                  className={cn(recruitmentThClass, "text-right tabular-nums w-[120px]")}
                >
                  Candidatures
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "min-w-[100px]")}>
                  Statut
                </TableHead>
                <TableHead
                  className={cn(
                    recruitmentThClass,
                    "text-right w-[200px] min-w-[180px]"
                  )}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-8" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-32" />
                    </TableCell>
                  </TableRow>
                ))
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    Aucune offre pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((row) => (
                  <TableRow
                    key={row.id}
                    className="group hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell className="max-w-[10rem]">
                      <Badge variant="secondary" className="font-normal max-w-full truncate">
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.slots}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.application_count ?? 0}
                    </TableCell>
                    <TableCell>
                      {row.is_open ? (
                        <Badge className="bg-green-600 hover:bg-green-600">
                          Ouvert
                        </Badge>
                      ) : (
                        <Badge variant="outline">Fermé</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex justify-end gap-1 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuestionsJob({ id: row.id, title: row.title });
                            setQuestionsOpen(true);
                          }}
                        >
                          <MessageSquareText className="w-4 h-4 mr-1" />
                          Questions
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(row);
                          }}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier l'offre" : "Nouvelle offre"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifiez les champs puis enregistrez."
                : "Renseignez les informations du poste à publier."}
            </DialogDescription>
          </DialogHeader>
          <JobFormFields
            title={title}
            setTitle={setTitle}
            type={type}
            setType={setType}
            description={description}
            setDescription={setDescription}
            location={location}
            setLocation={setLocation}
            slots={slots}
            setSlots={setSlots}
            isOpen={isOpen}
            setIsOpen={setIsOpen}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveJob} disabled={saveDisabled}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette offre ?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Cette action est irréversible. Les questions associées seront
                supprimées si aucune candidature n&apos;existe.
              </span>
              {deleteError && (
                <span className="block text-destructive font-medium">
                  {deleteError}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={deleteJob.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuestionsPanel
        open={questionsOpen}
        onOpenChange={(o) => {
          setQuestionsOpen(o);
          if (!o) setQuestionsJob(null);
        }}
        jobId={questionsJob?.id ?? null}
        jobTitle={questionsJob?.title ?? ""}
      />
    </div>
  );
}
