import type { ErrorInfo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Cog } from "lucide-react";
import type { ErrorPageKind } from "@/lib/error-page-content";
import { ERROR_PAGE_COPY } from "@/lib/error-page-content";

export interface ServerErrorPageProps {
  /** Type d’erreur — textes et code affiché */
  kind?: ErrorPageKind;
  /** Remplace le code dans la bulle (ex. 504 au lieu de 408) */
  codeOverride?: string;
  /** Message technique (ex. Error.message) */
  technicalMessage?: string | null;
  showTechnicalDetails?: boolean;
  errorInfo?: ErrorInfo | null;
  onRetry?: () => void;
  /** Si défini, utilisé à la place de retour navigateur / accueil */
  onBack?: () => void;
  contactHref?: string;
  className?: string;
}

/** Lien WhatsApp par défaut pour le support (surcharge possible : VITE_WHATSAPP_CONTACT_URL). */
const DEFAULT_WHATSAPP_CONTACT_URL = "https://wa.link/a9j4mo";

function resolveContactHref(): string {
  const fromEnv = import.meta.env.VITE_WHATSAPP_CONTACT_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_WHATSAPP_CONTACT_URL;
}

export function ServerErrorPage({
  kind = "server",
  codeOverride,
  technicalMessage,
  showTechnicalDetails = false,
  errorInfo,
  onRetry,
  onBack,
  contactHref = resolveContactHref(),
  className,
}: ServerErrorPageProps) {
  const copy = ERROR_PAGE_COPY[kind];
  const code = codeOverride ?? copy.code;
  /** Libellé du type d’erreur (ex. « Erreur serveur », « Page introuvable »). */
  const errorTypeLabel = copy.codeSubtitle;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div
      className={cn(
        "relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12",
        "bg-[repeating-linear-gradient(90deg,hsl(var(--background))_0px,hsl(var(--background))_14px,hsl(var(--muted))_14px,hsl(var(--muted))_28px)]",
        className
      )}
    >
      <Cog
        className="pointer-events-none absolute left-[8%] top-[18%] size-10 rotate-12 text-primary/40 motion-safe:animate-pulse-soft motion-safe:[animation-delay:0ms]"
        strokeWidth={1.25}
        aria-hidden
      />
      <Cog
        className="pointer-events-none absolute right-[10%] top-[12%] size-8 -rotate-6 text-accent/45 motion-safe:animate-pulse-soft motion-safe:[animation-delay:0.4s]"
        strokeWidth={1.25}
        aria-hidden
      />
      <Cog
        className="pointer-events-none absolute bottom-[20%] left-[14%] size-6 rotate-45 text-info/40 motion-safe:animate-pulse-soft motion-safe:[animation-delay:0.8s]"
        strokeWidth={1.25}
        aria-hidden
      />
      <Cog
        className="pointer-events-none absolute bottom-[14%] right-[18%] size-9 -rotate-12 text-expedition/40 motion-safe:animate-pulse-soft motion-safe:[animation-delay:1.2s]"
        strokeWidth={1.25}
        aria-hidden
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-5xl rounded-[2rem] border border-border/60 bg-card/95 p-8 shadow-lg backdrop-blur-sm",
          "motion-safe:animate-error-card-enter motion-reduce:animate-none",
          "md:p-10 lg:p-12"
        )}
      >
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-6 text-left motion-safe:animate-fade-in motion-safe:delay-100 motion-reduce:animate-none">
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
              {copy.headline}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">{copy.body}</p>

            <div className="space-y-3">
              <p className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                {copy.stepsTitle}
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {copy.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            {showTechnicalDetails && technicalMessage ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-xs font-medium text-destructive">Détail technique</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{technicalMessage}</p>
              </div>
            ) : null}

            {import.meta.env.DEV && errorInfo?.componentStack ? (
              <details className="rounded-lg border border-border bg-muted/40 p-3 text-left">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Détails techniques (développement)
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto text-xs text-muted-foreground">
                  {errorInfo.componentStack}
                </pre>
              </details>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {onRetry ? (
                <>
                  <Button type="button" variant="default" className="gap-2 rounded-full px-6" onClick={onRetry}>
                    Réessayer
                  </Button>
                  <Button type="button" variant="outline" className="gap-2 rounded-full" onClick={handleBack}>
                    Retour
                  </Button>
                </>
              ) : (
                <Button type="button" variant="default" className="gap-2 rounded-full px-6" onClick={handleBack}>
                  Retour
                </Button>
              )}
              <Button type="button" variant="outline" className="gap-2 rounded-full" asChild>
                <a href={contactHref} target="_blank" rel="noopener noreferrer">
                  Nous contacter
                </a>
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 lg:max-w-none",
              "motion-safe:animate-fade-in motion-safe:delay-200 motion-reduce:animate-none"
            )}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-foreground md:text-5xl">
                {code}
              </p>
              <p className="max-w-sm text-sm font-medium leading-snug text-muted-foreground">{errorTypeLabel}</p>
            </div>
            <img
              src="/errorpage.svg"
              alt={`${errorTypeLabel} — ${code}`}
              width={560}
              height={560}
              loading="eager"
              decoding="async"
              className={cn(
                "mx-auto h-auto w-full max-w-xl object-contain select-none md:max-w-2xl lg:max-w-[min(100%,36rem)]",
                "motion-safe:animate-error-illustration-float motion-reduce:animate-none"
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
