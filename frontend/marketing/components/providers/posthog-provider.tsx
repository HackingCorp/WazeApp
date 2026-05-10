'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function initPostHog() {
  if (!POSTHOG_KEY || typeof window === 'undefined') return;
  if (posthog.__loaded) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Init PostHog immediately
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === 'undefined') return;
    initPostHog();
  }, []);

  // Track pageviews on route change
  useEffect(() => {
    if (!POSTHOG_KEY || !posthog.__loaded) return;

    const url = window.location.origin + pathname;
    const params = searchParams?.toString();
    const fullUrl = params ? `${url}?${params}` : url;

    posthog.capture('$pageview', {
      $current_url: fullUrl,
      utm_source: searchParams?.get('utm_source') || undefined,
      utm_medium: searchParams?.get('utm_medium') || undefined,
      utm_campaign: searchParams?.get('utm_campaign') || undefined,
      utm_content: searchParams?.get('utm_content') || undefined,
      utm_term: searchParams?.get('utm_term') || undefined,
      referrer: document.referrer || undefined,
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
