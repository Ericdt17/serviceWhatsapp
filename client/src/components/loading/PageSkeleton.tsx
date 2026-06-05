import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "./StatCardSkeleton";

interface PageSkeletonProps {
  showHeader?: boolean;
  showStats?: boolean;
  statsCount?: number;
  showContent?: boolean;
  className?: string;
}

/**
 * Full page skeleton loader
 */
export function PageSkeleton({
  showHeader = true,
  showStats = false,
  statsCount = 4,
  showContent = true,
  className,
}: PageSkeletonProps) {
  return (
    <div className={`space-y-6 pb-8 ${className || ''}`}>
      {showHeader && (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
      )}

      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCardSkeleton count={statsCount} />
        </div>
      )}

      {showContent && (
        <div className="space-y-4">
          <Skeleton className="h-96 w-full" />
        </div>
      )}
    </div>
  );
}
















