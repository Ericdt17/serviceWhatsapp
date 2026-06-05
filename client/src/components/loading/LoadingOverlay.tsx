import { LoadingSpinner } from "./LoadingSpinner";
import { cn } from "@/lib/utils";
import { useDeferredLoading } from "@/hooks/useDeferredLoading";

interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  /** Délai avant d’afficher l’overlay (évite un flash si l’API répond tout de suite). 0 = immédiat. */
  delayMs?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Loading overlay component that shows a spinner over content
 */
export function LoadingOverlay({
  isLoading,
  text,
  delayMs = 280,
  className,
  children,
}: LoadingOverlayProps) {
  const showOverlay = useDeferredLoading(isLoading, delayMs);

  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative", className)}>
      {children && (
        <div className="pointer-events-none opacity-50">
          {children}
        </div>
      )}
      {showOverlay ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <LoadingSpinner size="lg" variant="gif" text={text} />
        </div>
      ) : null}
    </div>
  );
}
















