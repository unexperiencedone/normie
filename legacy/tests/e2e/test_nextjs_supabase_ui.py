import os
import pytest
from playwright.async_api import async_playwright

@pytest.mark.asyncio
async def test_nextjs_supabase_stepwise_walkthrough():
    """Automated Playwright end-to-end verification of DBForge Studio Portal, Live Agent Synthesis, and Supabase Studio."""
    os.makedirs("results/screenshots/nextjs", exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Load application on port 3008 (DBForge Studio Portal)
        response = await page.goto("http://localhost:3008", wait_until="networkidle")
        assert response.status == 200
        title = await page.title()
        assert "DBForge" in title

        # Verify Portal Landing UI elements
        assert await page.locator("text=Architect & Deploy Databases").is_visible()
        assert await page.locator("#stitch-prompt-input").is_visible()
        assert await page.locator("text=My Projects").is_visible()
        assert await page.locator("text=Need inspiration?").is_visible()

        await page.screenshot(path="results/screenshots/nextjs/00_stitch_home_dashboard.png")

        # 2. Test Live Agent Synthesis from the Central Chat Bar
        await page.fill("#stitch-prompt-input", "Logistics hub with warehouses, shipments, and drivers")
        await page.click("#btn-stitch-submit")
        await page.wait_for_timeout(300)

        # Verify that Live Agent Synthesis Pipeline overlay appears
        assert await page.locator("text=Live Agent Synthesis Pipeline").is_visible()
        # Wait for agent synthesis stages to complete and materialize canvas nodes
        await page.wait_for_timeout(2500)
        assert await page.locator("#btn-approve-er").is_visible()

        await page.screenshot(path="results/screenshots/nextjs/00b_live_agent_synthesis.png")

        # Return back to Home Portal
        await page.click("#btn-back-to-projects")
        await page.wait_for_timeout(400)
        assert await page.locator("text=Architect & Deploy Databases").is_visible()

        # 3. Test Blank Project Creation
        await page.click("#btn-blank-project")
        await page.wait_for_timeout(400)
        assert await page.locator("text=Blank Architecture Canvas").is_visible()

        # Return back to Home Portal
        await page.click("#btn-back-to-projects")
        await page.wait_for_timeout(400)

        # 4. Launch Clinic Management System Demo Blueprint from sidebar
        await page.click("button:has-text('Clinic Management System')")
        await page.wait_for_timeout(400)

        # Verify initial Step 1 is active on the Canvas and future steps are locked
        await page.wait_for_selector("#btn-approve-er")
        step2_btn = page.locator("button:has-text('2. Normalization & Math')")
        is_disabled = await step2_btn.is_disabled()
        assert is_disabled, "Step 2 should be locked before Step 1 is approved"

        await page.screenshot(path="results/screenshots/nextjs/01_step1_er_design.png")

        # 5. Advance Step 1 -> Step 2
        await page.click("#btn-approve-er")
        await page.wait_for_timeout(400)
        await page.wait_for_selector("#calc-attrs")

        # Test Step 2 Math Engines
        await page.click("#btn-calc-closure")
        await page.wait_for_timeout(200)
        fd_out = await page.locator("#fd-terminal-output").inner_text()
        assert "Closure: [A]+ = {A, B, C, D, E}" in fd_out

        await page.click("#btn-calc-keys")
        await page.wait_for_timeout(200)
        fd_keys = await page.locator("#fd-terminal-output").inner_text()
        assert "Candidate Keys found" in fd_keys

        await page.click("#btn-run-chase")
        await page.wait_for_timeout(200)
        chase_out = await page.locator("#fd-terminal-output").inner_text()
        assert "Lossless Join Property Guaranteed" in chase_out

        await page.screenshot(path="results/screenshots/nextjs/02_step2_normalization.png")

        # 6. Advance Step 2 -> Step 3
        await page.click("#btn-confirm-schema")
        await page.wait_for_timeout(400)
        await page.wait_for_selector("#sim-sql-input")

        # Test Step 3 Security Simulator
        await page.click("button:has-text('Preset: Denied Function')")
        await page.click("#btn-eval-access")
        await page.wait_for_timeout(200)
        denied_out = await page.locator("#sim-eval-output").inner_text()
        assert "RESTRICTED FUNCTION DETECTED" in denied_out

        await page.click("button:has-text('Preset: Authorized')")
        await page.click("#btn-eval-access")
        await page.wait_for_timeout(200)
        auth_out = await page.locator("#sim-eval-output").inner_text()
        assert "STATEMENT AUTHORIZED" in auth_out

        await page.screenshot(path="results/screenshots/nextjs/03_step3_security.png")

        # 7. Advance Step 3 -> Step 4
        await page.click("#btn-approve-security")
        await page.wait_for_timeout(400)
        await page.wait_for_selector("#ddl-editor-content")
        ddl_text = await page.locator("#ddl-editor-content").inner_text()
        assert "CREATE TABLE IF NOT EXISTS patient" in ddl_text

        await page.screenshot(path="results/screenshots/nextjs/04_step4_provision.png")

        # 8. Execute Provisioning Transaction -> Step 5: Live Supabase Workspace!
        await page.click("#btn-execute-deploy")
        # Wait for deployment animation and transition into live workspace
        await page.wait_for_timeout(2200)

        # 9. Verify Supabase Table Editor
        await page.wait_for_selector("text=DATABASE TABLES")
        table_editor_text = await page.content()
        assert "patient" in table_editor_text
        assert "Elena Rostova" in table_editor_text

        # Toggle schema view
        await page.click("button:has-text('View Schema')")
        await page.wait_for_timeout(200)
        assert await page.locator("#schema-drawer").is_visible()

        # Switch to doctor table
        await page.click("button:has-text('doctor')")
        await page.wait_for_timeout(200)
        doctor_text = await page.content()
        assert "Dr. Gregory House" in doctor_text

        await page.screenshot(path="results/screenshots/nextjs/05_supabase_table_editor.png")

        # 10. Switch to SQL & Relational Algebra Studio
        await page.click("#live-tab-sql")
        await page.wait_for_timeout(300)
        await page.wait_for_selector("#sql-code-editor")

        # Execute live query
        await page.click("#btn-run-sql")
        await page.wait_for_timeout(400)
        sql_out = await page.content()
        assert "Elena Rostova" in sql_out
        assert "Dr. Gregory House" in sql_out

        # Verify Relational Algebra Tree Output (pi, sigma, bowtie)
        await page.click("#qtab-btn-algebra")
        await page.wait_for_timeout(200)
        algebra_text = await page.locator("#relational-algebra-view").inner_text()
        assert "π" in algebra_text
        assert "⋈" in algebra_text or "bowtie" in algebra_text

        await page.screenshot(path="results/screenshots/nextjs/06_supabase_sql_algebra.png")

        # 11. Verify Concurrency Lab
        await page.click("button[title='Concurrency Lab']")
        await page.wait_for_timeout(300)

        await page.click("button:has-text('Run FOR UPDATE (Correct)')")
        await page.wait_for_timeout(200)
        for_update_text = await page.locator("#lost-update-result").inner_text()
        assert "10,000" in for_update_text

        await page.click("button:has-text('Trigger Inverted Lock Order')")
        await page.wait_for_timeout(200)
        deadlock_text = await page.locator("#deadlock-result").inner_text()
        assert "DEADLOCK DETECTED" in deadlock_text

        await page.click("button:has-text('Serializable (Protected)')")
        await page.wait_for_timeout(200)
        ssi_text = await page.locator("#write-skew-result").inner_text()
        assert "SERIALIZABLE PROTECTED" in ssi_text

        await page.screenshot(path="results/screenshots/nextjs/07_supabase_concurrency.png")

        # 12. Verify Settings & Database Connection
        await page.click("button[title='Database Connection & Keys']")
        await page.wait_for_timeout(300)
        settings_text = await page.content()
        assert "5432" in settings_text
        assert "PostgreSQL" in settings_text

        await page.screenshot(path="results/screenshots/nextjs/08_supabase_settings.png")

        # 13. Test navigation back to Projects
        await page.click("#btn-back-to-projects")
        await page.wait_for_timeout(300)
        assert await page.locator("text=Architect & Deploy Databases").is_visible()

        await browser.close()
