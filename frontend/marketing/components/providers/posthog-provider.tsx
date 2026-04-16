'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function initPostHog() {
  if (!POSTHOG_KEY || typeof window === 'undefined') return;
  if (posthog.__loaded) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Init PostHog lazily after 3s using requestIdleCallback
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === 'undefined') return;

    const timer = setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => initPostHog());
      } else {
        initPostHog();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Track pageviews on route change
  useEffect(() => {
    if (!POSTHOG_KEY || !posthog.__loaded) return;

    posthog.capture('$pageview', { $current_url: window.location.href });
  }, [pathname]);

  return <>{children}</>;
}
