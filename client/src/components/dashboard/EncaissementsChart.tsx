import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAgency } from "@/contexts/AgencyContext";
import { getDeliveries } from "@/services/deliveries";
import type { FrontendDelivery } from "@/lib/data-transform";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateLocal } from "@/lib/date-utils";

const formatCurrency = (value: number | undefined | null) => {
  // Handle NaN, undefined, null, or invalid numbers
  const numValue = typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : 0;
  return (
    new Intl.NumberFormat("fr-FR", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(numValue) + " F"
  );
};

// Helper to get last 7 days date range
const getLast7DaysRange = () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6); // Last 7 days including today
  weekAgo.setHours(0, 0, 0, 0);

  return {
    startDate: formatDateLocal(weekAgo),
    endDate: formatDateLocal(today),
  };
};

// Helper to get day name in French
const getDayName = (date: Date): string => {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return days[date.getDay()];
};

// Calculate weekly encaissements from deliveries
const calculateWeeklyEncaissements = (deliveries: FrontendDelivery[]) => {
  // Get last 7 days, starting from the oldest day
  const daysMap = new Map<
    string,
    {
      date: Date;
      dateStr: string;
      jour: string;
      encaisse: number;
      restant: number;
    }
  >();

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const dateStr = formatDateLocal(date);
    daysMap.set(dateStr, {
      date: new Date(date),
      dateStr: dateStr,
      jour: getDayName(date),
      encaisse: 0,
      restant: 0,
    });
  }

  const days = Array.from(daysMap.values());

  // Group deliveries by day and sum amounts
  deliveries.forEach((delivery) => {
    if (!delivery.date_creation) return;

    // Parse the date (handle both ISO strings and date objects)
    let deliveryDate: Date;
    if (typeof delivery.date_creation === "string") {
      deliveryDate = new Date(delivery.date_creation);
    } else {
      deliveryDate = delivery.date_creation;
    }

    if (isNaN(deliveryDate.getTime())) return;

    deliveryDate.setHours(0, 0, 0, 0);
    const dateStr = formatDateLocal(deliveryDate);

    const dayData = days.find((d) => d.dateStr === dateStr);
    if (!dayData) return;

    // Sum amounts
    const montantEncaisse = delivery.montant_encaisse || 0;
    const restant = delivery.restant || 0;

    dayData.encaisse += montantEncaisse;
    dayData.restant += restant;
  });

  return days.map(({ jour, encaisse, restant }) => ({
    jour,
    encaisse,
    restant,
  }));
};

export function EncaissementsChart() {
  const dateRange = useMemo(() => getLast7DaysRange(), []);
  const { selectedAgencyId } = useAgency();

  const { data: deliveriesData, isLoading } = useQuery({
    queryKey: ["deliveries", "weekly-encaissements", selectedAgencyId, dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      getDeliveries({
        page: 1,
        limit: 200,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sortBy: "created_at",
        sortOrder: "DESC",
        agency_id: selectedAgencyId || undefined,
      }),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    const deliveries = deliveriesData?.deliveries ?? [];
    return calculateWeeklyEncaissements(deliveries);
  }, [deliveriesData]);

  if (isLoading) {
    return (
      <div className="stat-card">
        <h3 className="text-lg font-semibold mb-4">
          Encaissements vs Restants
        </h3>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  // Ensure chartData is always an array
  const safeChartData = Array.isArray(chartData)
    ? chartData
    : [
        { jour: "Lun", encaisse: 0, restant: 0 },
        { jour: "Mar", encaisse: 0, restant: 0 },
        { jour: "Mer", encaisse: 0, restant: 0 },
        { jour: "Jeu", encaisse: 0, restant: 0 },
        { jour: "Ven", encaisse: 0, restant: 0 },
        { jour: "Sam", encaisse: 0, restant: 0 },
        { jour: "Dim", encaisse: 0, restant: 0 },
      ];

  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold mb-4">Encaissements vs Restants</h3>
      <div className="h-[300px]">
        {safeChartData && safeChartData.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            key={JSON.stringify(safeChartData)}
          >
            <AreaChart
              data={safeChartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorEncaisse" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="colorRestant" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--warning))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--warning))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="jour"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickFormatter={(value) => (value / 1000000).toFixed(1) + "M"}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === "encaisse" ? "Montant Total" : "À encaisser",
                ]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="encaisse"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#colorEncaisse)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="restant"
                stroke="hsl(var(--warning))"
                fillOpacity={1}
                fill="url(#colorRestant)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Aucune donnée disponible
          </div>
        )}
      </div>
    </div>
  );
}
