import { describe, expect, it } from 'vitest';
import { ANALYTICS, loadAnalytics, shouldLoadAnalytics } from '../src/analytics';

const TOKEN = 'a'.repeat(32);

describe('shouldLoadAnalytics', () => {
  it('loads only on the production host', () => {
    expect(shouldLoadAnalytics('battle.ondream.ai', TOKEN)).toBe(true);
    for (const h of ['localhost', '127.0.0.1', 'www.battle.ondream.ai', 'battle.ondream.ai.evil.test', 'another.example', '']) {
      expect(shouldLoadAnalytics(h, TOKEN)).toBe(false);
    }
  });

  it('stays off without a well-formed token', () => {
    expect(shouldLoadAnalytics('battle.ondream.ai', '')).toBe(false);
    expect(shouldLoadAnalytics('battle.ondream.ai', 'not-a-token')).toBe(false);
    expect(shouldLoadAnalytics('battle.ondream.ai', TOKEN.slice(1))).toBe(false);
  });

  it('uses the configured token by default', () => {
    expect(shouldLoadAnalytics('battle.ondream.ai')).toBe(/^[0-9a-f]{32}$/.test(ANALYTICS.token));
  });
});

describe('loadAnalytics', () => {
  const fakeDoc = () => {
    const head: unknown[] = [];
    const el = { defer: false, src: '', dataset: {} as Record<string, string> };
    return { doc: { createElement: () => el, head: { appendChild: (n: unknown) => head.push(n) } } as unknown as Document, head, el };
  };

  it('does nothing off the production host', () => {
    const { doc, head } = fakeDoc();
    expect(loadAnalytics(doc, 'localhost')).toBeNull();
    expect(head).toHaveLength(0);
  });

  it('appends the beacon with the token on the production host', () => {
    const { doc, head, el } = fakeDoc();
    const out = loadAnalytics(doc, 'battle.ondream.ai');
    if (!/^[0-9a-f]{32}$/.test(ANALYTICS.token)) {
      expect(out).toBeNull(); // token not configured yet
      return;
    }
    expect(out).toBe(el);
    expect(head).toEqual([el]);
    expect(el.defer).toBe(true);
    expect(el.src).toBe(ANALYTICS.script);
    expect(JSON.parse(el.dataset.cfBeacon)).toEqual({ token: ANALYTICS.token });
  });
});
