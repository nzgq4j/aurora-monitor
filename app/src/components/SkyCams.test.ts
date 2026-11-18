// Component tests for the "Live sky cams" panel: the view rendered to static markup for each state.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18n';
import { en } from '../i18n/messages/en';
import { SKY_CAMERAS } from '../lib/skycams';
import { panelModel, type FrameStatus } from '../lib/skycamLogic';
import { SkyCamsView } from './SkyCams';

const KIRUNA = { lat: 67.8558, lon: 20.2253 };
const NIGHT = Date.parse('2026-12-21T21:14:00Z');
const DAY = Date.parse('2026-06-21T12:00:00Z');

function render(place: { lat: number; lon: number }, now: number, frames: Record<string, FrameStatus>) {
  const model = panelModel(place, now, SKY_CAMERAS, frames);
  return renderToStaticMarkup(createElement(I18nProvider, { locale: 'en', messages: en } as Parameters<typeof I18nProvider>[0], createElement(SkyCamsView, { model })));
}

describe('SkyCamsView', () => {
  it('visible: image with alt text, capture time, credit, licence and "Image not altered"', () => {
    const html = render(KIRUNA, NIGHT + 60_000, { 'irf-kiruna': { kind: 'frame', capturedAt: NIGHT, src: 'blob:kiruna' } });
    expect(html).toContain('Live <span class="hl">sky cams</span></h2>');
    expect(html).toContain('alt="All-sky camera image from Kiruna, Sweden, captured 21:14 UTC"');
    expect(html).toContain('src="blob:kiruna"');
    expect(html).toContain('Captured 21:14 UTC');
    expect(html).toContain('href="https://irf.se/alis/allsky/krn/t.html"');
    expect(html).toContain('href="https://www.irf.se/en/forskning/kago/license/"');
    expect(html).toContain('Image not altered');
    expect(html).toContain('A black or grey frame means cloud, moonlight, or no aurora overhead at that camera');
    // The image is never loaded from an operator's host.
    expect(html).not.toMatch(/src="https?:/);
  });

  it('hidden in daylight', () => {
    expect(render(KIRUNA, DAY, {})).toBe('');
  });

  it('offline when the frame is stale', () => {
    const html = render(KIRUNA, NIGHT + 3 * 3_600_000, { 'irf-kiruna': { kind: 'frame', capturedAt: NIGHT, src: 'blob:old' } });
    expect(html).toContain('data-state="offline"');
    expect(html).toContain('Camera offline');
    expect(html).not.toContain('blob:old');
  });

  it('link-only for cameras without a cleared licence', () => {
    // Sodankylä: the nearest camera there is SGO (permission required), so no image at all for it.
    const html = render({ lat: 67.37, lon: 26.63 }, NIGHT, {});
    expect(html).toContain('data-state="link"');
    expect(html).toContain('href="https://sgo.fi/Data/AllSky/SkyI_SOD_realtime.php"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Open live view at the operator&#x27;s site');
    expect(html).not.toContain('<img');
  });
});
