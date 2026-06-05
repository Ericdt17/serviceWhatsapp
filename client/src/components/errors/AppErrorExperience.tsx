import { ApiError } from "@/types/api";
import { getTechnicalMessage, resolveErrorPageKind } from "@/lib/error-page-content";
import { ServerErrorPage } from "./ServerErrorPage";

interface AppErrorExperienceProps {
  error: unknown;
  onRetry?: () => void;
  onBack?: () => void;
  /** Couvre tout l’écran (par-dessus la barre latérale) */
  overlay?: boolean;
  showTechnicalDetails?: boolean;
}

/**
 * Même page d’erreur « thérapie » pour les échecs API / chargement — texte selon le type d’erreur.
 */
export function AppErrorExperience({
  error,
  onRetry,
  onBack,
  overlay = true,
  showTechnicalDetails,
}: AppErrorExperienceProps) {
  const kind = resolveErrorPageKind(error);
  const technical = getTechnicalMessage(error);
  /** Pas de code HTTP pour les erreurs réseau — on affiche le libellé dédié (`ERROR_PAGE_COPY.network`). */
  const codeOverride =
    error instanceof ApiError && kind !== "network" ? String(error.statusCode) : undefined;

  const showTech =
    showTechnicalDetails !== undefined ? showTechnicalDetails : import.meta.env.DEV && !!technical;

  const inner = (
    <ServerErrorPage
      kind={kind}
      codeOverride={codeOverride}
      technicalMessage={technical}
      showTechnicalDetails={showTech}
      onRetry={onRetry}
      onBack={onBack}
    />
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/80 backdrop-blur-[2px] motion-safe:animate-error-backdrop">
        {inner}
      </div>
    );
  }

  return inner;
}
