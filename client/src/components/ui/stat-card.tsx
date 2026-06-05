import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Infobulle au survol de l’icône (l’icône devient un bouton focusable) */
  iconTooltip?: string;
  /** Libellé court pour les lecteurs d’écran quand `iconTooltip` est défini */
  iconAriaLabel?: string;
  /** Texte affiché à côté de la valeur (ex. « livraisons »), comme « Projects » sur le mock */
  valueLabel?: string;
  /** Petit point vert à côté du titre (ex. activité / OK) */
  statusDot?: boolean;
  /** Barre en segments verticaux : remplis / total (max 24 segments affichés) */
  progress?: {
    current: number;
    total: number;
  };
  trend?: {
    /** Ex. « +2 % vs hier » ou « +2 par rapport au mois dernier » */
    label: string;
    isPositive?: boolean;
  };
  variant?: "default" | "success" | "warning" | "destructive" | "info" | "expedition";
  className?: string;
}

const variantStyles = {
  default: "bg-card",
  success: "bg-success/5 border-success/20",
  warning: "bg-warning/5 border-warning/20",
  destructive: "bg-destructive/5 border-destructive/20",
  info: "bg-info/5 border-info/20",
  expedition: "bg-expedition/5 border-expedition/20",
};

const iconVariantStyles = {
  default: "border-border/80 bg-background/80 text-primary",
  success: "border-success/25 bg-success/5 text-success",
  warning: "border-warning/25 bg-warning/5 text-warning",
  destructive: "border-destructive/25 bg-destructive/5 text-destructive",
  info: "border-info/25 bg-info/5 text-info",
  expedition: "border-expedition/25 bg-expedition/5 text-expedition",
};

const MAX_PROGRESS_SEGMENTS = 24;

function SegmentedProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const descId = useId();
  const safeTotal = Math.max(1, total);
  const segments = Math.min(safeTotal, MAX_PROGRESS_SEGMENTS);
  const capped = Math.min(Math.max(0, current), safeTotal);
  const filledVisual =
    safeTotal > MAX_PROGRESS_SEGMENTS
      ? Math.round((segments * capped) / safeTotal)
      : Math.min(Math.round(capped), segments);

  return (
    <div
      className="flex h-10 items-end gap-1.5"
      role="progressbar"
      aria-valuenow={capped}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-describedby={descId}
    >
      <span id={descId} className="sr-only">
        Progression : {capped} sur {safeTotal}.
      </span>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-full min-h-[28px] w-2 shrink-0 rounded-full transition-colors motion-reduce:transition-none",
            i < filledVisual
              ? "bg-gradient-to-b from-amber-500 to-orange-400 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:from-amber-600 dark:to-orange-500"
              : "bg-muted/70 dark:bg-muted/50"
          )}
          aria-hidden
        />
      ))}
    </div>
  );
}

const iconButtonClass = (variant: keyof typeof iconVariantStyles) =>
  cn(
    "flex size-9 shrink-0 items-center justify-center rounded-full border border-border/80 p-0 shadow-sm outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    iconVariantStyles[variant]
  );

export function StatCard({
  title,
  value,
  valueLabel,
  icon: Icon,
  iconTooltip,
  iconAriaLabel,
  statusDot = false,
  progress,
  trend,
  variant = "default",
  className,
}: StatCardProps) {
  const positive = trend?.isPositive !== false;
  const defaultIconAria =
    iconAriaLabel ?? `Plus d'informations : ${title}`;

  const iconNode = <Icon className="size-4" strokeWidth={2} />;

  const iconSlot = iconTooltip ? (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={iconButtonClass(variant)}
          aria-label={defaultIconAria}
        >
          {iconNode}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="max-w-xs text-left">
        {iconTooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <div className={iconButtonClass(variant)} aria-hidden>
      {iconNode}
    </div>
  );

  return (
    <div
      className={cn(
        "stat-card animate-fade-in flex h-full min-h-0 flex-col",
        variantStyles[variant],
        className
      )}
    >
      {/* Header row: title + status dot | icon */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
          {statusDot ? (
            <span
              className="size-2 shrink-0 rounded-full bg-lime-500 shadow-sm dark:bg-lime-400"
              aria-hidden
            />
          ) : null}
        </div>
        {iconSlot}
      </div>

      {/* Value + optional label (baseline aligned like the mock) */}
      <div className="mt-4 flex flex-wrap items-baseline gap-2">
        <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
        {valueLabel ? (
          <span className="text-sm font-normal text-muted-foreground">{valueLabel}</span>
        ) : null}
      </div>

      {/* Spacer + pied de carte : même hauteur de ligne en grille qu’avec progress/trend */}
      <div className="min-h-0 flex-1" aria-hidden />
      <div className="flex flex-col gap-4 pt-4">
        {progress ? (
          <SegmentedProgress current={progress.current} total={progress.total} />
        ) : null}
        {trend ? (
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm",
              positive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}
          >
            {positive ? (
              <ArrowUpRight className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ArrowDownRight className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span>{trend.label}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
