import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package,
  CheckCircle,
  XCircle,
  Clock,
  ShoppingBag,
  Truck,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  RefreshCw,
  Calendar,
  Receipt,
  HandCoins,
  Building2,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAgency } from "@/contexts/AgencyContext";
import { getAgencies } from "@/services/agencies";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { EncaissementsChart } from "@/components/dashboard/EncaissementsChart";
import { RecentDeliveries } from "@/components/dashboard/RecentDeliveries";
import { Skeleton } from "@/components/ui/skeleton";
import { AppErrorExperience } from "@/components/errors/AppErrorExperience";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDailyStats } from "@/services/stats";
import { getDeliveries } from "@/services/deliveries";
import { getExpeditionStats } from "@/services/expeditions";
import { toast } from "sonner";
import { getDateRangeLocal, getDateRangeForPreset, type DateRange } from "@/lib/date-utils";
import { useDateRefresh } from "@/hooks/useDateRefresh";
import { calculateStatsFromDeliveries } from "@/lib/stats-utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";

const formatCurrency = (value: number | undefined | null) => {
  // Handle NaN, undefined, null, or invalid numbers
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR").format(numValue) + " F";
};

const Index = () => {
  const { user, isSuperAdmin } = useAuth();
  const { selectedAgencyId, setSelectedAgencyId } = useAgency();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<"jour" | "semaine" | "mois">("jour");
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangeForPreset("today"));
  useDateRefresh(setDateRange);

  // Fetch agencies for super admin to show selected agency name
  const { data: agencies = [] } = useQuery({
    queryKey: ["agencies"],
    queryFn: getAgencies,
    enabled: isSuperAdmin,
  });

  const selectedAgency = agencies.find(a => a.id === selectedAgencyId);

  // Check if it's a single day (for daily stats)
  const isSingleDay = dateRange.startDate === dateRange.endDate;

  // Fetch stats for today (for day view)
  // Stats are automatically filtered by agency_id on backend
  const {
    data: dailyStats,
    isLoading: isLoadingDailyStats,
    isError: isErrorDailyStats,
    error: dailyStatsError,
    refetch: refetchDailyStats,
  } = useQuery({
    queryKey: ["dailyStats", dateRange.startDate, selectedAgencyId],
    queryFn: () => getDailyStats(dateRange.startDate, null, selectedAgencyId || undefined),
    enabled: isSingleDay,
    retry: 2,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  // Fetch deliveries for week/month periods
  const {
    data: deliveriesData,
    isLoading: isLoadingDeliveries,
    isError: isErrorDeliveries,
    error: deliveriesError,
    refetch: refetchDeliveries,
  } = useQuery({
    queryKey: [
      "deliveries",
      "dashboard",
      dateRange.startDate,
      dateRange.endDate,
      selectedAgencyId,
    ],
    queryFn: () =>
      getDeliveries({
        page: 1,
        limit: 1000,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy: "created_at",
        sortOrder: "DESC",
        agency_id: selectedAgencyId || undefined,
      }),
    enabled: !isSingleDay,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Fetch deliveries for day period to calculate tariffs (since dailyStats doesn't include tariffs yet)
  const {
    data: dayDeliveriesData,
    isLoading: isLoadingDayDeliveries,
    isError: isErrorDayDeliveries,
  } = useQuery({
    queryKey: [
      "deliveries",
      "dashboard-day",
      dateRange.startDate,
      dateRange.endDate,
      selectedAgencyId,
    ],
    queryFn: () =>
      getDeliveries({
        page: 1,
        limit: 1000,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy: "created_at",
        sortOrder: "DESC",
        agency_id: selectedAgencyId || undefined,
      }),
    enabled: isSingleDay,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const { data: expeditionStats } = useQuery({
    queryKey: [
      "expeditions",
      "stats",
      "dashboard",
      dateRange.startDate,
      dateRange.endDate,
      selectedAgencyId,
    ],
    queryFn: () =>
      getExpeditionStats({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        agency_id: selectedAgencyId || undefined,
      }),
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Calculate current data based on date range
  const stats = useMemo(() => {
    if (isSingleDay) {
      // For day view, use dailyStats but calculate tariffs from deliveries
      const dayDeliveries = dayDeliveriesData?.deliveries || [];
      const dayStats = calculateStatsFromDeliveries(dayDeliveries);
      
      if (dailyStats) {
        // For day view:
        // - Use dailyStats for counts (from backend, more accurate)
        // - Use dayStats for amounts (calculated from deliveries with correct tariff logic)
        // - dayStats.montantEncaisse is already brut (amount_paid + delivery_fee for delivered)
        // - dayStats.montantRestant is already 0 for delivered deliveries
        // - dayStats.totalTarifs is sum of delivery_fee for delivered deliveries
        // - dayStats.montantNetEncaisse is montantEncaisse - totalTarifs (amount to reverse)
        return {
          totalLivraisons: dailyStats.totalLivraisons,
          livreesReussies: dailyStats.livreesReussies,
          echecs: dailyStats.echecs,
          enCours: dailyStats.enCours,
          pickups: dayStats.pickups,
          expeditions: expeditionStats?.totalExpeditions || 0,
          montantEncaisse: Number(dayStats.montantEncaisse) || 0, // Brut amount (from deliveries calculation)
          montantRestant: Number(dayStats.montantRestant) || 0, // Remaining (0 for delivered)
          totalTarifs: Number(dayStats.totalTarifs) || 0, // Sum of delivery_fee for delivered
          chiffreAffaires: (Number(dayStats.totalTarifs) || 0) + (Number(expeditionStats?.totalFraisDeCourse) || 0),
          montantNetEncaisse: Number(dayStats.montantNetEncaisse) || 0, // Net amount to reverse (montantEncaisse - totalTarifs)
        };
      }
      // Jour sans dailyStats -> utiliser les livraisons
      return {
        totalLivraisons: dayStats.totalLivraisons,
        livreesReussies: dayStats.livreesReussies,
        echecs: dayStats.echecs,
        enCours: dayStats.enCours,
        pickups: dayStats.pickups,
        expeditions: expeditionStats?.totalExpeditions || 0,
        montantEncaisse: Number(dayStats.montantEncaisse) || 0, // Already brut from calculateStatsFromDeliveries
        montantRestant: Number(dayStats.montantRestant) || 0,
        totalTarifs: Number(dayStats.totalTarifs) || 0,
        chiffreAffaires: (Number(dayStats.totalTarifs) || 0) + (Number(expeditionStats?.totalFraisDeCourse) || 0),
        montantNetEncaisse: Number(dayStats.montantNetEncaisse) || 0, // Montant NET (après tarifs)
      };
    }

    if (!isSingleDay && deliveriesData) {
      const periodStats = calculateStatsFromDeliveries(deliveriesData.deliveries);
      return {
        ...periodStats,
        expeditions: expeditionStats?.totalExpeditions || 0,
        chiffreAffaires: (Number(periodStats.totalTarifs) || 0) + (Number(expeditionStats?.totalFraisDeCourse) || 0),
      };
    }

    // Date range sans données -> valeurs neutres
    return {
      totalLivraisons: 0,
      livreesReussies: 0,
      echecs: 0,
      enCours: 0,
      pickups: 0,
      expeditions: 0,
      montantEncaisse: 0,
      montantRestant: 0,
      chiffreAffaires: 0,
      totalTarifs: 0,
      montantNetEncaisse: 0,
    };
  }, [isSingleDay, dailyStats, deliveriesData, dayDeliveriesData, expeditionStats]);

  const isLoading =
    isSingleDay
      ? (isLoadingDailyStats || isLoadingDayDeliveries)
      : isLoadingDeliveries;
  const isError = isSingleDay ? (isErrorDailyStats || isErrorDayDeliveries) : isErrorDeliveries;
  const error = isSingleDay ? dailyStatsError : deliveriesError;
  const refetch = isSingleDay ? refetchDailyStats : refetchDeliveries;

  useEffect(() => {
    if (isError && error) {
      const message = error instanceof Error ? error.message : "Une erreur est survenue";
      toast.error("Erreur lors du chargement des données", { description: message });
    }
  }, [isError, error]);

  const periodLabels = {
    jour: "Aujourd'hui",
    semaine: "Cette semaine",
    mois: "Ce mois",
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">
            Vue d'ensemble des livraisons du jour —{" "}
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Loading Skeletons */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="stat-card">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !stats) {
    const err =
      error instanceof Error
        ? error
        : new Error("Impossible de charger les statistiques");
    return <AppErrorExperience error={err} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin
              ? selectedAgency 
                ? `Vue d'ensemble de l'agence ${selectedAgency.name}`
                : "Vue d'ensemble de toutes les agences"
              : `Vue d'ensemble de votre agence${user?.name ? ` - ${user.name}` : ""}`}
            {dateRange.startDate === dateRange.endDate ? (
              <span className="ml-2">— {dateRange.startDate}</span>
            ) : (
              <span className="ml-2">— {dateRange.startDate} au {dateRange.endDate}</span>
            )}
          </p>
        </div>

        {/* Agency Selector for Super Admin */}
        {isSuperAdmin && (
          <div className="flex items-center gap-4">
            {selectedAgency ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <Building2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{selectedAgency.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedAgencyId(null);
                  }}
                  className="h-6 w-6 p-0 hover:bg-primary/20"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/agences")}
                className="gap-2"
              >
                <Building2 className="w-4 h-4" />
                Sélectionner une agence
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-col gap-4">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Period Tabs */}
      <Tabs
        value={period}
        onValueChange={(v) => {
          setPeriod(v as typeof period);
          // Update dateRange when period changes
          const newDateRange = getDateRangeLocal(v as typeof period);
          setDateRange(newDateRange);
        }}
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
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="stat-card">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {/* Error State */}
          {isError && !isLoading ? (
            <AppErrorExperience error={error} onRetry={() => void refetch()} />
          ) : null}

          {/* Content */}
          {!isLoading && !isError && stats && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total livraisons"
                  value={stats.totalLivraisons}
                  icon={Package}
                />
                <StatCard
                  title="Livrées"
                  value={stats.livreesReussies}
                  icon={CheckCircle}
                  variant="success"
                />
                <StatCard
                  title="Annulés"
                  value={stats.echecs}
                  icon={XCircle}
                  variant="destructive"
                />
                <StatCard
                  title="En cours"
                  value={stats.enCours}
                  icon={Clock}
                  variant="warning"
                />
                <StatCard
                  title="Au bureau"
                  value={stats.pickups}
                  icon={ShoppingBag}
                  variant="info"
                />
                <StatCard
                  title="Expéditions"
                  value={stats.expeditions}
                  icon={Truck}
                  variant="expedition"
                />
                <StatCard
                  title="Frais d'expédition"
                  value={formatCurrency(expeditionStats?.totalFraisDeCourse || 0)}
                  icon={Receipt}
                  variant="warning"
                />
                <StatCard
                  title="Montant collecté"
                  value={formatCurrency(stats.montantEncaisse)}
                  icon={Wallet}
                  variant="success"
                />
                {isSuperAdmin ? (
                  <StatCard
                    title="Montant à collecter"
                    value={formatCurrency(stats.montantRestant)}
                    icon={Wallet}
                    variant="warning"
                  />
                ) : null}
                <StatCard
                  title="Frais de livraison"
                  value={formatCurrency(stats.totalTarifs || 0)}
                  icon={Receipt}
                  variant="info"
                />
                <StatCard
                  title="Partenaire"
                  value={formatCurrency(stats.montantNetEncaisse || 0)}
                  icon={HandCoins}
                  variant="success"
                />
              </div>

              {/* Chiffre d'affaires highlight */}
              <div className="stat-card bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Chiffre d'affaires — {periodLabels[period]}
                    </p>
                    <p className="text-3xl font-bold text-primary mt-1">
                      {formatCurrency(stats.chiffreAffaires)}
                    </p>
                    {period === "jour" && (
                      <div className="flex items-center gap-1 mt-2 text-sm text-success">
                        <ArrowUpRight className="w-4 h-4" />
                        <span>+15% vs moyenne</span>
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:flex p-4 rounded-2xl bg-primary/10">
                    <TrendingUp className="w-8 h-8 text-primary" />
                  </div>
                </div>
              </div>

              {/* Charts - Only show for day view */}
              {period === "jour" && (
                <div className="grid lg:grid-cols-2 gap-6">
                  <PerformanceChart />
                  <EncaissementsChart />
                </div>
              )}

              {/* Recent Deliveries */}
              <RecentDeliveries />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
