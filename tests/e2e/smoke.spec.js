import { test, expect } from '@playwright/test'

test.describe('Pilot Smoke', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByPlaceholder('Email address')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('storefront shop page loads', async ({ page }) => {
    await page.goto('/shop')

    await expect(page).toHaveURL(/\/shop$/)
    await expect(page.getByRole('heading', { name: 'Shop Everything' })).toBeVisible()
  })

  test('admin route redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/login(\?|$)/)
    await expect(page.getByPlaceholder('Email address')).toBeVisible()
  })

  test('checkout rejects empty state cleanly', async ({ page }) => {
    await page.goto('/checkout')

    await expect(page.getByText('Your cart is empty right now.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return to the shop' })).toBeVisible()
  })
})
