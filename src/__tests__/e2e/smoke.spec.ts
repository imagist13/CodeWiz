import { test, expect } from '@playwright/test';
import {
  goToChat,
  goToPlugins,
  goToMCP,
  goToSettings,
  collectConsoleErrors,
  filterCriticalErrors,
  waitForPageReady,
} from '../helpers';

test.describe('Smoke @smoke', () => {
  test('Home redirects to /chat @smoke', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const response = await page.goto('/');
    await waitForPageReady(page);

    expect(response?.status()).toBeLessThan(400);
    expect(page.url()).toContain('/chat');

    const title = await page.title();
    expect(title).not.toContain('404');
    expect(title).not.toContain('500');

    const hasErrorOverlay = await page.locator('#__next-build-error, [data-nextjs-dialog]').count();
    expect(hasErrorOverlay).toBe(0);

    const critical = filterCriticalErrors(errors);
    expect(critical).toHaveLength(0);
  });

  test('Chat page loads @smoke', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await goToChat(page);

    const title = await page.title();
    expect(title).not.toContain('404');
    expect(title).not.toContain('500');

    const hasErrorOverlay = await page.locator('#__next-build-error, [data-nextjs-dialog]').count();
    expect(hasErrorOverlay).toBe(0);

    const critical = filterCriticalErrors(errors);
    expect(critical).toHaveLength(0);
  });

  test('Plugins page loads @smoke', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await goToPlugins(page);

    const title = await page.title();
    expect(title).not.toContain('404');
    expect(title).not.toContain('500');

    const hasErrorOverlay = await page.locator('#__next-build-error, [data-nextjs-dialog]').count();
    expect(hasErrorOverlay).toBe(0);

    const critical = filterCriticalErrors(errors);
    expect(critical).toHaveLength(0);
  });

  test('MCP page loads @smoke', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await goToMCP(page);

    const title = await page.title();
    expect(title).not.toContain('404');
    expect(title).not.toContain('500');

    const hasErrorOverlay = await page.locator('#__next-build-error, [data-nextjs-dialog]').count();
    expect(hasErrorOverlay).toBe(0);

    const critical = filterCriticalErrors(errors);
    expect(critical).toHaveLength(0);
  });

  test('Settings page loads @smoke', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await goToSettings(page);

    const title = await page.title();
    expect(title).not.toContain('404');
    expect(title).not.toContain('500');

    const hasErrorOverlay = await page.locator('#__next-build-error, [data-nextjs-dialog]').count();
    expect(hasErrorOverlay).toBe(0);

    const critical = filterCriticalErrors(errors);
    expect(critical).toHaveLength(0);
  });
});
