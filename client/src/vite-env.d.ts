/// <reference types="vite/client" />

/**
 * Environment Variables Type Definitions
 * These types ensure TypeScript knows about our custom environment variables
 */
interface ImportMetaEnv {
  /**
   * API Base URL
   * - In development: Leave empty to use Vite proxy, or set to http://localhost:3000
   * - In production: Set to your production API URL
   * @example http://localhost:3000
   * @example https://api.example.com
   */
  readonly VITE_API_BASE_URL?: string;

  /** Email support (autres usages) */
  readonly VITE_SUPPORT_EMAIL?: string;

  /** URL WhatsApp pour « Nous contacter » sur les pages d’erreur (défaut : wa.link du projet) */
  readonly VITE_WHATSAPP_CONTACT_URL?: string;

  /** PostHog project API key (optional; analytics disabled if unset) */
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;

  /**
   * PostHog API host (EU default used in code if unset)
   * @example https://eu.i.posthog.com
   * @example https://us.i.posthog.com
   */
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;

  /**
   * Application mode
   * Automatically set by Vite based on the mode flag
   * @example development
   * @example production
   */
  readonly MODE: string;

  /**
   * Whether the app is running in development mode
   */
  readonly DEV: boolean;

  /**
   * Whether the app is running in production mode
   */
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
