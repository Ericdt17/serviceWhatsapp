/**
 * Recrutement — gestion des candidatures
 */

import { useState, useEffect, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import {
  useApplications,
  useApplicationDetail,
  useUpdateApplication,
  useAdminJobs,
} from "@/hooks/useRecruitment";
import type {
  ApplicationRow,
  ApplicationStatus,
  ApplicationDetail,
} from "@/services/recruitment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Users, Eye, ExternalLink, Rows3 } from "lucide-react";
import { toast } from "sonner";
import {
  recruitmentThClass,
  useRecruitmentTableDensity,
} from "./useRecruitmentTableDensity";

const APPLICATIONS_TABLE_DENSITY_KEY = "recruitment-applications-table-density";

const FUNNEL_LABELS: Record<number, string> = {
  1: "1 - Candidature",
  2: "2 - Pré-sélection",
  3: "3 - Tests envoyés",
  4: "4 - Scoring",
  5: "5 - Interview",
  6: "6 - Intégration",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "Nouveau",
  in_review: "En cours",
  accepted: "Accepté",
  rejected: "Rejeté",
};

const TRANSPORT_LABELS: Record<string, string> = {
  scooter: "Scooter",
  velo: "Vélo",
  voiture: "Voiture",
  apied: "À pied",
};

const AVAIL_LABELS: Record<string, string> = {
  plein: "Temps plein",
  partiel: "Temps partiel",
  weekend: "Week-end",
};

function statusBadgeClass(s: ApplicationStatus) {
  switch (s) {
    case "new":
      return "bg-amber-500 hover:bg-amber-500 text-white border-transparent";
    case "in_review":
      return "bg-blue-600 hover:bg-blue-600 text-white border-transparent";
    case "accepted":
      return "bg-green-600 hover:bg-green-600 text-white border-transparent";
    case "rejected":
      return "bg-slate-500 hover:bg-slate-500 text-white border-transparent";
    default:
      return "";
  }
}

function funnelBadgeClass(step: number) {
  const hue = 200 + step * 8;
  return { backgroundColor: `hsl(${hue} 45% 42%)` };
}

interface EvalFormProps {
  detail: ApplicationDetail;
  onSave: (data: {
    status: ApplicationStatus;
    funnel_step: number;
    score: number | null;
    notes: string | null;
  }) => Promise<void>;
  isSaving: boolean;
}

function EvaluationForm({ detail, onSave, isSaving }: EvalFormProps) {
  const app = detail.application;
  const [status, setStatus] = useState<ApplicationStatus>(app.status);
  const [funnelStep, setFunnelStep] = useState(app.funnel_step);
  const [score, setScore] = useState<string>(
    app.score != null ? String(app.score) : ""
  );
  const [notes, setNotes] = useState(app.notes ?? "");

  useEffect(() => {
    setStatus(app.status);
    setFunnelStep(app.funnel_step);
    setScore(app.score != null ? String(app.score) : "");
    setNotes(app.notes ?? "");
  }, [app.id, app.status, app.funnel_step, app.score, app.notes]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let scoreNum: number | null = null;
    if (score.trim() !== "") {
      const n = parseInt(score, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 21) scoreNum = n;
      else {
        toast.error("Le score doit être un nombre entre 0 et 21");
        return;
      }
    }
    await onSave({
      status,
      funnel_step: funnelStep,
      score: scoreNum,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
      <h3 className="font-semibold text-sm">Évaluation</h3>
      <div className="space-y-2">
        <Label>Statut</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ApplicationStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Nouveau</SelectItem>
            <SelectItem value="in_review">En cours</SelectItem>
            <SelectItem value="accepted">Accepté</SelectItem>
            <SelectItem value="rejected">Rejeté</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Étape du funnel</Label>
        <Select
          value={String(funnelStep)}
          onValueChange={(v) => setFunnelStep(parseInt(v, 10))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {([1, 2, 3, 4, 5, 6] as const).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {FUNNEL_LABELS[n]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Score /21</Label>
        <Input
          type="number"
          min={0}
          max={21}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="0–21"
        />
      </div>
      <div className="space-y-2">
        <Label>Notes internes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
      </div>
      <Button type="submit" disabled={isSaving}>
        Enregistrer l&apos;évaluation
      </Button>
    </form>
  );
}

export default function ApplicationsPage() {
  const [density, setDensity] = useRecruitmentTableDensity(
    APPLICATIONS_TABLE_DENSITY_KEY
  );
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");

  const filters =
    jobFilter !== "all" || statusFilter !== "all" || funnelFilter !== "all"
      ? {
          ...(jobFilter !== "all" && { job_offer_id: Number(jobFilter) }),
          ...(statusFilter !== "all" && {
            status: statusFilter as ApplicationStatus,
          }),
          ...(funnelFilter !== "all" && {
            funnel_step: Number(funnelFilter),
          }),
        }
      : undefined;

  const { data: applications = [], isLoading } = useApplications(filters);
  const { data: jobs = [] } = useAdminJobs();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cvPreviewOpen, setCvPreviewOpen] = useState(false);
  const [coverLetterPreviewOpen, setCoverLetterPreviewOpen] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);

  const { data: detail, isLoading: detailLoading } = useApplicationDetail(
    selectedId ?? undefined,
    { enabled: sheetOpen && !!selectedId }
  );

  const updateApp = useUpdateApplication();

  function openDetail(row: ApplicationRow) {
    setSelectedId(row.id);
    setSheetOpen(true);
  }

  async function handleSaveEval(payload: {
    status: ApplicationStatus;
    funnel_step: number;
    score: number | null;
    notes: string | null;
  }) {
    if (!selectedId) return;
    await updateApp.mutateAsync({
      id: selectedId,
      data: payload,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Candidatures</h1>
          <p className="text-muted-foreground">
            Suivez et évaluez les candidatures reçues
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="space-y-1 min-w-[200px]">
          <Label className="text-xs">Offre</Label>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les offres</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>
                  {j.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[180px]">
          <Label className="text-xs">Statut</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="new">Nouveau</SelectItem>
              <SelectItem value="in_review">En cours</SelectItem>
              <SelectItem value="accepted">Accepté</SelectItem>
              <SelectItem value="rejected">Rejeté</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[200px]">
          <Label className="text-xs">Étape funnel</Label>
          <Select value={funnelFilter} onValueChange={setFunnelFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {([1, 2, 3, 4, 5, 6] as const).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {FUNNEL_LABELS[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                <TableHead className={cn(recruitmentThClass, "min-w-[8rem]")}>
                  Nom
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "w-[120px]")}>
                  Téléphone
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "min-w-[7rem]")}>
                  Quartier
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "min-w-[8rem] max-w-[160px]")}>
                  Poste
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "w-[100px]")}>
                  Transport
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "min-w-[9rem]")}>
                  Étape
                </TableHead>
                <TableHead
                  className={cn(recruitmentThClass, "text-right tabular-nums w-[72px]")}
                >
                  Score
                </TableHead>
                <TableHead className={cn(recruitmentThClass, "min-w-[100px]")}>
                  Statut
                </TableHead>
                <TableHead
                  className={cn(recruitmentThClass, "text-right w-[100px]")}
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
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-28" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : applications.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="p-8 text-center text-muted-foreground"
                  >
                    Aucune candidature.
                  </TableCell>
                </TableRow>
              ) : (
                applications.map((row) => (
                  <TableRow
                    key={row.id}
                    className="group cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openDetail(row)}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {row.full_name}
                    </TableCell>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.quartier ?? "—"}</TableCell>
                    <TableCell
                      className="max-w-[160px] truncate"
                      title={row.job_title}
                    >
                      {row.job_title}
                    </TableCell>
                    <TableCell>
                      {row.transport
                        ? TRANSPORT_LABELS[row.transport] ?? row.transport
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={funnelBadgeClass(row.funnel_step)}
                        className="text-white border-0 max-w-[14rem] truncate"
                      >
                        {FUNNEL_LABELS[row.funnel_step] ?? row.funnel_step}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.score ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(row.status)}>
                        {STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(row);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Voir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) {
            setSelectedId(null);
            setCvPreviewOpen(false);
            setCoverLetterPreviewOpen(false);
            setPhotoPreviewOpen(false);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Détail candidature</SheetTitle>
          </SheetHeader>
          {detailLoading || !detail ? (
            <div className="space-y-3 mt-6">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-6 mt-6">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Nom : </span>
                  {detail.application.full_name}
                </p>
                <p>
                  <span className="text-muted-foreground">Téléphone : </span>
                  {detail.application.phone}
                </p>
                <p>
                  <span className="text-muted-foreground">Quartier : </span>
                  {detail.application.quartier ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Transport : </span>
                  {detail.application.transport
                    ? TRANSPORT_LABELS[detail.application.transport] ??
                      detail.application.transport
                    : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Disponibilité : </span>
                  {detail.application.availability
                    ? AVAIL_LABELS[detail.application.availability] ??
                      detail.application.availability
                    : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Poste : </span>
                  {detail.application.job_title}
                </p>
                {detail.application.photo_url && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-2">Photo</p>
                    <div className="flex flex-wrap items-start gap-3">
                      <button
                        type="button"
                        className="shrink-0 overflow-hidden rounded-md border bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setPhotoPreviewOpen(true)}
                        aria-label="Agrandir la photo"
                      >
                        <img
                          src={detail.application.photo_url}
                          alt=""
                          className="h-20 w-20 object-cover"
                        />
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPhotoPreviewOpen(true)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Aperçu photo
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={detail.application.photo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ouvrir
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {detail.application.cv_url && (
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCvPreviewOpen(true)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Aperçu CV
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={detail.application.cv_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ouvrir
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
                {detail.application.cover_letter_url && (
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCoverLetterPreviewOpen(true)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Aperçu lettre
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={detail.application.cover_letter_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ouvrir
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Réponses aux questions</h3>
                {detail.answers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune réponse.</p>
                ) : (
                  <ul className="space-y-3 text-sm border rounded-md p-3">
                    {detail.answers.map((a) => (
                      <li key={a.id}>
                        <p className="font-medium text-foreground">
                          {a.question_text}
                        </p>
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          {a.answer_text ?? "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <EvaluationForm
                detail={detail}
                onSave={handleSaveEval}
                isSaving={updateApp.isPending}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aperçu de la photo</DialogTitle>
            <DialogDescription>
              Si l&apos;aperçu ne s&apos;affiche pas, utilisez « Ouvrir » dans le
              panneau latéral.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-auto rounded-md border bg-muted/20 p-2 flex items-center justify-center">
            {detail?.application.photo_url ? (
              <img
                src={detail.application.photo_url}
                alt="Photo du candidat"
                className="max-h-[70vh] w-auto max-w-full object-contain"
              />
            ) : (
              <div className="grid min-h-[200px] w-full place-items-center text-sm text-muted-foreground">
                Photo indisponible.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cvPreviewOpen} onOpenChange={setCvPreviewOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Aperçu du CV</DialogTitle>
            <DialogDescription>
              Si l&apos;aperçu ne s&apos;affiche pas, utilisez « Ouvrir ».
            </DialogDescription>
          </DialogHeader>
          <div className="h-[75vh] overflow-hidden rounded-md border bg-muted/20">
            {detail?.application.cv_url ? (
              <iframe
                title="Aperçu CV"
                src={`/api/v1/recruitment/admin/applications/${detail.application.id}/cv`}
                className="h-full w-full"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
                CV indisponible.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={coverLetterPreviewOpen}
        onOpenChange={setCoverLetterPreviewOpen}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Aperçu de la lettre de motivation</DialogTitle>
            <DialogDescription>
              Si l&apos;aperçu ne s&apos;affiche pas, utilisez « Ouvrir ».
            </DialogDescription>
          </DialogHeader>
          <div className="h-[75vh] overflow-hidden rounded-md border bg-muted/20">
            {detail?.application.cover_letter_url ? (
              <iframe
                title="Aperçu lettre de motivation"
                src={`/api/v1/recruitment/admin/applications/${detail.application.id}/cover-letter`}
                className="h-full w-full"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
                Lettre indisponible.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
