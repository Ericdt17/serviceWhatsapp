/**
 * Tarifs Page
 * Display and manage delivery tariffs (pricing per quartier/neighborhood)
 * Each agency manages their own tariffs
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTariffs, createTariff, updateTariff, deleteTariff, type Tariff, type CreateTariffRequest, formatTariffAmount } from "@/services/tariffs";
import { getAgencies, type Agency } from "@/services/agencies";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Receipt, Plus, Trash2, Edit, Upload, FileSpreadsheet, FileText, Search, Building2, X } from "lucide-react";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { importTariffs, type ImportResult } from "@/services/tariffs";
import * as XLSX from "xlsx";
import Papa from "papaparse";

interface PreviewRow {
  quartier: string;
  tarif_amount: number;
}

type MutErr = Error & { data?: { message?: string } };

export default function Tarifs() {
  const { user, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState<CreateTariffRequest>({
    quartier: "",
    tarif_amount: 0,
    agency_id: undefined,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgencyFilter, setSelectedAgencyFilter] = useState<number | null>(null);

  const { data: tariffs = [], isLoading } = useQuery({
    queryKey: ["tariffs"],
    queryFn: getTariffs,
  });

  // Fetch agencies for super admin dropdown
  const { data: agencies = [] } = useQuery({
    queryKey: ["agencies"],
    queryFn: getAgencies,
    enabled: isSuperAdmin,
  });

  // Filter tariffs by agency and quartier name
  const filteredTariffs = useMemo(() => {
    let filtered = tariffs;
    
    // Filtrer par agence si sélectionnée (super admin seulement)
    if (isSuperAdmin && selectedAgencyFilter) {
      filtered = filtered.filter((tariff) => tariff.agency_id === selectedAgencyFilter);
    }
    
    // Filtrer par recherche de quartier
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((tariff) =>
        tariff.quartier.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [tariffs, searchQuery, selectedAgencyFilter, isSuperAdmin]);

  const createMutation = useMutation({
    mutationFn: createTariff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariffs"] });
      setIsCreateDialogOpen(false);
      setFormData({
        quartier: "",
        tarif_amount: 0,
        agency_id: undefined,
      });
      toast.success("Tarif créé avec succès");
    },
    onError: (error: MutErr) => {
      const errorMessage = error?.data?.message || error?.message || "Erreur lors de la création du tarif";
      toast.error(errorMessage);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { quartier?: string; tarif_amount?: number } }) =>
      updateTariff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariffs"] });
      setIsEditDialogOpen(false);
      setSelectedTariff(null);
      toast.success("Tarif mis à jour avec succès");
    },
    onError: (error: MutErr) => {
      const errorMessage = error?.data?.message || error?.message || "Erreur lors de la mise à jour";
      toast.error(errorMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTariff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariffs"] });
      setIsDeleteDialogOpen(false);
      setSelectedTariff(null);
      toast.success("Tarif supprimé avec succès");
    },
    onError: (error: MutErr) => {
      const errorMessage = error?.data?.message || error?.message || "Erreur lors de la suppression";
      toast.error(errorMessage);
    },
  });

  const handleCreate = () => {
    if (!formData.quartier || !formData.quartier.trim()) {
      toast.error("Veuillez saisir un quartier");
      return;
    }
    if (!formData.tarif_amount || formData.tarif_amount <= 0) {
      toast.error("Veuillez saisir un montant valide");
      return;
    }
    if (isSuperAdmin && !formData.agency_id) {
      toast.error("Veuillez sélectionner une agence");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleEdit = (tariff: Tariff) => {
    setSelectedTariff(tariff);
    setFormData({
      quartier: tariff.quartier,
      tarif_amount: tariff.tarif_amount,
      agency_id: tariff.agency_id,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedTariff) return;
    if (!formData.quartier || !formData.quartier.trim()) {
      toast.error("Veuillez saisir un quartier");
      return;
    }
    if (!formData.tarif_amount || formData.tarif_amount <= 0) {
      toast.error("Veuillez saisir un montant valide");
      return;
    }
    updateMutation.mutate({
      id: selectedTariff.id,
      data: {
        quartier: formData.quartier,
        tarif_amount: formData.tarif_amount,
      },
    });
  };

  const handleDelete = (tariff: Tariff) => {
    setSelectedTariff(tariff);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedTariff) return;
    deleteMutation.mutate(selectedTariff.id);
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      setPreviewData([]);
      return;
    }

    const fileName = file.name.toLowerCase();
    let rows: PreviewRow[] = [];

    try {
      if (fileName.endsWith(".csv")) {
        // Parse CSV
        const text = await file.text();
        const parsePromise = new Promise<Papa.ParseResult<Record<string, unknown>>>((resolve, reject) => {
          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: resolve,
            error: reject,
          });
        });
        
        const results = await parsePromise;
        rows = results.data.map((row: Record<string, unknown>) => {
          const quartier = row.quartier || row.Quartier || row.QUARTIER || row.neighborhood || "";
          const tarifStr = row.tarif_amount || row.Tarif_Amount || row.tarif || row.montant || row.price || "0";
          return {
            quartier: String(quartier).trim(),
            tarif_amount: parseFloat(tarifStr) || 0,
          };
        }).filter((row) => row.quartier && row.tarif_amount > 0);
        
        setPreviewData(rows);
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        // Parse Excel
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        rows = data.map((row: Record<string, unknown>) => {
          const quartierKey = Object.keys(row).find(
            (key) => /quartier|neighborhood/i.test(key)
          ) || "quartier";
          const tarifKey = Object.keys(row).find(
            (key) => /tarif|montant|price|amount/i.test(key)
          ) || "tarif_amount";

          return {
            quartier: String(row[quartierKey] || "").trim(),
            tarif_amount: parseFloat(row[tarifKey] || "0") || 0,
          };
        }).filter((row) => row.quartier && row.tarif_amount > 0);

        setPreviewData(rows);
      } else {
        toast.error("Format de fichier non supporté. Utilisez CSV ou Excel.");
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
    } catch (error) {
      console.error("Error parsing file:", error);
      toast.error("Erreur lors de la lecture du fichier");
      setSelectedFile(null);
      setPreviewData([]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error("Veuillez sélectionner un fichier");
      return;
    }

    if (previewData.length === 0) {
      toast.error("Aucune donnée valide trouvée dans le fichier");
      return;
    }

    if (isSuperAdmin && !formData.agency_id) {
      toast.error("Veuillez sélectionner une agence");
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await importTariffs(selectedFile, formData.agency_id);
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["tariffs"] });
      
      if (result.errors.length === 0) {
        toast.success(`Import réussi: ${result.created} créés, ${result.updated} mis à jour`);
        setTimeout(() => {
          setIsImportDialogOpen(false);
          setSelectedFile(null);
          setPreviewData([]);
          setImportResult(null);
          setFormData({ ...formData, agency_id: undefined });
        }, 2000);
      } else {
        toast.warning(`Import partiel: ${result.created} créés, ${result.updated} mis à jour, ${result.errors.length} erreurs`);
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'importation");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tarifs de livraison</h1>
          <p className="text-muted-foreground">
            Gérez les tarifs de livraison par quartier
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => {
                setSelectedFile(null);
                setPreviewData([]);
                setImportResult(null);
                setFormData({ ...formData, agency_id: undefined });
              }}>
                <Upload className="w-4 h-4 mr-2" />
                Importer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importer des tarifs</DialogTitle>
                <DialogDescription>
                  Téléchargez un fichier CSV ou Excel avec les colonnes: quartier, tarif_amount
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {isSuperAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="import-agency_id">Agence *</Label>
                    <Select
                      value={formData.agency_id?.toString() || ""}
                      onValueChange={(value) =>
                        setFormData({ ...formData, agency_id: parseInt(value) })
                      }
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
                  <Label htmlFor="file-input">Fichier (CSV ou Excel) *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="file-input"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                      disabled={isImporting}
                    />
                    {selectedFile && (
                      <span className="text-sm text-muted-foreground">
                        {selectedFile.name}
                      </span>
                    )}
                  </div>
                </div>

                {previewData.length > 0 && (
                  <div className="space-y-2">
                    <Label>Aperçu des données ({previewData.length} lignes)</Label>
                    <div className="rounded-md border max-h-64 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Quartier</TableHead>
                            <TableHead className="text-right">Montant (FCFA)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.slice(0, 10).map((row, index) => (
                            <TableRow key={index}>
                              <TableCell>{row.quartier}</TableCell>
                              <TableCell className="text-right">
                                {formatTariffAmount(row.tarif_amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {previewData.length > 10 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground">
                                ... et {previewData.length - 10} autres lignes
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {importResult && (
                  <div className="space-y-2">
                    <Label>Résultats de l'importation</Label>
                    <div className="rounded-md border p-4 space-y-2">
                      <div className="flex justify-between">
                        <span>Total:</span>
                        <span className="font-semibold">{importResult.total}</span>
                      </div>
                      <div className="flex justify-between text-green-600">
                        <span>Créés:</span>
                        <span className="font-semibold">{importResult.created}</span>
                      </div>
                      <div className="flex justify-between text-blue-600">
                        <span>Mis à jour:</span>
                        <span className="font-semibold">{importResult.updated}</span>
                      </div>
                      {importResult.errors.length > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Erreurs:</span>
                          <span className="font-semibold">{importResult.errors.length}</span>
                        </div>
                      )}
                      {importResult.errors.length > 0 && (
                        <div className="mt-4 space-y-1 max-h-32 overflow-auto">
                          <Label className="text-sm">Détails des erreurs:</Label>
                          {importResult.errors.map((error, index) => (
                            <div key={index} className="text-sm text-red-600">
                              Ligne {error.row}: {error.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsImportDialogOpen(false);
                    setSelectedFile(null);
                    setPreviewData([]);
                    setImportResult(null);
                    setFormData({ ...formData, agency_id: undefined });
                  }}
                  disabled={isImporting}
                >
                  {importResult ? "Fermer" : "Annuler"}
                </Button>
                {!importResult && (
                  <Button
                    className="gap-2"
                    onClick={handleImport}
                    disabled={isImporting || !selectedFile || previewData.length === 0}
                  >
                    {isImporting ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
                    Importer
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({ quartier: "", tarif_amount: 0, agency_id: undefined })}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un tarif
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau tarif</DialogTitle>
              <DialogDescription>
                Définissez un tarif de livraison pour un quartier
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="agency_id">Agence</Label>
                  <Select
                    value={formData.agency_id?.toString() || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, agency_id: parseInt(value) })
                    }
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
                <Label htmlFor="quartier">Quartier *</Label>
                <Input
                  id="quartier"
                  placeholder="Ex: Bonanjo, Akwa, Makepe..."
                  value={formData.quartier}
                  onChange={(e) =>
                    setFormData({ ...formData, quartier: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tarif_amount">Montant (FCFA) *</Label>
                <Input
                  id="tarif_amount"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Ex: 2000"
                  value={formData.tarif_amount || ""}
                  onChange={(e) => {
                    const cleanedValue = e.target.value.replace(/\s/g, ''); // Enlever tous les espaces
                    setFormData({
                      ...formData,
                      tarif_amount: parseFloat(cleanedValue) || 0,
                    });
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                Annuler
              </Button>
              <Button className="gap-2" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom de quartier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Agency Filter (Super Admin only) */}
      {isSuperAdmin && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label htmlFor="agency-filter" className="text-sm font-medium whitespace-nowrap flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Filtrer par agence:
              </Label>
              <Select
                value={selectedAgencyFilter?.toString() || "all"}
                onValueChange={(value) => {
                  setSelectedAgencyFilter(value === "all" ? null : parseInt(value));
                }}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Toutes les agences" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les agences</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id.toString()}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAgencyFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAgencyFilter(null)}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Réinitialiser
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tariffs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Liste des tarifs
          </CardTitle>
          <CardDescription>
            {filteredTariffs.length} tarif{filteredTariffs.length > 1 ? "s" : ""} {searchQuery || selectedAgencyFilter ? "trouvé" : "enregistré"}{filteredTariffs.length > 1 ? "s" : ""}
            {(searchQuery || selectedAgencyFilter) && filteredTariffs.length !== tariffs.length && ` sur ${tariffs.length}`}
            {selectedAgencyFilter && ` pour l'agence ${agencies.find(a => a.id === selectedAgencyFilter)?.name}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTariffs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{searchQuery ? "Aucun tarif trouvé" : "Aucun tarif enregistré"}</p>
              <p className="text-sm mt-2">
                {searchQuery 
                  ? "Essayez avec un autre nom de quartier" 
                  : "Créez votre premier tarif pour commencer"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isSuperAdmin && <TableHead>Agence</TableHead>}
                    <TableHead>Quartier</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTariffs.map((tariff, index) => (
                    <TableRow key={tariff.id ?? `tariff-${index}`}>
                      {isSuperAdmin && (
                        <TableCell className="font-medium">
                          {tariff.agency_name || `Agence #${tariff.agency_id}`}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{tariff.quartier}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatTariffAmount(tariff.tarif_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(tariff)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(tariff)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le tarif</DialogTitle>
            <DialogDescription>
              Modifiez les informations du tarif
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-quartier">Quartier *</Label>
              <Input
                id="edit-quartier"
                placeholder="Ex: Bonanjo, Akwa, Makepe..."
                value={formData.quartier}
                onChange={(e) =>
                  setFormData({ ...formData, quartier: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tarif_amount">Montant (FCFA) *</Label>
              <Input
                id="edit-tarif_amount"
                type="number"
                min="0"
                step="100"
                placeholder="Ex: 2000"
                value={formData.tarif_amount || ""}
                onChange={(e) => {
                  const cleanedValue = e.target.value.replace(/\s/g, ''); // Enlever tous les espaces
                  setFormData({
                    ...formData,
                    tarif_amount: parseFloat(cleanedValue) || 0,
                  });
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={updateMutation.isPending}
            >
              Annuler
            </Button>
            <Button className="gap-2" onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le tarif</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le tarif pour le quartier "{selectedTariff?.quartier}" ?
              Cette action est irréversible.
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
              {deleteMutation.isPending ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

