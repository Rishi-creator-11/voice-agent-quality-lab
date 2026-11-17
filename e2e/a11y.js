// Browser test (Playwright CLI). Serve a build on :4173, run from the repo root:  playwright-cli run-code --filename=e2e/a11y.js
// Runs axe-core (WCAG 2.0/2.1 A+AA and best practices) on every route in light and dark mode. Expected output: every line ends with OK.
async page => {
  const routes = ['overview', 'scenarios', 'scenarios/emergency', 'scenarios/cancel-happy', 'method', 'history', 'live', 'run'];
  const out = [];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const r of routes) {
      await page.goto('http://localhost:4173/#/' + r);
      await page.reload();
      await page.waitForTimeout(700);
      if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const res = await page.evaluate(async () => { const x = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }); return x.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(' ') + ' :: ' + (v.nodes[0].failureSummary || '').split('\n')[1] })); });
      out.push(scheme + ' ' + r + ' -> ' + (res.length ? JSON.stringify(res) : 'OK'));
    }
  }
  return out.join('\n');
}
