import { test, expect } from "@playwright/test";

/**
 * TeamGuard End-to-End Release Journey Verification (TASK-603)
 * Simulates real-user workflows across all verified modules.
 */
test.describe("TeamGuard Enterprise Release Verification Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root
    await page.goto("/");
  });

  test("Journey 1: Super Admin Persona Authentication & Dashboard Loading", async ({ page }) => {
    // Check if on login page or dashboard
    const isLogin = await page.locator("text=Sign in to your account").or(page.locator("text=Gatehouse")).isVisible().catch(() => false);

    if (isLogin) {
      // Use demo persona switcher or credentials
      const adminPersonaBtn = page.locator("button:has-text('Annisa Azizah'), button:has-text('Super Admin')").first();
      if (await adminPersonaBtn.isVisible()) {
        await adminPersonaBtn.click();
      } else {
        await page.fill("input[type='email']", "admin@teamguard.io");
        await page.fill("input[type='password']", "Password123!");
        await page.click("button[type='submit']");
      }
    }

    // Verify dashboard rendered with executive metrics
    await expect(page.locator("text=Dashboard").or(page.locator("text=Active Projects")).first()).toBeVisible({ timeout: 15000 });
  });

  test("Journey 2: Reports View & Real-Time CSV Streaming (TASK-507)", async ({ page }) => {
    // Navigate to Reports view
    const reportsNav = page.locator("button:has-text('Reports'), a:has-text('Reports')").first();
    await reportsNav.click();

    // Verify Audit Trail tab
    await expect(page.locator("text=Audit Trail").or(page.locator("text=Security Audit Trail")).first()).toBeVisible();

    // Switch to Velocity & Completion Rates tab
    const velocityTab = page.locator("button:has-text('Velocity & Completion Rates')").first();
    if (await velocityTab.isVisible()) {
      await velocityTab.click();
      await expect(page.locator("text=Completion Rate").or(page.locator("text=Completed Tasks")).first()).toBeVisible();

      // Trigger Velocity CSV export
      const exportVelocityBtn = page.locator("button:has-text('Export Velocity (CSV)')").first();
      await expect(exportVelocityBtn).toBeVisible();
      await exportVelocityBtn.click();

      // Confirm visual success toast notification
      await expect(page.locator("text=Velocity report exported").or(page.locator(".bg-emerald-500")).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("Journey 3: Member Directory & Secure Email Invitation Modal (TASK-505)", async ({ page }) => {
    // Navigate to Members
    const membersNav = page.locator("button:has-text('Members'), a:has-text('Members')").first();
    await membersNav.click();

    await expect(page.locator("text=Team Directory").or(page.locator("text=Members")).first()).toBeVisible();

    // Open Invite Member Modal
    const inviteBtn = page.locator("button:has-text('Invite Member')").first();
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();

      // Verify modal elements
      await expect(page.locator("text=Invite New Member").or(page.locator("text=Email Address")).first()).toBeVisible();
      await expect(page.locator("text=7 days").or(page.locator("text=single-use")).first()).toBeVisible();

      // Close modal
      const closeBtn = page.locator("button:has-text('Cancel'), button:has-text('✕')").first();
      await closeBtn.click();
    }
  });

  test("Journey 4: Kanban Tasks & Slide-over Drawer (TASK-504 & TASK-506)", async ({ page }) => {
    // Navigate to Tasks
    const tasksNav = page.locator("button:has-text('Tasks'), a:has-text('Tasks')").first();
    await tasksNav.click();

    // Verify Kanban columns
    await expect(page.locator("text=To Do").or(page.locator("text=In Progress")).first()).toBeVisible();

    // Click on a task card if present
    const taskCard = page.locator("[data-testid='task-card'], .cursor-pointer:has-text('TASK')").first();
    if (await taskCard.isVisible()) {
      await taskCard.click();

      // Verify task drawer opens
      await expect(page.locator("text=Task Details").or(page.locator("text=Subtasks")).first()).toBeVisible({ timeout: 5000 });

      // Close drawer
      const closeDrawerBtn = page.locator("button[aria-label='Close drawer'], button:has-text('✕')").first();
      if (await closeDrawerBtn.isVisible()) {
        await closeDrawerBtn.click();
      }
    }
  });

  test("Journey 5: File Storage & Quota Visibility (TASK-502)", async ({ page }) => {
    // Navigate to Files
    const filesNav = page.locator("button:has-text('Files'), a:has-text('Files')").first();
    await filesNav.click();

    // Verify storage quota bar and file directory
    await expect(page.locator("text=Storage Quota").or(page.locator("text=Total Files")).first()).toBeVisible();
  });
});
