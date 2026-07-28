import { test, expect } from '@playwright/test';

test('App should load and render properly', async ({ page }) => {
  await page.goto('http://localhost:5173/'); // adjust port if needed

  // Check title
  await expect(page).toHaveTitle(/Kubernetes 中文交互学习实验室/i);
});
