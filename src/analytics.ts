/**
 * Cloudflare Web Analytics: cookie-less page-view counts, loaded only on the production host so
 * local development, previews and the verify:* scripts never report anything. The beacon is the
 * one script this site loads from a third-party origin (see docs/decisions/0008); if it fails to
 * load, nothing else is affected.
 */
export const ANALYTICS = {
  host: 'battle.ondream.ai',
  /** Site token from the Cloudflare Web Analytics dashboard (public by design; empty = disabled). */
  token: 'b2caac59d2734d789dff970d5f4b7763',
  script: 'https://static.cloudflareinsights.com/beacon.min.js',
} as const;

/** True only for the exact production host with a configured token. */
export function shouldLoadAnalytics(hostname: string, token: string = ANALYTICS.token): boolean {
  return hostname === ANALYTICS.host && /^[0-9a-f]{32}$/.test(token);
}

/** Appends the beacon script to <head> when `shouldLoadAnalytics` allows it; returns the element or null. */
export function loadAnalytics(doc: Document = document, hostname: string = location.hostname): HTMLScriptElement | null {
  if (!shouldLoadAnalytics(hostname)) return null;
  const s = doc.createElement('script');
  s.defer = true;
  s.src = ANALYTICS.script;
  s.dataset.cfBeacon = JSON.stringify({ token: ANALYTICS.token });
  doc.head.appendChild(s);
  return s;
}
