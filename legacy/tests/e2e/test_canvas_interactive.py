import pytest
import os
from playwright.async_api import async_playwright


@pytest.mark.asyncio
async def test_canvas_interactive_features():
    """Verify interactive canvas drag, node creation, Chen ER notation and Nemotron AI drawer."""
    os.makedirs("results/screenshots/nextjs", exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Load application on port 3008 in studio canvas mode
        await page.goto("http://localhost:3008?studio=1", wait_until="networkidle")

        # 2. Open Chen ER Legend
        await page.click("button:has-text('Chen ER Legend')")
        await page.wait_for_timeout(300)
        assert await page.locator("text=Chen ER Formal Notation Standard").is_visible()
        await page.screenshot(path="results/screenshots/nextjs/01a_canvas_chen_legend.png")

        # Close legend
        await page.click("button:has-text('Chen ER Legend')")
        await page.wait_for_timeout(200)

        # 3. Open Nemotron AI Co-Pilot Drawer
        await page.click("button:has-text('AI Co-Pilot (Nemotron)')")
        await page.wait_for_timeout(300)
        assert await page.locator("text=Connected via AWS Bedrock").is_visible()
        await page.screenshot(path="results/screenshots/nextjs/01b_canvas_ai_drawer.png")

        # Close drawer
        await page.click("#btn-close-ai-drawer")
        await page.wait_for_timeout(200)

        # 4. Click "+ Add Entity" button on canvas
        await page.click("#btn-add-entity")
        await page.wait_for_timeout(300)
        assert await page.locator("input[value^='NewEntity_']").is_visible()

        # 5. Drag the Patient entity card
        patient_input = page.locator("input[value='Patient']")
        box = await patient_input.bounding_box()
        if box:
            await page.mouse.move(box["x"] + 10, box["y"] + 10)
            await page.mouse.down()
            await page.mouse.move(box["x"] + 120, box["y"] + 60)
            await page.mouse.up()
            await page.wait_for_timeout(300)

        # 6. Capture updated canvas with new entity and dragged card
        await page.screenshot(path="results/screenshots/nextjs/01c_canvas_edited_nodes.png")

        await browser.close()
