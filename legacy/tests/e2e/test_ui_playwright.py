import pytest
import os
from playwright.async_api import async_playwright


@pytest.mark.asyncio
async def test_dbforge_ui_full_walkthrough():
    """Automated Playwright end-to-end verification of DBForge impeccable UI."""
    os.makedirs("results/screenshots", exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Load application
        response = await page.goto("http://localhost:8008", wait_until="networkidle")
        assert response.status == 200
        title = await page.title()
        assert "DBForge" in title

        # Verify header elements
        brand_name = await page.locator(".brand-name").inner_text()
        assert brand_name == "DBForge"
        await page.screenshot(path="results/screenshots/01_design_studio.png")

        # 2. Test Design Studio
        await page.click("#btn-run-design")
        await page.wait_for_timeout(500)
        chat_text = await page.locator("#design-chat-viewport").inner_text()
        assert "Synthesizing formal ER model" in chat_text

        # 3. Test Schema & Normalization
        await page.click("#tab-btn-schema")
        await page.wait_for_selector("#calc-attrs")
        await page.click("#btn-calc-closure")
        await page.wait_for_timeout(300)
        fd_output = await page.locator("#fd-terminal-output").inner_text()
        assert "A, B, C, D, E" in fd_output

        await page.click("#btn-calc-keys")
        await page.wait_for_timeout(300)
        fd_keys = await page.locator("#fd-terminal-output").inner_text()
        assert "{B, C, D}" in fd_keys

        await page.screenshot(path="results/screenshots/02_schema_normalization.png")

        # 4. Test Security & RBAC Access Simulator
        await page.click("#tab-btn-security")
        await page.wait_for_selector("#sim-role-picker")

        # Test Denied preset
        await page.click("button:has-text('Preset: Denied Function')")
        await page.click("#btn-eval-access")
        await page.wait_for_timeout(300)
        sim_denied = await page.locator("#sim-eval-output").inner_text()
        assert "RESTRICTED FUNCTION" in sim_denied or "VIOLATION" in sim_denied

        # Test Authorized preset
        await page.click("button:has-text('Preset: Authorized')")
        await page.click("#btn-eval-access")
        await page.wait_for_timeout(300)
        sim_auth = await page.locator("#sim-eval-output").inner_text()
        assert "STATEMENT AUTHORIZED" in sim_auth

        await page.screenshot(path="results/screenshots/03_security_rbac.png")

        # 5. Test Deploy & DDL
        await page.click("#tab-btn-deploy")
        await page.wait_for_selector("#ddl-editor-content")
        ddl_text = await page.locator("#ddl-editor-content").inner_text()
        assert "CREATE TABLE IF NOT EXISTS patient" in ddl_text
        await page.click("button:has-text('Execute Provisioning Transaction')")
        deploy_banner = await page.locator("#deploy-notification").inner_text()
        assert "Provisioning PostgreSQL Schema" in deploy_banner

        # 6. Test Query Console & Sub-Tabs
        await page.click("#tab-btn-query")
        await page.wait_for_selector("#nl-query-input")
        await page.click("#btn-run-query")
        await page.wait_for_timeout(400)

        # Check Relational Algebra tab
        await page.click("#qtab-btn-algebra")
        algebra_text = await page.locator("#algebra-math-render").inner_text()
        assert "π" in algebra_text or "pi" in algebra_text.lower()

        # Check Validated SQL tab
        await page.click("#qtab-btn-sql")
        sql_text = await page.locator("#query-sql-render").inner_text()
        assert "SELECT" in sql_text and "LIMIT 1000" in sql_text

        # Check Plan tab
        await page.click("#qtab-btn-plan")
        plan_text = await page.locator("#query-plan-render").inner_text()
        assert "Hash Join" in plan_text or "Scan" in plan_text

        await page.screenshot(path="results/screenshots/04_query_console.png")

        # 7. Test Transactions & Approvals
        await page.click("#tab-btn-transactions")
        await page.wait_for_selector("#approval-item-1")
        await page.click("button:has-text('Authorize & Commit')")
        await page.wait_for_timeout(200)
        approval_res = await page.locator("#approval-item-1").inner_text()
        assert "APPROVED" in approval_res

        # 8. Test Concurrency Lab
        await page.click("#tab-btn-concurrency")
        await page.wait_for_selector("#lost-update-result")

        # Test Lost update simulation
        await page.click("button:has-text('Run FOR UPDATE (Correct)')")
        lu_text = await page.locator("#lost-update-result").inner_text()
        assert "10,000" in lu_text

        # Test Deadlock simulation
        await page.click("button:has-text('Trigger Inverted Lock Order')")
        dl_text = await page.locator("#deadlock-result").inner_text()
        assert "DEADLOCK DETECTED" in dl_text

        # Test Write Skew simulation
        await page.click("button:has-text('Serializable (Protected)')")
        ws_text = await page.locator("#write-skew-result").inner_text()
        assert "SERIALIZABLE" in ws_text or "Constraint Preserved" in ws_text

        await page.screenshot(path="results/screenshots/05_concurrency_lab.png")

        await browser.close()
