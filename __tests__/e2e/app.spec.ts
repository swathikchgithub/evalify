import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────
const TIMEOUT = 15_000;

// ─────────────────────────────────────────────────────────────
// TC-01 — App Loads
// ─────────────────────────────────────────────────────────────
test.describe('TC-01 — App Loads', () => {

  test('page title is Evalify', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Evalify/);
  });

  test('header shows Evalify branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('⚡ Evalify')).toBeVisible();
  });

  test('all 5 tabs visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Compare Models/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Custom Endpoint/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /KServe/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Judge/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stats/ })).toBeVisible();
  });

  test('input bar visible with correct elements', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Ask All/ })).toBeVisible();
    await expect(page.getByPlaceholder(/Ask all four panels/)).toBeVisible();
    await expect(page.getByRole('button', { name: /📡/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /🗑 Clear/ })).toBeVisible();
  });

  test('4 compare panels visible on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('GPT-4o Mini')).toBeVisible();
    await expect(page.getByText('Claude Haiku')).toBeVisible();
    await expect(page.getByText('Llama 3.3 70B')).toBeVisible();
    await expect(page.getByText('Gemini 2.5 Flash')).toBeVisible();
  });

  test('provider badges visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('OpenAI')).toBeVisible();
    await expect(page.getByText('Anthropic')).toBeVisible();
    await expect(page.getByText('Groq')).toBeVisible();
    await expect(page.getByText('Google')).toBeVisible();
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForTimeout(1000);
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});

// ─────────────────────────────────────────────────────────────
// TC-03 — Panel Selector
// ─────────────────────────────────────────────────────────────
test.describe('TC-03 — Panel Selector', () => {

  test('shows model names not Panel A/B/C/D labels', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Send to:').first()).toBeVisible();
    // Should NOT show raw Panel A/B/C/D
    const content = await page.locator('[class*="flex flex-wrap gap-2 mt-3"]').textContent();
    expect(content).not.toMatch(/^Panel [ABCD]$/m);
  });

  test('None deactivates all panel pills', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Send to:', { timeout: 5000 });
    await page.getByRole('button', { name: 'None' }).click();
    const sendToRow = page.locator('div.flex.flex-wrap.gap-2').filter({ hasText: 'Send to:' });
    await expect(sendToRow.locator('button').filter({ hasText: '○' })).toHaveCount(4);
  });

  test('All reactivates all panels after None', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Send to:', { timeout: 5000 });
    const sendToRow = page.locator('div.flex.flex-wrap.gap-2').filter({ hasText: 'Send to:' });
    await page.getByRole('button', { name: 'None' }).click();
    await page.getByRole('button', { name: 'All' }).click();
    await expect(sendToRow.locator('button').filter({ hasText: '✓' })).toHaveCount(4);
  });

  test('clicking a pill toggles it off', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Send to:', { timeout: 5000 });
    // Pills are rounded-full border buttons in the Send to row
    const sendToRow = page.locator('div.flex.flex-wrap.gap-2').filter({ hasText: 'Send to:' });
    await expect(sendToRow).toBeVisible();
    const pills = sendToRow.locator('button').filter({ hasText: '✓' });
    await expect(pills).toHaveCount(4);
    await pills.first().click();
    await expect(sendToRow.locator('button').filter({ hasText: '✓' })).toHaveCount(3);
    await expect(sendToRow.locator('button').filter({ hasText: '○' })).toHaveCount(1);
  });

  test('clicking inactive pill reactivates it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Send to:', { timeout: 5000 });
    const sendToRow = page.locator('div.flex.flex-wrap.gap-2').filter({ hasText: 'Send to:' });
    await expect(sendToRow).toBeVisible();
    const activePills = sendToRow.locator('button').filter({ hasText: '✓' });
    await activePills.first().click(); // deactivate
    await sendToRow.locator('button').filter({ hasText: '○' }).first().click(); // reactivate
    await expect(sendToRow.locator('button').filter({ hasText: '✓' })).toHaveCount(4);
  });

});

// ─────────────────────────────────────────────────────────────
// TC-04 — Per-Panel Parameters
// ─────────────────────────────────────────────────────────────
test.describe('TC-04 — Per-Panel Parameters', () => {

  test('params section shows temperature, max tokens, top-p', async ({ page }) => {
    await page.goto('/');
    // Params are always visible now
    await expect(page.getByText('Temperature').first()).toBeVisible();
    await expect(page.getByText('Max tokens').first()).toBeVisible();
    await expect(page.getByText('Top-p').first()).toBeVisible();
  });

  test('temperature range labels visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('0 precise').first()).toBeVisible();
    await expect(page.getByText('1 balanced').first()).toBeVisible();
  });

  test('complexity slider shows Age 5 by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Age 5').first()).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────
// TC-08 — Scoring buttons
// ─────────────────────────────────────────────────────────────
test.describe('TC-08 — Scoring', () => {

  test.skip('thumbs up/down buttons appear after response', async ({ page }) => {
    // Skipped: requires live API response
    // Run manually: ask a question, verify 👍 👎 appear
  });

});

// ─────────────────────────────────────────────────────────────
// TC-09 — Judge Pool
// ─────────────────────────────────────────────────────────────
test.describe('TC-09 — Judge Pool', () => {

  test('pool bar hidden when empty', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Judge Pool:')).not.toBeVisible();
  });

  test('Run Judge button not visible when pool empty', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Run Judge/ })).not.toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────
// TC-10 — Judge Tab
// ─────────────────────────────────────────────────────────────
test.describe('TC-10 — Judge Tab', () => {

  test('Judge tab loads with model selector', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Judge/ }).click();
    await expect(page.getByText('SELECT JUDGE MODEL')).toBeVisible();
  });

  test('GPT-4o Mini judge option visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Judge/ }).click();
    // Target the judge model selector section specifically
    const judgeSection = page.locator('text=SELECT JUDGE MODEL').locator('..');
    await expect(judgeSection.getByRole('button', { name: /GPT-4o Mini/ }).first()).toBeVisible();
  });

  test('DeepSeek V3 judge option visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Judge/ }).click();
    await expect(page.getByRole('button', { name: /DeepSeek V3/ }).first()).toBeVisible();
  });

  test('DeepSeek R1 judge option visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Judge/ }).click();
    await expect(page.getByRole('button', { name: /DeepSeek R1/ }).first()).toBeVisible();
  });

  test('evaluation criteria preset dropdown visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Judge/ }).click();
    await expect(page.getByText('EVALUATION CRITERIA')).toBeVisible();
    await expect(page.getByText('Select a preset...')).toBeVisible();
  });

  test('shows no responses message when pool empty', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Judge/ }).click();
    await expect(page.getByText(/No responses in pool yet/)).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────
// TC-11 — Custom Endpoint
// ─────────────────────────────────────────────────────────────
test.describe('TC-11 — Custom Endpoint', () => {

  test('Custom Endpoint tab loads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Custom Endpoint/ }).click();
    await expect(page.getByPlaceholder(/https:\/\/.*\/v1/)).toBeVisible();
  });

  test('Skip SSL toggle visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Custom Endpoint/ }).click();
    await expect(page.getByText(/Skip SSL/)).toBeVisible();
  });

  test('Save Config button visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Custom Endpoint/ }).click();
    // Tab uses display:none — wait for the tab div to become visible
    const tabDiv = page.locator('div[style*="display: block"]').filter({ hasText: /Skip SSL/ });
    await expect(tabDiv).toBeVisible({ timeout: 10000 });
    await expect(tabDiv.getByText(/💾/)).toBeVisible();
  });

  test('can type in URL field', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Custom Endpoint/ }).click();
    const urlInput = page.getByPlaceholder(/https:\/\/.*\/v1/);
    await urlInput.fill('https://api.openai.com/v1');
    await expect(urlInput).toHaveValue('https://api.openai.com/v1');
  });

});

// ─────────────────────────────────────────────────────────────
// TC-12 — KServe Tab
// ─────────────────────────────────────────────────────────────
test.describe('TC-12 — KServe Tab', () => {

  test('KServe tab loads with 18 presets count', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/KServe.*18|18.*KServe/)).toBeVisible();
  });

  test('model name placeholder is generic', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /KServe/ }).click();
    await expect(page.getByPlaceholder('e.g. your-model-name')).toBeVisible();
  });

  test('preset dropdown has options', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /KServe/ }).click();
    const select = page.locator('select').first();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(5);
  });

});

// ─────────────────────────────────────────────────────────────
// TC-13 — Stats Tab
// ─────────────────────────────────────────────────────────────
test.describe('TC-13 — Stats Tab', () => {

  test('Stats tab loads with sub-tabs', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Stats/ }).click();
    // Stats panel shows sub-tabs if data exists, or "No data yet!" if empty
    // Either way the Evaluation History heading should be visible
    await expect(page.getByRole('heading', { name: /Evaluation History/ })).toBeVisible({ timeout: 5000 });
    // Check for sub-tabs OR empty state
    const hasSubTabs = await page.locator('[data-testid="stats-response-history-btn"]').isVisible();
    const hasEmptyState = await page.getByText(/No data yet/).isVisible();
    expect(hasSubTabs || hasEmptyState).toBe(true);
  });

  test('shows empty state when no data', async ({ page }) => {
    await page.goto('/');
    // Clear localStorage first
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: /Stats/ }).click();
    await expect(page.getByText(/No data yet|No response data/)).toBeVisible();
  });

  test('Export CSV button visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Stats/ }).click();
    await expect(page.getByRole('heading', { name: /Evaluation History/ })).toBeVisible({ timeout: 5000 });
    // Export CSV only shows when history exists — check if it's there or skip
    const exportBtn = page.locator('button:has-text("Export CSV")').first();
    const isVisible = await exportBtn.isVisible();
    // If no history, Export CSV won't show — that's correct behavior
    if (isVisible) {
      await expect(exportBtn).toBeVisible();
    } else {
      await expect(page.getByText(/No data yet/)).toBeVisible();
    }
  });

});

// ─────────────────────────────────────────────────────────────
// TC-14 — Recent Queries
// ─────────────────────────────────────────────────────────────
test.describe('TC-14 — Recent Queries', () => {

  test('💡 button opens sample questions', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '💡' }).click();
    await expect(page.getByText(/Engineering|Business|AI|Science/)).toBeVisible();
  });

  test('clicking sample question fills input', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '💡' }).click();
    const firstSample = page.getByRole('button', { name: /What|How|Explain|Write/ }).first();
    const sampleText = await firstSample.textContent();
    await firstSample.click();
    const input = page.getByPlaceholder(/Ask all four panels/);
    await expect(input).not.toBeEmpty();
  });

});

// ─────────────────────────────────────────────────────────────
// TC-15 — Mobile Responsive
// ─────────────────────────────────────────────────────────────
test.describe('TC-15 — Mobile Responsive', () => {

  test('app loads on iPhone (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByText('⚡ Evalify')).toBeVisible();
  });

  test('Ask All button visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Ask All/ })).toBeVisible();
  });

  test('tabs visible on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Compare Models/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stats/ })).toBeVisible();
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390); // small tolerance
  });

});

// ─────────────────────────────────────────────────────────────
// TC-16 — Navigation
// ─────────────────────────────────────────────────────────────
test.describe('TC-16 — Navigation', () => {

  test('can switch between all tabs without error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');

    const tabs = ['Custom Endpoint', 'KServe', 'Judge', 'Stats', 'Compare Models'];
    for (const tab of tabs) {
      await page.getByRole('button', { name: new RegExp(tab) }).click();
      await page.waitForTimeout(200);
    }
    expect(errors).toHaveLength(0);
  });

  test('Compare Models tab shows panels after switching back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Stats/ }).click();
    await page.getByRole('button', { name: /Compare Models/ }).click();
    await expect(page.getByText('GPT-4o Mini')).toBeVisible();
    await expect(page.getByText('Claude Haiku')).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────
// TC-17 — Clear All
// ─────────────────────────────────────────────────────────────
test.describe('TC-17 — Clear All', () => {

  test('Clear button is always visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /🗑 Clear/ })).toBeVisible();
  });

  test('pool unaffected when clearing panels', async ({ page }) => {
    await page.goto('/');
    // Pool should still be empty after clear
    await page.getByRole('button', { name: /🗑 Clear/ }).click();
    await expect(page.getByText('Judge Pool:')).not.toBeVisible();
  });

});
