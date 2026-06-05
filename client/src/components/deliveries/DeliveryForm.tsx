/**
 * Delivery Form Component
 * Form for creating and editing deliveries with validation
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { type FrontendDelivery } from "@/lib/data-transform";
import { mapStatusToBackend, mapStatusToFrontend } from "@/lib/data-transform";
import { useCreateDelivery, useUpdateDelivery } from "@/hooks/useDeliveries";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { useQuery } from "@tanstack/react-query";
import { getGroups, getGroupById } from "@/services/groups";

const formatPhoneForDisplay = (value: string): string => {
  if (!value) return "";
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return hasPlus ? "+" : "";

  // Group digits in blocks of 3 for simple, country-agnostic readability.
  const grouped = digitsOnly.match(/.{1,3}/g)?.join(" ") ?? digitsOnly;
  return hasPlus ? `+${grouped}` : grouped;
};

const normalizePhoneForSubmit = (value: string): string =>
  value.replace(/\s+/g, "").trim();

const toSafeNumber = (value: string | number | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("fr-FR").format(value) + " FCFA";

// Form validation schema
const deliveryFormSchema = z.object({
  telephone: z.string()
    .min(1, "Le numéro de téléphone est requis")
    .regex(/^[\d\s+-]+$/, "Format de téléphone invalide"),
  quartier: z.string().optional(),
  produits: z.string()
    .min(1, "Les produits sont requis"),
  montant_total: z.union([
    z.number().min(0, "Le montant doit être positif"),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error("Montant invalide");
      return num;
    })
  ]),
  montant_encaisse: z.union([
    z.number().min(0, "Le montant encaissé doit être positif"),
    z.string().transform((val) => {
      if (!val || val === "") return 0;
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error("Montant invalide");
      return num;
    })
  ]).optional().default(0),
  frais_livraison: z.union([
    z.number().min(0, "Le frais de livraison doit être positif"),
    z.string().transform((val) => {
      if (!val || val === "") return undefined;
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error("Montant invalide");
      return num;
    })
  ]).optional(),
  statut: z.enum(["en_cours", "livré", "annulé", "renvoyé", "pickup", "expedition", "client_absent", "injoignable", "ne_decroche_pas"]).optional(),
  instructions: z.string().optional(),
  carrier: z.string().optional(),
  groupe: z.union([
    z.number().int().positive(),
    z.string().transform((val) => {
      if (val === "none" || !val) return undefined;
      const num = parseInt(val);
      return isNaN(num) ? undefined : num;
    })
  ]).optional(),
});

type DeliveryFormValues = z.infer<typeof deliveryFormSchema>;

interface DeliveryFormProps {
  delivery?: FrontendDelivery;
  groupId?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DeliveryForm({ delivery, groupId, onSuccess, onCancel }: DeliveryFormProps) {
  const isEditMode = !!delivery;
  const createMutation = useCreateDelivery();
  const updateMutation = useUpdateDelivery();
  
  // State local pour permettre de vider complètement le champ frais_livraison
  const [feeInputValue, setFeeInputValue] = useState<string>('');

  // Determine if we need to show the group select (only in create mode without groupId)
  const isGroupSelectEnabled = !isEditMode && !groupId;

  // Fetch groups for select dropdown (only in create mode without groupId)
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
    enabled: isGroupSelectEnabled,
  });

  // Fetch group info if groupId is provided OR if delivery has a group_id (for edit mode)
  const groupIdToFetch = groupId || delivery?.group_id;
  const shouldFetchGroup = !!groupIdToFetch;

  const { data: group } = useQuery({
    queryKey: ["group", groupIdToFetch],
    queryFn: () => getGroupById(groupIdToFetch!),
    enabled: shouldFetchGroup,
  });

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliveryFormSchema),
    defaultValues: delivery ? {
      telephone: formatPhoneForDisplay(delivery.telephone),
      quartier: delivery.quartier,
      produits: delivery.produits,
      montant_total: delivery.montant_total,
      montant_encaisse: delivery.montant_encaisse,
      frais_livraison: delivery.frais_livraison,
      statut: delivery.statut,
      instructions: delivery.instructions,
      carrier: delivery.carrier || undefined,
      groupe: delivery.group_id || undefined,
    } : {
      telephone: "",
      quartier: "",
      produits: "",
      montant_total: 0,
      montant_encaisse: 0,
      frais_livraison: undefined,
      statut: "en_cours",
      instructions: "",
      carrier: undefined,
      groupe: groupId || undefined,
    },
  });

  // Synchroniser le state local avec la valeur du formulaire
  const feeValue = form.watch('frais_livraison');
  const watchedMontantTotal = form.watch("montant_total");
  const watchedMontantEncaisse = form.watch("montant_encaisse");

  const remainingBalance = Math.max(
    0,
    toSafeNumber(watchedMontantTotal) - toSafeNumber(watchedMontantEncaisse)
  );

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (feeValue !== undefined && feeValue !== null) {
      setFeeInputValue(String(feeValue));
    } else {
      setFeeInputValue('');
    }
  }, [feeValue]);

  const onSubmit = async (values: DeliveryFormValues) => {
    try {
      // Transform frontend values to backend format
      const backendData = {
        phone: normalizePhoneForSubmit(values.telephone),
        items: values.produits,
        amount_due: typeof values.montant_total === 'string' 
          ? parseFloat(values.montant_total) 
          : values.montant_total,
        amount_paid: typeof values.montant_encaisse === 'string'
          ? parseFloat(values.montant_encaisse) || 0
          : values.montant_encaisse || 0,
        status: values.statut ? mapStatusToBackend(values.statut) : 'pending',
        quartier: values.quartier || undefined,
        notes: values.instructions || undefined,
        carrier: values.carrier || undefined,
        delivery_fee: values.frais_livraison !== undefined && values.frais_livraison !== null
          ? (typeof values.frais_livraison === 'string'
              ? parseFloat(values.frais_livraison) || undefined
              : values.frais_livraison)
          : undefined,
        group_id: groupId || values.groupe || undefined,
      };

      if (isEditMode && delivery) {
        await updateMutation.mutateAsync({
          id: delivery.id,
          data: backendData,
        });
      } else {
        await createMutation.mutateAsync(backendData);
      }

      onSuccess?.();
    } catch (error) {
      // Error is handled by the mutation hooks
      console.error('Form submission error:', error);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Section A: Contact et localisation */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Contact et localisation</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Téléphone */}
          <FormField
            control={form.control}
            name="telephone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Téléphone *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="+225 690 123 456" 
                    {...field} 
                    onChange={(e) => field.onChange(formatPhoneForDisplay(e.target.value))}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Quartier */}
          <FormField
            control={form.control}
            name="quartier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quartier</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Ex: Akwa, Logbaba..." 
                    {...field} 
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        </div>

        {/* Prestataire */}
        {isEditMode || groupId ? (
          (() => {
            const currentGroupId = groupId || delivery?.group_id;
            let groupName = "Aucun prestataire";
            if (currentGroupId) {
              if (group?.name) {
                groupName = group.name;
              } else if (delivery?.group_name) {
                groupName = delivery.group_name;
              } else {
                groupName = `Prestataire #${currentGroupId}`;
              }
            }
            return (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Prestataire</p>
                  <Badge variant="outline">{groupName}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isEditMode
                    ? "Le prestataire ne peut pas etre modifie lors de l'edition."
                    : "Ce prestataire est fixe pour cette page."}
                </p>
              </div>
            );
          })()
        ) : (
          // Création sans groupId → Select pour choisir
          <FormField
            control={form.control}
            name="groupe"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prestataire</FormLabel>
                <Select 
                  onValueChange={(value) => field.onChange(value === "none" ? undefined : parseInt(value))} 
                  value={field.value?.toString() || "none"}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un prestataire" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Aucun prestataire</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Section B: Produits et financier */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Produits et financier</h4>
          <FormField
            control={form.control}
            name="produits"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Produits *</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Description des produits a livrer"
                    {...field}
                    disabled={isLoading}
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="rounded-lg border border-border bg-muted/10 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Equilibre financier
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Montant total */}
          <FormField
            control={form.control}
            name="montant_total"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant total (FCFA) *</FormLabel>
                <FormControl>
                  <Input 
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    {...field}
                    value={field.value || ''}
                    onChange={(e) => {
                      const cleanedValue = e.target.value.replace(/\s/g, ''); // Enlever tous les espaces
                      field.onChange(parseFloat(cleanedValue) || 0);
                    }}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Montant encaissé */}
          <FormField
            control={form.control}
            name="montant_encaisse"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant encaissé (FCFA)</FormLabel>
                <FormControl>
                  <Input 
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    {...field}
                    value={field.value || ''}
                    onChange={(e) => {
                      const cleanedValue = e.target.value.replace(/\s/g, ''); // Enlever tous les espaces
                      field.onChange(parseFloat(cleanedValue) || 0);
                    }}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

              {/* Frais de livraison (optionnel) */}
              <FormField
                control={form.control}
                name="frais_livraison"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>Frais de livraison (FCFA)</FormLabel>
                      {isEditMode && delivery?.tarif_non_applique && (
                        <Badge variant="outline" className="text-warning border-warning/40">
                          Tarif non applique
                        </Badge>
                      )}
                    </div>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="Auto si vide"
                        value={feeInputValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFeeInputValue(val);
                          if (val === "" || val.trim() === "") {
                            field.onChange(undefined);
                          } else {
                            const numValue = parseFloat(val);
                            if (!isNaN(numValue) && numValue >= 0) {
                              field.onChange(numValue);
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val === "") {
                            setFeeInputValue("");
                            field.onChange(undefined);
                          } else {
                            const numValue = parseFloat(val);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setFeeInputValue(String(numValue));
                              field.onChange(numValue);
                            } else {
                              setFeeInputValue("");
                              field.onChange(undefined);
                            }
                          }
                          field.onBlur();
                        }}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="mt-4 rounded-md border border-border bg-card p-3">
              <p className="text-sm font-medium">
                {remainingBalance > 0
                  ? `Reste a encaisser: ${formatCurrency(remainingBalance)}`
                  : "Solde: Entierement regle"}
              </p>
            </div>
          </div>
        </div>

        {/* Section C: Logistique (zone d'action) */}
        <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <h4 className="text-sm font-semibold text-foreground">Logistique (action)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Statut */}
          <FormField
            control={form.control}
            name="statut"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Statut</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un statut" />
                    </SelectTrigger>
                  </FormControl>
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
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Transporteur (for expeditions) */}
          <FormField
            control={form.control}
            name="carrier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Transporteur</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Nom du transporteur"
                    {...field} 
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        </div>

        {/* Instructions */}
        <FormField
          control={form.control}
          name="instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Instructions speciales pour la livraison" 
                  {...field} 
                  disabled={isLoading}
                  rows={2}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sticky Form Actions */}
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-background px-1 pt-4">
          <div className="flex justify-end gap-3">
          {onCancel && (
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              disabled={isLoading}
            >
              Annuler
            </Button>
          )}
          <Button type="submit" className="gap-2" disabled={isLoading || (isEditMode && !isDirty)}>
            {isLoading ? <LoadingSpinner size="sm" variant="icon" className="gap-0" /> : null}
            {isEditMode ? "Mettre a jour la livraison" : "Creer la livraison"}
          </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

