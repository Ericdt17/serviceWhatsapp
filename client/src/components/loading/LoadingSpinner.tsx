import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  /** `gif` = animation LivSight (`/loadinganimation.gif`), `icon` = pictogramme seulement (boutons très compacts). */
  variant?: "gif" | "icon";
  className?: string;
  text?: string;
}

const gifSizeClasses = {
  sm: "h-6 w-6",
  md: "h-12 w-12",
  lg: "h-24 w-24 md:h-28 md:w-28",
};

const iconSizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

/**
 * Indicateur de chargement — GIF livreur par défaut (`/loadinganimation.gif`).
 * Dans les boutons, utiliser `variant="icon"` (spinner Lucide) pour éviter le GIF.
 */
export function LoadingSpinner({ size = "md", variant = "gif", className, text }: LoadingSpinnerProps) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={text ? undefined : "Chargement"}
    >
      {variant === "gif" ? (
        <img
          src="/loadinganimation.gif"
          alt=""
          width={size === "sm" ? 24 : size === "md" ? 48 : 112}
          height={size === "sm" ? 24 : size === "md" ? 48 : 112}
          decoding="async"
          className={cn("shrink-0 object-contain", gifSizeClasses[size])}
        />
      ) : (
        <Loader2 className={cn("animate-spin text-muted-foreground", iconSizeClasses[size])} />
      )}
      {text ? <span className="text-sm text-muted-foreground">{text}</span> : null}
    </div>
  );
}
