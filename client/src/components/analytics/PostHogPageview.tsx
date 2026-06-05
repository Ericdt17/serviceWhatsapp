import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { posthog } from "@/lib/posthog";

/**
 * SPA pageviews for PostHog (init uses capture_pageview: false).
 */
export function PostHogPageview() {
  const location = useLocation();

  useEffect(() => {
    if (!import.meta.env.VITE_PUBLIC_POSTHOG_KEY) return;
    posthog.capture("$pageview", {
      $current_url: window.location.href,
    });
  }, [location.pathname, location.search]);

  return null;
}
