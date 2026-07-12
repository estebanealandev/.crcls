/**
 * Circles — unified Clarity + GA4 custom-event wiring. Browser-only. Binds
 * to elements that already exist on circlescr.com. Never reads field values.
 */
import { trackClarityEvent, setClarityTag, type ClarityEventName } from '../../lib/analytics/clarity';
import { trackGA4 } from '../../lib/analytics/ga4';

const SOCIAL_HOSTS = [
  'instagram.com', 'facebook.com', 'linkedin.com', 'x.com', 'twitter.com',
  'youtube.com', 'tiktok.com', 'behance.net', 'dribbble.com', 'github.com', 'threads.net',
];

function once<T extends Element>(el: T, key: string): boolean {
  const flag = `crclsBound_${key}`;
  if ((el as unknown as Record<string, unknown>)[flag]) return false;
  (el as unknown as Record<string, unknown>)[flag] = true;
  return true;
}

function ctaEventFor(link: HTMLAnchorElement): ClarityEventName | null {
  const explicit = link.getAttribute('data-crcls-cta');
  if (explicit === 'primary') return 'crcls_primary_cta_click';
  if (explicit === 'navigation') return 'crcls_navigation_cta_click';
  if (explicit === 'footer') return 'crcls_footer_cta_click';
  if (explicit === 'project') return 'crcls_project_cta_click';

  const href = link.getAttribute('href') || '';
  if (href.startsWith('mailto:')) return 'crcls_email_click';
  if (href.startsWith('tel:')) return 'crcls_phone_click';

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin &&
        SOCIAL_HOSTS.some((h) => url.hostname.endsWith(h))) {
      return 'crcls_social_click';
    }
  } catch { /* relative/invalid href */ }

  if (/\/project\//.test(href)) return 'crcls_project_cta_click';
  if (/\/contact\//.test(href)) {
    if (link.closest('footer, [data-crcls-region="footer"]')) return 'crcls_footer_cta_click';
    if (link.closest('nav, header, [data-crcls-region="nav"]')) return 'crcls_navigation_cta_click';
    return 'crcls_contact_cta_click';
  }
  return null;
}

function emitCtaEvent(evt: ClarityEventName): void {
  trackClarityEvent(evt);
  switch (evt) {
    case 'crcls_email_click':
      trackGA4('click_email');
      break;
    case 'crcls_phone_click':
      trackGA4('click_phone');
      break;
    case 'crcls_social_click':
      trackGA4('click_social');
      break;
    default:
      trackGA4('cta_click', { cta_location: evt.replace(/^crcls_/, '').replace(/_cta_click$/, '') });
  }
}

function wireCtaClicks(): void {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link) return;
    const evt = ctaEventFor(link);
    if (evt) emitCtaEvent(evt);
  }, { capture: true, passive: true });
}

function wireForms(): void {
  document.querySelectorAll<HTMLFormElement>('[data-crcls-form]').forEach((form) => {
    if (!once(form, 'form')) return;
    const kind = (form.getAttribute('data-crcls-form') || 'contact').toLowerCase();
    const startEvt = `crcls_${kind}_form_start` as ClarityEventName;
    const submitEvt = `crcls_${kind}_form_submit` as ClarityEventName;
    const successEvt = `crcls_${kind}_form_success` as ClarityEventName;

    const onStart = () => {
      trackClarityEvent(startEvt);
      form.removeEventListener('focusin', onStart);
      form.removeEventListener('change', onStart);
    };
    form.addEventListener('focusin', onStart, { once: true });
    form.addEventListener('change', onStart, { once: true });
    form.addEventListener('submit', () => trackClarityEvent(submitEvt), { passive: true });

    const fireSuccess = () => {
      trackClarityEvent(successEvt);
      if (kind === 'contact') trackGA4('generate_lead');
      else if (kind === 'subscribe') trackGA4('sign_up', { method: 'newsletter' });
    };

    const wrapper = form.closest('.w-form') || form.parentElement || form;
    const done = wrapper?.querySelector<HTMLElement>('.w-form-done');
    if (done) {
      const obs = new MutationObserver(() => {
        if (getComputedStyle(done).display !== 'none') {
          fireSuccess();
          obs.disconnect();
        }
      });
      obs.observe(done, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    window.addEventListener('crcls:form-success', (ev) => {
      const detail = (ev as CustomEvent).detail as { form?: string } | undefined;
      if (!detail?.form || detail.form.toLowerCase() === kind) fireSuccess();
    });
  });
}

function wireLanguageSwitcher(): void {
  const sel = document.querySelector<HTMLSelectElement>('[data-lang-switcher], #lang-switcher-select');
  if (!sel || !once(sel, 'lang')) return;
  sel.addEventListener('change', () => {
    const val = sel.value || '';
    const m = val.match(/^\/(es|fr|de|pt)\//);
    setClarityTag('language', m?.[1] ?? 'en');
    trackClarityEvent('crcls_language_change');
  });
}

function tagCurrentLanguage(): void {
  const m = window.location.pathname.match(/^\/(es|fr|de|pt)(\/|$)/);
  setClarityTag('language', m?.[1] ?? 'en');
}

function tagProjectView(): void {
  const m = window.location.pathname.match(/\/project\/([^/]+)\/?/);
  const slug = m?.[1];
  if (!slug) return;
  setClarityTag('project', slug);
  trackClarityEvent('crcls_project_view');
  trackGA4('view_project', { project: slug });
}

function wireServiceViews(): void {
  const sections = document.querySelectorAll<HTMLElement>('[data-crcls-service]');
  if (!sections.length || typeof IntersectionObserver === 'undefined') return;
  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && once(entry.target, 'service')) {
        const name = entry.target.getAttribute('data-crcls-service') || '';
        if (name) setClarityTag('service', name);
        trackClarityEvent('crcls_service_view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  sections.forEach((s) => io.observe(s));
}

export function wireClarityEvents(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  tagCurrentLanguage();
  tagProjectView();
  wireCtaClicks();
  wireForms();
  wireLanguageSwitcher();
  wireServiceViews();
}
