/**
 * Agencies Page
 * Super admin only - manage agencies
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAgency } from "@/contexts/AgencyContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getAgencies, createAgency, updateAgency, deleteAgency, generateAgencyCode, type Agency, type CreateAgencyRequest } from "@/services/agencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Edit, Trash2, RefreshCw, Eye } from "lucide-react";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

type MutErr = Error & { data?: { message?: string } };

function AgenciesPage() {
  const { isSuperAdmin } = useAuth();
  const { selectedAgencyId, setSelectedAgencyId } = useAgency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [formData, setFormData] = useState<CreateAgencyRequest>({
    name: "",
    email: "",
    password: "",
    role: "agency",
    is_active: true,
    agency_code: null,
  });

  const { data: agencies = [], isLoading } = useQuery({
    queryKey: ["agencies"],
    queryFn: getAgencies,
    enabled: isSuperAdmin,
  });

  const createMutation = useMutation({
    mutationFn: createAgency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", email: "", password: "", role: "agency", is_active: true, agency_code: null });
      toast.success("Agence créée avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error.message || "Erreur lors de la création de l'agence");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAgencyRequest> }) =>
      updateAgency(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      setIsEditDialogOpen(false);
      setSelectedAgency(null);
      toast.success("Agence mise à jour avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error.message || "Erreur lors de la mise à jour");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAgency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      setIsDeleteDialogOpen(false);
      setSelectedAgency(null);
      toast.success("Agence supprimée avec succès");
    },
    onError: (error: MutErr) => {
      toast.error(error.message || "Erreur lors de la suppression");
    },
  });

  const handleCreate = () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    // Prepare data: convert empty string to null for agency_code
    const agencyCode = formData.agency_code;
    const createData = {
      ...formData,
      agency_code: agencyCode && agencyCode.trim() ? agencyCode.trim() : null,
    };
    
    createMutation.mutate(createData);
  };

  const handleEdit = (agency: Agency) => {
    setSelectedAgency(agency);
    setFormData({
      name: agency.name,
      email: agency.email,
      password: "", // Don't pre-fill password
      role: agency.role,
      is_active: agency.is_active,
      agency_code: agency.agency_code || null,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedAgency || !formData.name || !formData.email) {
      toast.error("Veuillez remplir tous les champs requis");
      return;
    }
    const updateData: Partial<CreateAgencyRequest> & { password?: string } = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      is_active: formData.is_active,
    };
    if (formData.password) {
      updateData.password = formData.password;
    }
    // Handle agency_code: always include it explicitly, convert empty string to null, trim if provided
    // This ensures agency_code is always sent, even if null
    const agencyCodeValue = formData.agency_code;
    if (agencyCodeValue && typeof agencyCodeValue === 'string' && agencyCodeValue.trim()) {
      updateData.agency_code = agencyCodeValue.trim();
    } else {
      updateData.agency_code = null; // Explicitly set to null
    }
    
    updateMutation.mutate({ id: selectedAgency.id, data: updateData });
  };

  const handleDelete = (agency: Agency) => {
    setSelectedAgency(agency);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedAgency) {
      deleteMutation.mutate(selectedAgency.id);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Accès refusé. Super administrateur requis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agences</h1>
          <p className="text-muted-foreground">
            Gérez les agences et leurs comptes
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle agence
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une nouvelle agence</DialogTitle>
              <DialogDescription>
                Créez un compte pour une nouvelle agence
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom de l'agence</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nom de l'agence"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agency_code">Code Agence (optionnel)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="agency_code"
                      value={formData.agency_code || ""}
                      onChange={(e) => setFormData({ ...formData, agency_code: e.target.value || null })}
                      placeholder="Ex: ABC123"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const generatedCode = generateAgencyCode();
                        setFormData({ ...formData, agency_code: generatedCode });
                        toast.success(`Code généré: ${generatedCode}`);
                      }}
                      className="shrink-0"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Auto Générer
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Code utilisé pour lier les prestataires WhatsApp à cette agence. Minimum 4 caractères alphanumériques.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rôle</Label>
                <select
                  id="role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as "agency" | "super_admin",
                    })
                  }
                >
                    <option value="agency">Agence</option>
                    <option value="super_admin">Super Administrateur</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
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

      {isLoading ? (
        <div className="text-center py-8">Chargement...</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Code Agence</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date de création</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Aucune agence trouvée
                  </TableCell>
                </TableRow>
              ) : (
                agencies.map((agency) => (
                  <TableRow 
                    key={agency.id}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedAgencyId === agency.id ? "bg-primary/10 border-l-4 border-l-primary" : ""
                    }`}
                    onClick={() => {
                      setSelectedAgencyId(agency.id);
                      navigate("/");
                    }}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {agency.name}
                        {selectedAgencyId === agency.id && (
                          <Badge variant="default" className="text-xs">
                            Sélectionné
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{agency.email}</TableCell>
                    <TableCell>
                      {agency.agency_code ? (
                        <Badge variant="outline" className="font-mono">
                          {agency.agency_code}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={agency.role === "super_admin" ? "default" : "secondary"}>
                        {agency.role === "super_admin" ? "Super Admin" : "Agence"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={agency.is_active ? "default" : "destructive"}>
                        {agency.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(agency.created_at).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedAgencyId(agency.id);
                            navigate("/");
                          }}
                          title="Voir le tableau de bord"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(agency)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(agency)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'agence</DialogTitle>
            <DialogDescription>
              Modifiez les informations de l'agence
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom de l'agence</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-agency_code">Code Agence (optionnel)</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-agency_code"
                  value={formData.agency_code || ""}
                  onChange={(e) => setFormData({ ...formData, agency_code: e.target.value || null })}
                  placeholder="Ex: ABC123 (laisser vide pour supprimer)"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const generatedCode = generateAgencyCode();
                    setFormData({ ...formData, agency_code: generatedCode });
                    toast.success(`Code généré: ${generatedCode}`);
                  }}
                  className="shrink-0"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Auto Générer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Code utilisé pour lier les prestataires WhatsApp. Laissez vide pour supprimer le code.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
              <Input
                id="edit-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Actif</Label>
              <Switch
                id="edit-active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
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

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action désactivera l'agence "{selectedAgency?.name}". 
              L'agence ne pourra plus se connecter, mais les données seront conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="gap-2 bg-destructive text-destructive-foreground"
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

export default function Agencies() {
  return (
    <ProtectedRoute requireSuperAdmin>
      <AgenciesPage />
    </ProtectedRoute>
  );
}

