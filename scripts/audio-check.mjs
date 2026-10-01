/**
 * Audio verification in headless Chrome against the production build.
 *
 *   pnpm build && pnpm verify:audio
 *
 * 1. With the normal autoplay policy the page must show the "click to enable sound" hint (state locked).
 * 2. A click unlocks audio (state running, hint hidden); a synthetic liquidation exercises the effects path.
 * 3. M toggles sound off (persisted) and on again.
 * 4. renderPreview(): 32 s offline render (score calm → storming + every effect) → verification/audio-preview.wav,
 *    asserting it is audible, not clipping, and that the score gets louder as intensity rises.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4174;
mkdirSync('verification', { recursive: true });
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), res()));
});
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) fails.push(msg);
};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/binance/i.test(m.text()) && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}/?sim&lang=zh`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('bb.sound'));
  await sleep(3000);
  const before = await page.evaluate(() => ({ state: __bb.audio.state, hint: document.querySelector('[data-k=soundHint]').classList.contains('show'), text: document.querySelector('[data-k=soundHint]').textContent }));
  check(before.state === 'locked' && before.hint, `before any gesture: state=${before.state}, hint shown=${before.hint} ("${before.text.trim()}")`);
  await page.mouse.click(720, 430);
  await sleep(1500);
  const after = await page.evaluate(() => ({ ...__bb.audio.debug, hint: document.querySelector('[data-k=soundHint]').classList.contains('show') }));
  check(after.state === 'running' && !after.hint, `after a click: state=${after.state}, ctx=${after.ctxState}, hint shown=${after.hint}`);
  await page.evaluate(() => {
    const now = Date.now();
    __bb.world.onMarketEvent({ id: 1, kind: 'liq', type: 'liqShort', ex: 'sim', bull: true, usd: 2_500_000, price: 84000, ts: now, label: 'Shorts liquidated' });
    __bb.world.onMarketEvent({ id: 2, kind: 'trade', type: 'bigSell', ex: 'sim', bull: false, usd: 900_000, price: 84000, ts: now, label: 'Large sell trade' });
    __bb.world.onMarketEvent({ id: 3, kind: 'option', type: 'optBuy', ex: 'deribit', bull: true, usd: 50_000, price: 84000, ts: now, label: 'Large option buy' });
  });
  await sleep(6000);
  const run = await page.evaluate(() => __bb.audio.debug);
  check(run.state === 'running', `running after effects + 6 s of music: intensity=${run.intensity}, sampleRate=${run.sampleRate}`);
  await page.keyboard.press('m');
  await sleep(300);
  const off = await page.evaluate(() => ({ state: __bb.audio.state, pref: localStorage.getItem('bb.sound'), btn: document.querySelector('[data-k=sound]').dataset.state }));
  check(off.state === 'off' && off.pref === 'off' && off.btn === 'off', `M → off (pref=${off.pref}, button=${off.btn})`);
  await page.keyboard.press('m');
  await sleep(800);
  const on = await page.evaluate(() => __bb.audio.state);
  check(on === 'running', `M again → ${on}`);
  check(errors.length === 0, `no runtime errors (${errors.length}) ${errors.slice(0, 3).join(' | ')}`);

  const t0 = Date.now();
  const res = await page.evaluate(async () => __bb.renderPreview(32));
  writeFileSync('verification/audio-preview.wav', Buffer.from(res.wavBase64, 'base64'));
  const { wavBase64, ...levels } = res;
  console.log(`preview rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(levels));
  check(levels.peak > 0.2 && levels.peak < 0.995, `preview peak ${levels.peak} (audible, no clipping)`);
  check(levels.rmsDb > -32 && levels.rmsDb < -8, `preview RMS ${levels.rmsDb} dBFS`);
  const w = levels.windowsDb;
  const calm = (w[1] + w[2]) / 2; // 2–6 s: intensity 0.2, few effects
  const storm = (w[9] + w[10] + w[11]) / 3; // 18–24 s: intensity 0.9 + explosions
  check(storm > calm + 3, `score builds up: calm ${calm.toFixed(1)} dB → storming ${storm.toFixed(1)} dB`);
  writeFileSync('verification/audio-report.json', JSON.stringify({ at: new Date().toISOString(), before, after, run, off, on, errors, levels }, null, 1));
} finally {
  await browser.close();
  server.kill();
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nAUDIO CHECKS PASSED → verification/audio-preview.wav');
process.exit(fails.length ? 1 : 0);
