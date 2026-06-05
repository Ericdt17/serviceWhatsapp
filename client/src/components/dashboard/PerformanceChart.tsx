import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useAgency } from "@/contexts/AgencyContext";
import { getDeliveries } from "@/services/deliveries";
import type { FrontendDelivery } from "@/lib/data-transform";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateLocal } from "@/lib/date-utils";

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

// Calculate weekly performance from deliveries
const calculateWeeklyPerformance = (deliveries: FrontendDelivery[]) => {
  // Get last 7 days, starting from the oldest day
  const daysMap = new Map<
    string,
    {
      date: Date;
      dateStr: string;
      jour: string;
      livrees: number;
      echecs: number;
      pickups: number;
      expeditions: number;
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
      livrees: 0,
      echecs: 0,
      pickups: 0,
      expeditions: 0,
    });
  }

  const days = Array.from(daysMap.values());

  // Group deliveries by day
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
    const dateStr = deliveryDate.toISOString().split("T")[0];

    const dayData = days.find((d) => d.dateStr === dateStr);
    if (!dayData) return;

    // Count by status
    if (delivery.statut === "livré") {
      dayData.livrees++;
    } else if (delivery.statut === "annulé") {
      dayData.echecs++;
    } else if (delivery.statut === "pickup") {
      dayData.pickups++;
    } else if (delivery.statut === "expedition") {
      dayData.expeditions++;
    }
  });

  return days.map(({ jour, livrees, echecs, pickups, expeditions }) => ({
    jour,
    livrees,
    echecs,
    pickups,
    expeditions,
  }));
};

export function PerformanceChart() {
  const dateRange = useMemo(() => getLast7DaysRange(), []);
  const { selectedAgencyId } = useAgency();

  const { data: deliveriesData, isLoading } = useQuery({
    queryKey: ["deliveries", "weekly-performance", selectedAgencyId, dateRange.startDate, dateRange.endDate],
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
    return calculateWeeklyPerformance(deliveries);
  }, [deliveriesData]);

  if (isLoading) {
    return (
      <div className="stat-card">
        <h3 className="text-lg font-semibold mb-4">
          Performance de la semaine
        </h3>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  // Ensure chartData is always an array
  const safeChartData = Array.isArray(chartData)
    ? chartData
    : [
        { jour: "Lun", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
        { jour: "Mar", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
        { jour: "Mer", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
        { jour: "Jeu", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
        { jour: "Ven", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
        { jour: "Sam", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
        { jour: "Dim", livrees: 0, echecs: 0, pickups: 0, expeditions: 0 },
      ];

  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold mb-4">Performance de la semaine</h3>
      <div className="h-[300px]">
        {safeChartData && safeChartData.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            key={JSON.stringify(safeChartData)}
          >
            <BarChart
              data={safeChartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
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
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "16px" }}
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    livrees: "Livrées",
                    echecs: "Annulés",
                    pickups: "Au bureau",
                    expeditions: "Expéditions",
                  };
                  return labels[value] || value;
                }}
              />
              <Bar
                dataKey="livrees"
                fill="hsl(var(--success))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="echecs"
                fill="hsl(var(--destructive))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="pickups"
                fill="hsl(var(--info))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expeditions"
                fill="hsl(var(--expedition))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
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
