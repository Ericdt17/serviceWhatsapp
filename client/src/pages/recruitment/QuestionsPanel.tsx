/**
 * Sheet latéral — questions d'une offre (CRUD)
 */

import { useState, useEffect } from "react";
import {
  useJobQuestions,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
} from "@/hooks/useRecruitment";
import type { JobQuestion, QuestionType } from "@/services/recruitment";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Rows3, X } from "lucide-react";
import {
  recruitmentThClass,
  useRecruitmentTableDensity,
} from "./useRecruitmentTableDensity";

const QUESTIONS_TABLE_DENSITY_KEY = "recruitment-questions-panel-table-density";

function normalizeOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x));
  }
  return [];
}

interface QuestionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: number | null;
  jobTitle: string;
}

export function QuestionsPanel({
  open,
  onOpenChange,
  jobId,
  jobTitle,
}: QuestionsPanelProps) {
  const [density, setDensity] = useRecruitmentTableDensity(
    QUESTIONS_TABLE_DENSITY_KEY
  );
  const { data: questions = [], isLoading } = useJobQuestions(
    jobId ?? undefined,
    open
  );
  const createQ = useCreateQuestion();
  const updateQ = useUpdateQuestion();
  const deleteQ = useDeleteQuestion();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JobQuestion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobQuestion | null>(null);

  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("text");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isRequired, setIsRequired] = useState(true);
  const [orderIndex, setOrderIndex] = useState(0);

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setQuestionText(editing.question_text);
      setQuestionType(editing.question_type);
      const opts = normalizeOptions(editing.options);
      setOptions(
        editing.question_type === "mcq"
          ? opts.length >= 2
            ? opts
            : ["", ""]
          : ["", ""]
      );
      setIsRequired(editing.is_required);
      setOrderIndex(editing.order_index);
    } else {
      setQuestionText("");
      setQuestionType("text");
      setOptions(["", ""]);
      setIsRequired(true);
      setOrderIndex(0);
    }
  }, [dialogOpen, editing]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(q: JobQuestion) {
    setEditing(q);
    setDialogOpen(true);
  }

  function addOption() {
    setOptions((o) => [...o, ""]);
  }

  function removeOption(i: number) {
    setOptions((o) => o.filter((_, idx) => idx !== i));
  }

  function setOptionAt(i: number, v: string) {
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  }

  async function handleSave() {
    if (!jobId || !questionText.trim()) return;
    const trimmed = questionText.trim();
    if (questionType === "mcq") {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) return;
      const payload = {
        question_text: trimmed,
        question_type: "mcq" as const,
        options: cleaned,
        is_required: isRequired,
        order_index: orderIndex,
      };
      if (editing) {
        await updateQ.mutateAsync({
          questionId: editing.id,
          jobId,
          data: payload,
        });
      } else {
        await createQ.mutateAsync({ jobId, data: payload });
      }
    } else {
      const payload = {
        question_text: trimmed,
        question_type: "text" as const,
        options: null,
        is_required: isRequired,
        order_index: orderIndex,
      };
      if (editing) {
        await updateQ.mutateAsync({
          questionId: editing.id,
          jobId,
          data: payload,
        });
      } else {
        await createQ.mutateAsync({ jobId, data: payload });
      }
    }
    setDialogOpen(false);
    setEditing(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || !jobId) return;
    await deleteQ.mutateAsync({
      questionId: deleteTarget.id,
      jobId,
    });
    setDeleteTarget(null);
  }

  const saveDisabled =
    !questionText.trim() ||
    (questionType === "mcq" &&
      options.map((o) => o.trim()).filter(Boolean).length < 2);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col min-h-0">
          <SheetHeader>
            <SheetTitle>Questions — {jobTitle}</SheetTitle>
            <SheetDescription>
              Définissez les champs du formulaire de candidature pour cette offre.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3 mt-4">
            <Button onClick={openCreate} className="w-full sm:w-auto" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une question
            </Button>
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
                      <TableHead
                        className={cn(
                          recruitmentThClass,
                          "w-[72px] tabular-nums text-right"
                        )}
                      >
                        Ordre
                      </TableHead>
                      <TableHead className={cn(recruitmentThClass, "min-w-[12rem]")}>
                        Question
                      </TableHead>
                      <TableHead className={cn(recruitmentThClass, "w-[110px]")}>
                        Type
                      </TableHead>
                      <TableHead className={cn(recruitmentThClass, "w-[120px]")}>
                        Contrainte
                      </TableHead>
                      <TableHead
                        className={cn(
                          recruitmentThClass,
                          "text-right w-[100px]"
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
                          <TableCell className="text-right">
                            <Skeleton className="ml-auto h-4 w-6" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full max-w-[240px]" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-6 w-14" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-6 w-20" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Skeleton className="ml-auto h-8 w-16" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : questions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="p-8 text-center text-muted-foreground"
                        >
                          Aucune question pour cette offre.
                        </TableCell>
                      </TableRow>
                    ) : (
                      questions.map((q) => (
                        <TableRow
                          key={q.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => openEdit(q)}
                        >
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {q.order_index}
                          </TableCell>
                          <TableCell className="font-medium max-w-[min(20rem,55vw)]">
                            <span className="line-clamp-2">{q.question_text}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {q.question_type === "mcq" ? "QCM" : "Texte libre"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {q.is_required ? (
                              <Badge variant="outline">Obligatoire</Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                              >
                                Facultatif
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(q);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(q);
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
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier la question" : "Nouvelle question"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Ajustez le texte, le type ou les options du QCM."
                : "Ajoutez une question à afficher sur le formulaire de candidature."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={3}
                placeholder="Texte de la question"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={questionType}
                onValueChange={(v) => setQuestionType(v as QuestionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texte libre</SelectItem>
                  <SelectItem value="mcq">QCM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {questionType === "mcq" && (
              <div className="space-y-2">
                <Label>Options (min. 2)</Label>
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => setOptionAt(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                      />
                      {options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(i)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter une option
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="req">Obligatoire</Label>
              <Switch
                id="req"
                checked={isRequired}
                onCheckedChange={setIsRequired}
              />
            </div>
            <div className="space-y-2">
              <Label>Ordre d&apos;affichage</Label>
              <Input
                type="number"
                min={0}
                value={orderIndex}
                onChange={(e) => setOrderIndex(parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saveDisabled}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les réponses associées seront
              supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
