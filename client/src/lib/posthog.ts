import posthog from "posthog-js";

const EU_DEFAULT_HOST = "https://eu.i.posthog.com";

export function initPosthog(): void {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || EU_DEFAULT_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });

  posthog.register({
    app_environment: import.meta.env.MODE,
  });
}

export { posthog };
