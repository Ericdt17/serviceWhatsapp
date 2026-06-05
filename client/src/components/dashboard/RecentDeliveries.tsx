import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgency } from "@/contexts/AgencyContext";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, Phone, MapPin } from "lucide-react";
import { getDeliveries } from "@/services/deliveries";
import { DeliveryForm } from "@/components/deliveries/DeliveryForm";
import type { FrontendDelivery } from "@/types/delivery";

const formatCurrency = (value: number | undefined | null) => {
  // Handle NaN, undefined, null, or invalid numbers
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat('fr-FR').format(numValue) + " FCFA";
};

export function RecentDeliveries() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedAgencyId } = useAgency();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<FrontendDelivery | null>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ['recentDeliveries', selectedAgencyId],
    queryFn: () => getDeliveries({ 
      page: 1, 
      limit: 5, 
      sortBy: 'created_at', 
      sortOrder: 'DESC',
      agency_id: selectedAgencyId || undefined,
    }),
    refetchOnWindowFocus: false,
  });

  const recentLivraisons = data?.deliveries || [];
  
  const handleEdit = (delivery: FrontendDelivery) => {
    setSelectedDelivery(delivery);
    setIsEditDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedDelivery(null);
  };

  const refetchDashboardData = () => {
    queryClient.invalidateQueries({ queryKey: ["recentDeliveries"] });
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
  };

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Livraisons récentes</h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate("/livraisons")}
          className="text-primary hover:text-primary/80"
        >
          Voir tout <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))
        ) : recentLivraisons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Aucune livraison récente</p>
          </div>
        ) : (
          recentLivraisons.map((livraison) => (
            <div 
              key={livraison.id}
              onClick={() => handleEdit(livraison)}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium truncate">{livraison.telephone}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="truncate">{livraison.quartier}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold">{formatCurrency(livraison.montant_total)}</p>
                  {livraison.restant > 0 && (
                    <p className="text-xs text-warning">Reste: {formatCurrency(livraison.restant)}</p>
                  )}
                </div>
                <StatusBadge statut={livraison.statut} />
              </div>
            </div>
          ))
        )}
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
                handleCloseDialog();
                refetchDashboardData();
              }}
              onCancel={handleCloseDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
