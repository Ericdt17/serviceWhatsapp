import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  HandCoins,
  RefreshCw,
  Calendar,
  Users,
  ArrowRight,
  CircleAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAgency } from "@/contexts/AgencyContext";
import { getDeliveries } from "@/services/deliveries";
import { getGroups } from "@/services/groups";
import type { FrontendDelivery } from "@/types/delivery";
import { calculateStatsFromDeliveries } from "@/lib/stats-utils";
import { getDateRangeLocal, formatDateLocal } from "@/lib/date-utils";

const formatCurrency = (value: number | undefined | null) => {
  const numValue =
    typeof value === "number" && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR").format(numValue) + " FCFA";
};

function formatPercentShare(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "—";
  const pct = (part / total) * 100;
  if (pct >= 10) return `${Math.round(pct)} %`;
  return `${Math.round(pct * 10) / 10} %`;
}

/**
 * Même règle que le tableau de bord (carte « Partenaire ») et stats-utils.montantNetEncaisse :
 * livraisons « livré » ou « pickup » uniquement ; montant = somme des montant_encaisse (montant net à reverser).
 */
function countsTowardPartenaireNet(d: FrontendDelivery): boolean {
  return d.statut === "livré" || d.statut === "pickup";
}

interface PrestataireSettlementRow {
  groupId: number | null;
  label: string;
  countLivre: number;
  countPickup: number;
  /** Somme des frais_livraison sur les mêmes livraisons (livré + pickup) */
  totalTarifs: number;
  /** Somme des montant_encaisse (équivalent montantNetEncaisse par prestataire) */
  netPartenaire: number;
  /** Livraisons sur la période (tous statuts) avec tarif non appliqué pour ce prestataire */
  tarifNonAppliqueCount: number;
}

const Paiements = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const { selectedAgencyId } = useAgency();
  const [period, setPeriod] = useState<"jour" | "semaine" | "mois">("jour");

  const dateRange = useMemo(() => getDateRangeLocal(period), [period]);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
  });

  const groupMap = useMemo(() => {
    const m = new Map<number, string>();
    groups.forEach((g) => {
      if (g.id) m.set(g.id, g.name);
    });
    return m;
  }, [groups]);

  const {
    data: deliveriesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "deliveries",
      "prestataire-settlements",
      dateRange.startDate,
      dateRange.endDate,
      isSuperAdmin ? selectedAgencyId : "agency",
    ],
    queryFn: () =>
      getDeliveries({
        page: 1,
        limit: 5000,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy: "created_at",
        sortOrder: "DESC",
        agency_id: isSuperAdmin ? selectedAgencyId || undefined : undefined,
      }),
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const deliveriesInPeriod = useMemo(() => {
    if (!deliveriesData?.deliveries) return [];

    return deliveriesData.deliveries.filter((d) => {
      if (!d.date_creation) return false;
      const deliveryDate = new Date(
        typeof d.date_creation === "string" ? d.date_creation : d.date_creation
      );
      if (isNaN(deliveryDate.getTime())) return false;
      deliveryDate.setHours(0, 0, 0, 0);
      const deliveryDateStr = formatDateLocal(deliveryDate);

      if (period === "jour") {
        return deliveryDateStr === dateRange.startDate;
      }
      return (
        deliveryDateStr >= dateRange.startDate &&
        deliveryDateStr <= dateRange.endDate
      );
    });
  }, [deliveriesData, period, dateRange.startDate, dateRange.endDate]);

  /** Identique à la carte « Partenaire » du tableau de bord (calculateStatsFromDeliveries) */
  const periodStats = useMemo(
    () => calculateStatsFromDeliveries(deliveriesInPeriod),
    [deliveriesInPeriod]
  );

  const settlementRows: PrestataireSettlementRow[] = useMemo(() => {
    const tarifNonAppliqueByKey = new Map<string, number>();
    for (const d of deliveriesInPeriod) {
      if (!d.tarif_non_applique) continue;
      const gid = d.group_id ?? null;
      const flagKey = gid !== null ? `g:${gid}` : "none";
      tarifNonAppliqueByKey.set(
        flagKey,
        (tarifNonAppliqueByKey.get(flagKey) ?? 0) + 1
      );
    }

    const relevant = deliveriesInPeriod.filter(countsTowardPartenaireNet);
    const byKey = new Map<string, PrestataireSettlementRow>();

    for (const d of relevant) {
      const gid = d.group_id ?? null;
      const key = gid !== null ? `g:${gid}` : "none";
      let row = byKey.get(key);
      if (!row) {
        row = {
          groupId: gid,
          label:
            gid !== null && groupMap.has(gid)
              ? groupMap.get(gid)!
              : "Sans prestataire",
          countLivre: 0,
          countPickup: 0,
          totalTarifs: 0,
          netPartenaire: 0,
          tarifNonAppliqueCount: 0,
        };
        byKey.set(key, row);
      }
      if (d.statut === "livré") row.countLivre += 1;
      if (d.statut === "pickup") row.countPickup += 1;
      row.totalTarifs += Number(d.frais_livraison) || 0;
      row.netPartenaire += Number(d.montant_encaisse) || 0;
    }

    return Array.from(byKey.values())
      .map((row) => {
        const k = row.groupId !== null ? `g:${row.groupId}` : "none";
        return {
          ...row,
          tarifNonAppliqueCount: tarifNonAppliqueByKey.get(k) ?? 0,
        };
      })
      .sort((a, b) => b.netPartenaire - a.netPartenaire);
  }, [deliveriesInPeriod, groupMap]);

  const totalPartenaire = periodStats.montantNetEncaisse ?? 0;

  const prestatairesWithAmount = useMemo(
    () => settlementRows.filter((r) => r.netPartenaire > 0).length,
    [settlementRows]
  );

  const livraisonsComptees = useMemo(
    () =>
      deliveriesInPeriod.filter(countsTowardPartenaireNet).length,
    [deliveriesInPeriod]
  );

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["dailyStats"] });
    refetch();
  };

  const periodLabels = {
    jour: "Aujourd'hui",
    semaine: "Cette semaine",
    mois: "Ce mois",
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-8">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="stat-card">
              <Skeleton className="h-4 w-28 mb-2" />
              <Skeleton className="h-8 w-36" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (isError) {
    return <AppErrorExperience error={error} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Paiements prestataires</h1>
          <p className="text-muted-foreground">
            Même calcul que la carte <strong>Partenaire</strong> du tableau de bord —{" "}
            {periodLabels[period].toLowerCase()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshData} className="gap-2 shrink-0">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </Button>
      </div>

      <Tabs
        value={period}
        onValueChange={(v) => setPeriod(v as typeof period)}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="jour" className="gap-2">
            <Calendar className="w-4 h-4" />
            Jour
          </TabsTrigger>
          <TabsTrigger value="semaine" className="gap-2">
            <Calendar className="w-4 h-4" />
            Semaine
          </TabsTrigger>
          <TabsTrigger value="mois" className="gap-2">
            <Calendar className="w-4 h-4" />
            Mois
          </TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="mt-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              title="Partenaire (total)"
              value={formatCurrency(totalPartenaire)}
              icon={HandCoins}
              variant="success"
            />
            <StatCard
              title="Prestataires concernés"
              value={String(prestatairesWithAmount)}
              icon={Users}
              variant="info"
            />
            <StatCard
              title="Livrées + au bureau"
              value={String(livraisonsComptees)}
              icon={Calendar}
              variant="success"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Les montants sont les mêmes que sur la carte <strong>Partenaire</strong> du tableau de bord : uniquement les livraisons{" "}
            <strong>livrées</strong> et <strong>retirées au bureau</strong>. La colonne <strong>Livrées / Bureau</strong> indique
            d&apos;abord combien de livraisons ont été livrées, puis combien au bureau. Le <strong>% total</strong> montre la part
            de chaque prestataire dans le total de la période. Une <strong>icône rouge</strong> signale qu&apos;au moins une
            livraison n&apos;a pas reçu de tarif automatique — passez la souris dessus pour plus d&apos;infos.
          </p>

          <div className="stat-card overflow-hidden p-0">
            <div className="border-b border-border p-4">
              <h2 className="text-lg font-semibold">Répartition par prestataire</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Période du {dateRange.startDate} au {dateRange.endDate}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold min-w-[140px]">Prestataire</TableHead>
                    <TableHead className="font-semibold text-right w-[110px] whitespace-nowrap">
                      Livrées / Bureau
                    </TableHead>
                    <TableHead className="font-semibold text-right w-[140px] whitespace-nowrap">
                      Frais (tarifs)
                    </TableHead>
                    <TableHead className="font-semibold text-right w-[160px] whitespace-nowrap">
                      Net partenaire
                    </TableHead>
                    <TableHead className="font-semibold text-right w-[72px]">
                      % total
                    </TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlementRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                        Aucune livraison éligible sur cette période.
                      </TableCell>
                    </TableRow>
                  ) : (
                    settlementRows.map((row) => (
                      <TableRow key={row.groupId ?? "none"}>
                        <TableCell className="overflow-visible align-middle pt-1">
                          <div className="relative inline-block max-w-[min(100%,280px)]">
                            {row.tarifNonAppliqueCount > 0 ? (
                              <Tooltip delayDuration={200}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="absolute -left-2 -top-2 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-card text-red-600 shadow-sm outline-none hover:bg-muted/90 focus-visible:ring-2 focus-visible:ring-ring dark:text-red-400"
                                    aria-label="Frais de livraison non appliqués — voir l'info-bulle"
                                  >
                                    <CircleAlert className="size-3.5" strokeWidth={2.25} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="max-w-xs text-left">
                                  <p className="font-medium text-foreground">Frais non appliqués</p>
                                  <p className="mt-1 text-muted-foreground">
                                    {row.tarifNonAppliqueCount} livraison
                                    {row.tarifNonAppliqueCount > 1 ? "s" : ""} sur cette période (tous statuts) sans tarif automatique pour ce prestataire.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            <span
                              className={cn(
                                "font-medium",
                                row.tarifNonAppliqueCount > 0 && "pl-5"
                              )}
                            >
                              {row.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          <span className="text-foreground">{row.countLivre}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-foreground">{row.countPickup}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(row.totalTarifs)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(row.netPartenaire)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {formatPercentShare(row.netPartenaire, totalPartenaire)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.groupId != null ? (
                            <Button variant="ghost" size="sm" className="gap-1" asChild>
                              <Link to={`/groupes/${row.groupId}`}>
                                Fiche
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Paiements;
