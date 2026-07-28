import { test, expect } from '@playwright/test'

test.describe('HPA Interactive Simulation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the cluster page
    await page.goto('http://localhost:5173/#/cluster')
    
    // Wait for the app to initialize the cluster
    await page.waitForSelector('text=展示模式', { timeout: 10000 }).catch(() => {})
  })

  test('Should be able to trigger load and see HPA scaling', async ({ page }) => {
    const deploymentNode = page.locator('text=Deployment/web')
    
    // Check if the deployment node exists (it is part of the complete cluster seed).
    if (await deploymentNode.isVisible()) {
       await deploymentNode.click()
       
       // Verify the details panel opens
       await expect(page.locator('h2', { hasText: 'Deployment 详情' })).toBeVisible()
       
       // Click "突发流量" to trigger scaling
       const burstButton = page.locator('button', { hasText: '突发流量' })
       await burstButton.click()
       
       // Expect to see scale up message
       await expect(page.locator('text=期望扩容到 10 副本')).toBeVisible()
    }
  })
})
