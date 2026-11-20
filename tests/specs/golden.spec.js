// golden.spec.js — file 07 golden values with Paul's save, in both record modes.
const { test, expect } = require('@playwright/test');
const G = require('../golden-values.json');
const { NAME } = require('../helpers/private');
const A = require('../helpers/app');

// WP the build has reached (set WP=10 or later once WP-10 is under check). Dot grids are due from WP-10.
const DOTS_DUE = +(process.env.WP || 0) >= 10;

/** File 07 dot rule. */
function dotRule(total, value) {
  const perDot = Math.ceil(total / 40), dots = Math.ceil(total / perDot);
  return { perDot, dots, full: Math.floor(value / perDot), remainder: value % perDot };
}

test.describe('golden values (file 07)', () => {
  test('dot rule table is self-consistent with the counts', async () => {
    for (const c of G.collections) {
      const { perDot, dots } = dotRule(c.total, 0);
      expect([dots, perDot], c.title).toEqual(c.dots);
      for (const k of ['completed', 'missing', 'unverified', 'undiscovered']) {
        if (c[k] === '—') { expect(c.dotFill[k], `${c.title} ${k}`).toBeNull(); continue; }
        const r = dotRule(c.total, +c[k].replace(/,/g, ''));
        expect([r.full, r.remainder], `${c.title} ${k}`).toEqual(c.dotFill[k]);
      }
      expect(Math.round(+c.completed / c.total * 100), `${c.title} pct`).toBe(c.pct);
    }
  });

  for (const mode of ['achievement', 'raw']) {
    test(`all golden numbers, record mode ${mode}`, async ({ page }) => {
      const errors = await A.openApp(page);
      await A.loadSave(page);
      if (mode === 'raw') await A.setMode(page, 'raw');

      // Character and save versions.
      await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
      const s = await A.activeSave(page);
      expect(s.save.version).toBe(G.profile);
      expect(s.save.discovered.version).toBe(G.playerData);
      expect(s.save.discovered.skills.length).toBe(G.skills);

      // Header and plaque.
      await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
      await expect(page.locator('#overall')).toContainText('/ ' + G.overall.total);
      for (const [label, value] of Object.entries(G.lifetime)) await expect(page.locator('#statline')).toContainText(`${label} ${value}`);

      // Every collection: stamps, bar %, nav count.
      for (const c of G.collections) {
        await A.selectView(page, c.title);
        const m = await A.stableMetrics(page);
        expect(m, c.title).toEqual({ Completed: c.completed, Missing: c.missing, Unverified: c.unverified, Undiscovered: c.undiscovered });
        await expect(page.locator('#mainTrack'), c.title).toHaveAttribute('aria-valuenow', String(c.pct));
        await expect(page.locator(`[data-count="${c.title.replace(/"/g, '\\"')}"]`)).toHaveText(`${c.completed} / ${c.total}`);
        // Dot grids (DECISIONS point 25 hooks) arrive in WP-10. Before that they are "not yet due"
        // (DECISIONS, WP-01 open point 1): reported as an annotation, never as a failure.
        if (A.TARGET !== 'baseline' && DOTS_DUE) {
          for (const [metric, key] of [['done', 'completed'], ['missing', 'missing'], ['unknown', 'unverified'], ['discovered', 'undiscovered']]) {
            const grid = page.locator(`#metrics [data-metric="${metric}"] [data-dots]`);
            if (c.dotFill[key] === null) { await expect(grid.locator('[data-full]'), `${c.title} ${metric} blank`).toHaveCount(0); continue; }
            await expect(grid, `${c.title} ${metric} grid`).toHaveAttribute('data-dots', String(c.dots[0]));
            await expect(grid).toHaveAttribute('data-full', String(c.dotFill[key][0]));
            expect(Math.abs(+(await grid.getAttribute('data-partial')) - c.dotFill[key][1] / c.dots[1]), `${c.title} ${metric} partial`).toBeLessThan(1e-6);
          }
        }
      }

      // Master Chef table, default filters.
      await A.selectView(page, 'The Master Chef');
      // Paul, WP-17 item 23: on the reskinned targets the default is "All items, missing first"
      // (every item, missing on top); the original "Remaining" view keeps its golden numbers.
      if (A.TARGET !== 'baseline') {
        await expect(page.locator('#statusFilter')).toHaveValue('first');
        await expect(page.locator('#listCount')).toHaveText('82 of 82 items shown');
        await page.locator('#statusFilter').selectOption('remaining');
      }
      await expect(page.locator('#statusFilter')).toHaveValue('remaining');
      await expect(page.locator('#sort')).toHaveValue('name');
      await expect(page.locator('#listCount')).toHaveText(G.masterChefTable.listCount);
      expect((await A.rowNames(page)).slice(0, 3)).toEqual(G.masterChefTable.firstRows);

      // Highlights top three.
      await A.selectView(page, 'Highlights');
      const top = await page.locator('#insightsView .champion').evaluateAll(rows => rows.slice(0, 3).map(r => ({
        name: r.querySelector('.champion-label span').firstChild.textContent.trim(),
        action: r.querySelector('.champion-label small').textContent.trim(),
        count: r.querySelector('.champion-label b').textContent.trim(),
      })));
      expect(top).toEqual(G.highlightsTop3);

      // Skills & travel.
      await A.selectView(page, 'Skills & travel');
      const skills = await page.locator('#insightsView .skill').evaluateAll(rows => rows.slice(0, 3).map(r => ({ name: r.querySelector('strong').textContent.trim(), level: r.querySelector('b').textContent.trim() })));
      expect(skills).toEqual(G.skillsTop3);
      for (const [label, value] of Object.entries(G.distances)) {
        await expect(page.locator('#insightsView .distance').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('b')).toHaveText(value);
      }
      expect(errors).toEqual([]);
      if (A.TARGET !== 'baseline' && !DOTS_DUE) test.info().annotations.push({ type: 'not yet due', description: 'dot-grid assertions (data-dots) start at WP-10' });
    });
  }
});
