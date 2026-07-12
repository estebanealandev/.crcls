/**
 * Microsoft Clarity — typed, browser-only tracking helpers for Circles.
 * Never throws, browser-only, never sends PII. Single source of truth for
 * the `crcls_` custom-event namespace.
 */
export type ClarityEventName =
  | 'crcls_primary_cta_click'
  | 'crcls_contact_cta_click'
  | 'crcls_navigation_cta_click'
  | 'crcls_footer_cta_click'
  | 'crcls_contact_form_start'
  | 'crcls_contact_form_submit'
  | 'crcls_contact_form_success'
  | 'crcls_subscribe_form_start'
  | 'crcls_subscribe_form_submit'
  | 'crcls_subscribe_form_success'
  | 'crcls_service_view'
  | 'crcls_project_view'
  | 'crcls_project_cta_click'
  | 'crcls_language_change'
  | 'crcls_email_click'
  | 'crcls_phone_click'
  | 'crcls_social_click';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    clarity?: ClarityFn;
    clarityConsent?: (granted: boolean) => void;
  }
}

function clarityReady(): boolean {
  return typeof window !== 'undefined' && typeof window.clarity === 'function';
}

export function trackClarityEvent(name: ClarityEventName): void {
  try {
    if (!clarityReady()) return;
    window.clarity!('event', name);
  } catch { /* analytics must never break the UX */ }
}

export function setClarityTag(key: string, value: string | string[]): void {
  try {
    if (!clarityReady()) return;
    window.clarity!('set', key, value);
  } catch { /* ignore */ }
}

export function setClarityConsent(granted: boolean): void {
  try {
    if (typeof window !== 'undefined' && typeof window.clarityConsent === 'function') {
      window.clarityConsent(granted);
      return;
    }
    if (!clarityReady()) return;
    window.clarity!('consent', granted);
  } catch { /* ignore */ }
}

export function identifyClarity(customId: string): void {
  try {
    if (!clarityReady()) return;
    window.clarity!('identify', customId);
  } catch { /* ignore */ }
}
