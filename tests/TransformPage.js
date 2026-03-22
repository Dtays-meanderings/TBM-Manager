export class TransformPage {
    constructor(page) {
        this.page = page;
        this.btnBox = page.locator('button:has-text("Box")');
        this.btnGenerate = page.locator('button:has-text("Generate Base Geometry")');
        this.btnTransform = page.locator('button:has-text("Translate")');
    }

    async navigate() {
        console.log("Navigating to http://localhost:5173 ...");
        await this.page.goto('http://localhost:5173');
        await this.page.waitForSelector('text=Kernel Ready');
    }

    async getCanvasCenter() {
        const box = await this.page.evaluate(() => {
            const c = document.querySelector('canvas');
            if (!c) return null;
            const rect = c.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        if (!box) throw new Error("Could not find <canvas>");
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }

    async enableSetupGrid() {
        // Ensure the sidebar toggle is active on the main Document tab
        const gridLabel = this.page.locator('label:has-text("Show Setup Grid")');
        if (await gridLabel.count() > 0) {
            const isChecked = await gridLabel.locator('input').isChecked();
            if (!isChecked) {
                await gridLabel.click();
                await this.page.waitForTimeout(500);
            }
        }
    }

    async setTopView() {
        await this.page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Top View');
            if (btn) btn.click();
        });
        await this.page.waitForTimeout(500);
    }

    async setFrontView() {
        await this.page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Front View');
            if (btn) btn.click();
        });
        await this.page.waitForTimeout(500);
    }

    async setIsoView() {
        await this.page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Isometric View');
            if (btn) btn.click();
        });
        await this.page.waitForTimeout(500);
    }

    async takeScreenshot(fileName) {
        await this.page.screenshot({ path: fileName });
    }

    getInput(panelTitle, inputLabel) {
        const panel = this.page.locator(`h3:has-text("${panelTitle}")`).locator('..');
        return panel.locator(`label:has-text("${inputLabel}")`).locator('..').locator('input');
    }

    async dragGizmo(startX, startY, endX, endY) {
        await this.page.mouse.move(startX, startY);
        await this.page.waitForTimeout(50);
        await this.page.mouse.down();
        await this.page.waitForTimeout(50);
        await this.page.mouse.move(endX, endY, { steps: 5 });
        await this.page.waitForTimeout(50);
        await this.page.mouse.up();
        await this.page.waitForTimeout(200); // Wait for the state to debounce/sync
    }

    // Fetches the activeNode's raw rotation parameter directly from the React state attached to window
    async getActiveNodeRotation() {
        return await this.page.evaluate(() => {
            if (window.occtNodes && window.activeNodeId) {
                const node = window.occtNodes.find(n => n.id === window.activeNodeId);
                return node?.params?.rotation || [0, 0, 0];
            }
            return null;
        });
    }
}
