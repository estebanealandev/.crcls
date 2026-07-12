/**
 * Google Analytics 4 (gtag.js) — typed, browser-only tracking helpers for Circles.
 * Never throws, browser-only, never sends PII. Single source of truth for
 * the GA4 custom-event namespace used alongside Clarity.
 */
export type GA4EventName =
  | 'generate_lead'
  | 'sign_up'
  | 'click_email'
  | 'click_phone'
  | 'click_social'
  | 'cta_click'
  | 'view_project';

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

function gtagReady(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

export function trackGA4(name: GA4EventName, params: Record<string, unknown> = {}): void {
  try {
    if (!gtagReady()) return;
    window.gtag!('event', name, params);
  } catch { /* analytics must never break the UX */ }
}

/**
 * Unified consent hook for a future CMP: updates GA4's Consent Mode v2 state
 * and Clarity's consent flag together so an "accept"/"reject" action never
 * has to know about both integrations separately.
 */
export function grantAnalyticsConsent(): void {
  try {
    window.gtag?.('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.clarityConsent?.(true);
  } catch { /* ignore */ }
}

export function denyAnalyticsConsent(): void {
  try {
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.clarityConsent?.(false);
  } catch { /* ignore */ }
}
