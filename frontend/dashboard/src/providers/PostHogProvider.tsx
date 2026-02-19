'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useAuth } from '@/providers/AuthProvider';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://analytics.wazeapp.xyz';

function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY || !posthog.__loaded) return;

    const url = window.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  // Init PostHog once
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === 'undefined') return;
    if (posthog.__loaded) return;

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
    });
  }, []);

  // Identify user when auth state changes
  useEffect(() => {
    if (!POSTHOG_KEY || !posthog.__loaded) return;

    if (user && user.id !== prevUserIdRef.current) {
      posthog.identify(user.id, {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        organizationId: user.organizationId,
        plan: user.organization?.plan,
      });
      prevUserIdRef.current = user.id;
    } else if (!user && prevUserIdRef.current) {
      posthog.reset();
      prevUserIdRef.current = null;
    }
  }, [user]);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageviewTracker />
      </Suspense>
      {children}
    </>
  );
}
