/**
 * E2E Browser Test for Web SDK Runtime Flow
 *
 * Tests the complete Initialize → Login → Logout flow in a real browser.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

interface TestConfig {
  apiKey: string;
  applicationId: string;
  apiBaseURL: string;
  environment: string;
}

test.describe('Web SDK E2E', () => {
  let testConfig: TestConfig;

  test.beforeAll(async () => {
    // Read test config from file
    const configPath = join(__dirname, 'test-config.json');
    const configData = readFileSync(configPath, 'utf-8');
    testConfig = JSON.parse(configData);
  });

  test('should complete Initialize → Login → Logout flow', async ({ page }) => {
    // Navigate to example app
    await page.goto('http://localhost:3000/example/');

    // Wait for page to load
    await page.waitForSelector('#btn-init');

    // Inject test configuration into sessionStorage
    await page.evaluate((config) => {
      sessionStorage.setItem('pushplatform_test_config', JSON.stringify(config));
      console.log('✅ Test configuration injected');
    }, testConfig);

    // Reload to pick up config
    await page.reload();
    await page.waitForSelector('#btn-init');

    // Listen for console logs to verify no CORS errors
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      console.log('[Browser Console]:', text);
    });

    // Listen for page errors
    page.on('pageerror', error => {
      console.error('[Page Error]:', error.message);
    });

    // Listen for failed requests
    page.on('requestfailed', request => {
      console.error('[Request Failed]:', request.url(), request.failure()?.errorText);
    });

    // Step 1: Initialize SDK
    await test.step('Initialize SDK', async () => {
      await page.click('#btn-init');

      // Wait for initialization to complete
      await page.waitForSelector('#init-status.status.success', { timeout: 10000 });

      // Verify installation ID is displayed (not [object Promise])
      const installationId = await page.textContent('#installation-id');
      expect(installationId).toBeTruthy();
      expect(installationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(installationId).not.toContain('[object Promise]');

      console.log('✅ Installation ID:', installationId);

      // Verify no CORS errors in console
      const hasCorsError = consoleMessages.some(msg =>
        msg.toLowerCase().includes('cors') && msg.toLowerCase().includes('error')
      );
      expect(hasCorsError).toBe(false);
    });

    // Step 2: Login User
    await test.step('Login User', async () => {
      // Enter user ID
      await page.fill('#user-id-input', 'test_user_001');

      // Click login button
      await page.click('#btn-login');

      // Wait for login to complete
      await page.waitForTimeout(500);

      // Verify auth status shows logged in
      const authStatus = await page.textContent('#auth-status');
      expect(authStatus).toContain('test_user_001');
      expect(authStatus).toContain('Logged in');

      console.log('✅ User logged in:', authStatus);
    });

    // Step 3: Logout User
    await test.step('Logout User', async () => {
      // Click logout button
      await page.click('#btn-logout');

      // Wait for logout to complete
      await page.waitForTimeout(500);

      // Verify auth status shows anonymous
      const authStatus = await page.textContent('#auth-status');
      expect(authStatus).toContain('Anonymous');
      expect(authStatus).not.toContain('test_user_001');

      console.log('✅ User logged out:', authStatus);
    });

    // Verify no unexpected errors
    const hasUnexpectedError = consoleMessages.some(msg =>
      (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed')) &&
      !msg.includes('[SDK Test]') // Allow expected test errors
    );

    if (hasUnexpectedError) {
      console.warn('Unexpected errors in console:', consoleMessages.filter(msg =>
        msg.toLowerCase().includes('error')
      ));
    }
  });

  test('should handle initialization failure correctly', async ({ page }) => {
    await page.goto('http://localhost:3000/example/');
    await page.waitForSelector('#btn-init');

    // Inject invalid API key
    await page.evaluate(() => {
      const testConfig = {
        apiKey: 'sk_live_invalid_key_000000000000',
        applicationId: '00000000-0000-0000-0000-000000000000',
        apiBaseURL: 'http://localhost:8080',
        environment: 'development',
      };
      sessionStorage.setItem('pushplatform_test_config', JSON.stringify(testConfig));
    });

    await page.reload();
    await page.waitForSelector('#btn-init');

    // Listen for alert
    let alertMessage = '';
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    // Try to initialize
    await page.click('#btn-init');

    // Wait for error
    await page.waitForTimeout(2000);

    // Verify error is shown
    expect(alertMessage).toBeTruthy();
    expect(alertMessage.toLowerCase()).toContain('error');

    // Verify installation ID is NOT displayed (should be "-" placeholder or empty)
    const installationId = await page.textContent('#installation-id');
    expect(installationId === '-' || !installationId).toBe(true);

    console.log('✅ Initialization failure handled correctly');
  });
});
