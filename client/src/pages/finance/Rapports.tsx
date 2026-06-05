import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FileText,
  Download,
  Package,
  CheckCircle,
  XCircle,
  ShoppingBag,
  Truck,
  Wallet,
  RefreshCw,
  Receipt,
  HandCoins,
} from "lucide-react";
import { getDeliveries } from "@/services/deliveries";
import { getExpeditionStats } from "@/services/expeditions";
import { toast } from "sonner";
import { type DateRange, getDateRangeForPreset } from "@/lib/date-utils";
import { useDateRefresh } from "@/hooks/useDateRefresh";
import { calculateStatsFromDeliveries } from "@/lib/stats-utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { buildApiUrl } from "@/lib/api-config";

const formatCurrency = (value: number | undefined | null) => {
  // Handle NaN, undefined, null, or invalid numbers
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR").format(numValue) + " FCFA";
};

const Rapports = () => {
  const { user, isSuperAdmin } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangeForPreset("today"));
  useDateRefresh(setDateRange);

  // Check if it's a single day (for chart display)
  const isSingleDay = dateRange.startDate === dateRange.endDate;

  // Fetch deliveries for all periods
  const {
    data: deliveriesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["deliveries", "reports", dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      getDeliveries({
        page: 1,
        limit: 1000,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy: "created_at",
        sortOrder: "DESC",
      }),
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const { data: expeditionStats } = useQuery({
    queryKey: ["expeditions", "stats", "reports", dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      getExpeditionStats({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
    retry: 2,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isError && error) {
      toast.error("Erreur lors du chargement des livraisons", {
        description: error instanceof Error ? error.message : "Une erreur est survenue",
      });
    }
  }, [isError, error]);

  // Calculate current data based on date range
  const currentData = useMemo(() => {
    if (deliveriesData?.deliveries) {
      const stats = calculateStatsFromDeliveries(deliveriesData.deliveries);
      // Convert to the format expected by Rapports page
      return {
        livraisons: stats.totalLivraisons,
        livrees: stats.livreesReussies,
        echecs: stats.echecs,
        pickups: stats.pickups,
        expeditions: expeditionStats?.totalExpeditions || 0,
        fraisExpeditions: expeditionStats?.totalFraisDeCourse || 0,
        encaisse: stats.montantEncaisse, // Montant brut
        restant: stats.montantRestant,
        totalTarifs: stats.totalTarifs || 0,
        chiffreAffaires: (stats.totalTarifs || 0) + (expeditionStats?.totalFraisDeCourse || 0),
        montantNetEncaisse: (stats.montantNetEncaisse || 0) - (expeditionStats?.totalFraisDeCourse || 0), // Montant NET (à reverser, frais expéditions déduits)
      };
    }
    
    // Fallback empty stats
    return {
      livraisons: 0,
      livrees: 0,
      echecs: 0,
      pickups: 0,
      expeditions: 0,
      fraisExpeditions: 0,
      encaisse: 0,
      restant: 0,
      chiffreAffaires: 0,
      totalTarifs: 0,
      montantNetEncaisse: 0,
    };
  }, [deliveriesData, expeditionStats]);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Rapports</h1>
          <p className="text-muted-foreground">
            Analysez les performances de votre agence
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button 
            className="gap-2"
            onClick={() => {
              const params = new URLSearchParams();
              params.append("startDate", dateRange.startDate);
              params.append("endDate", dateRange.endDate);
              const url = buildApiUrl(`/api/v1/reports/pdf?${params.toString()}`);
              window.open(url, "_blank");
            }}
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-col gap-4">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="space-y-6">
        {/* Loading State */}
        {isLoading && (
            <div className="space-y-6">
              <Skeleton className="h-24 w-full" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="stat-card">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-96 w-full" />
            </div>
          )}

        {isError && !isLoading ? (
          <AppErrorExperience error={error} onRetry={() => void refetch()} />
        ) : null}

          {/* Content */}
          {!isLoading && !isError && (
            <>
              {/* Summary Card */}
              <div className="stat-card bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    Rapport — Période sélectionnée
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Résumé complet des activités pour la période sélectionnée
                  {dateRange.startDate !== dateRange.endDate && (
                    <span className="ml-2">
                      ({dateRange.startDate} au {dateRange.endDate})
                    </span>
                  )}
                  {dateRange.startDate === dateRange.endDate && (
                    <span className="ml-2">
                      ({dateRange.startDate})
                    </span>
                  )}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total livraisons"
                  value={currentData.livraisons}
                  icon={Package}
                />
                <StatCard
                  title="Livrées"
                  value={currentData.livrees}
                  icon={CheckCircle}
                  variant="success"
                />
                <StatCard
                  title="Annulés"
                  value={currentData.echecs}
                  icon={XCircle}
                  variant="destructive"
                />
                <StatCard
                  title="Au bureau"
                  value={currentData.pickups}
                  icon={ShoppingBag}
                  variant="info"
                />
                <StatCard
                  title="Expéditions"
                  value={currentData.expeditions}
                  icon={Truck}
                  variant="expedition"
                />
                <StatCard
                  title="Frais d'expédition"
                  value={formatCurrency(currentData.fraisExpeditions)}
                  icon={Receipt}
                  variant="warning"
                />
                <StatCard
                  title="Taux de réussite"
                  value={
                    currentData.livraisons > 0
                      ? `${Math.round((currentData.livrees / currentData.livraisons) * 100)}%`
                      : "0%"
                  }
                  icon={CheckCircle}
                  variant="success"
                />
                <StatCard
                  title="Montant Total"
                  value={formatCurrency(currentData.encaisse)}
                  icon={Wallet}
                  variant="success"
                />
                <StatCard
                  title="Frais de livraison"
                  value={formatCurrency(currentData.totalTarifs)}
                  icon={Receipt}
                  variant="info"
                />
                <StatCard
                  title={(currentData.montantNetEncaisse || 0) < 0 ? "Dette groupe" : "Partenaire"}
                  value={formatCurrency(Math.abs(currentData.montantNetEncaisse || 0))}
                  icon={HandCoins}
                  variant={(currentData.montantNetEncaisse || 0) < 0 ? "destructive" : "success"}
                />
              </div>

              {/* Chart - Only show for date ranges (not single day) with data */}
              {!isSingleDay &&
                deliveriesData &&
                deliveriesData.deliveries.length > 0 && (
                  <div className="stat-card">
                    <h3 className="text-lg font-semibold mb-4">
                      Répartition par statut
                    </h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              statut: "Livrées",
                              value: currentData.livrees,
                            },
                            {
                              statut: "Annulés",
                              value: currentData.echecs,
                            },
                            {
                              statut: "Au bureau",
                              value: currentData.pickups,
                            },
                            {
                              statut: "Expéditions",
                              value: currentData.expeditions,
                            },
                          ]}
                          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                          />
                          <XAxis
                            dataKey="statut"
                            tick={{
                              fontSize: 12,
                              fill: "hsl(var(--muted-foreground))",
                            }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                          />
                          <YAxis
                            tick={{
                              fontSize: 12,
                              fill: "hsl(var(--muted-foreground))",
                            }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Bar
                            dataKey="value"
                            fill="hsl(var(--primary))"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

              {/* Financial Summary */}
              <div className="stat-card">
                <h3 className="text-lg font-semibold mb-4">Résumé financier</h3>
                <div className={`grid gap-4 ${isSuperAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                    <p className="text-sm text-muted-foreground mb-1">
                      Chiffre d'affaires
                    </p>
                    <p className="text-2xl font-bold text-success">
                      {formatCurrency(currentData.chiffreAffaires)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-1">
                      Montant collecté
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(currentData.encaisse)}
                    </p>
                  </div>
                  {isSuperAdmin ? (
                    <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                      <p className="text-sm text-muted-foreground mb-1">
                        Montant à collecter
                      </p>
                      <p className="text-2xl font-bold text-warning">
                        {formatCurrency(currentData.restant)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
      </div>
    </div>
  );
};

export default Rapports;
