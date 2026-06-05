import { AppErrorExperience } from "./AppErrorExperience";

interface ErrorDisplayProps {
  error: Error | unknown;
  onRetry?: () => void;
  showDetails?: boolean;
}

/**
 * @deprecated Préférez `AppErrorExperience` directement. Conservé pour compatibilité.
 */
export function ErrorDisplay({ error, onRetry, showDetails }: ErrorDisplayProps) {
  return (
    <AppErrorExperience
      error={error}
      onRetry={onRetry}
      overlay
      showTechnicalDetails={showDetails}
    />
  );
}
