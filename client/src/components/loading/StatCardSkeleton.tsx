import { Skeleton } from "@/components/ui/skeleton";

interface StatCardSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Skeleton component for stat cards
 */
export function StatCardSkeleton({ count = 1, className }: StatCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`stat-card flex h-full min-h-0 flex-col gap-4 ${className || ''}`}>
          <div className="flex justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-9 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
      ))}
    </>
  );
}
















