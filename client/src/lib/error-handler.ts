import { ApiError } from '@/services/api';
import { toast } from 'sonner';

/**
 * Centralized error handling utility
 */

export interface ErrorHandlerOptions {
  showToast?: boolean;
  toastTitle?: string;
  logError?: boolean;
  fallbackMessage?: string;
}

/**
 * Handles errors consistently across the application
 */
export function handleError(
  error: unknown,
  options: ErrorHandlerOptions = {}
): string {
  const {
    showToast = true,
    toastTitle = 'Erreur',
    logError = true,
    fallbackMessage = 'Une erreur est survenue',
  } = options;

  let errorMessage = fallbackMessage;
  let statusCode: number | undefined;

  // Extract error information
  if (error instanceof ApiError) {
    errorMessage = error.message || fallbackMessage;
    statusCode = error.statusCode;
  } else if (error instanceof Error) {
    errorMessage = error.message || fallbackMessage;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  // Log error in development
  if (logError && import.meta.env.DEV) {
    console.error('Error handled:', {
      error,
      message: errorMessage,
      statusCode,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  // Show toast notification
  if (showToast) {
    const description = statusCode
      ? `${errorMessage} (Code: ${statusCode})`
      : errorMessage;

    toast.error(toastTitle, {
      description,
      duration: statusCode === 429 ? 5000 : 4000, // Longer for rate limit errors
    });
  }

  return errorMessage;
}

/**
 * Gets a user-friendly error message based on status code
 */
export function getErrorMessage(statusCode?: number): string {
  if (!statusCode) {
    return 'Une erreur est survenue';
  }

  const messages: Record<number, string> = {
    400: 'Requête invalide. Veuillez vérifier les données saisies.',
    401: 'Non autorisé. Veuillez vous connecter.',
    403: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.',
    404: 'Ressource introuvable.',
    409: 'Conflit. Cette ressource existe déjà.',
    422: 'Données invalides. Veuillez vérifier les champs du formulaire.',
    429: 'Trop de requêtes. Veuillez patienter avant de réessayer.',
    500: 'Erreur serveur. Veuillez réessayer plus tard.',
    502: 'Service indisponible. Le serveur est temporairement indisponible.',
    503: 'Service indisponible. Le serveur est temporairement indisponible.',
    504: 'Délai d\'attente dépassé. Veuillez réessayer.',
  };

  return messages[statusCode] || `Erreur ${statusCode}`;
}

/**
 * Checks if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode === 0 || error.message.includes('Network') || error.message.includes('fetch');
  }
  if (error instanceof Error) {
    return (
      error.message.includes('Network') ||
      error.message.includes('fetch') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Load failed')
    );
  }
  return false;
}

/**
 * Checks if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode === 504 || error.message.includes('timeout') || error.message.includes('Timeout');
  }
  if (error instanceof Error) {
    return error.message.includes('timeout') || error.message.includes('Timeout');
  }
  return false;
}
















