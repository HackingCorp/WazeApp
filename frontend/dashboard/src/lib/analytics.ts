import posthog from 'posthog-js';

export const analytics = {
  track(event: string, properties?: Record<string, any>) {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.capture(event, properties);
    }
  },

  identify(userId: string, traits?: Record<string, any>) {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.identify(userId, traits);
    }
  },

  reset() {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.reset();
    }
  },
};
