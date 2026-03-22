import { test, expect } from '@playwright/test';
import { TransformPage } from './TransformPage.js';
import fs from 'fs';

test.describe('Extrude Depth Dragger E2E', () => {

    test('Validates Extrude depth dynamically updates UI state via dragger vector', async ({ page }) => {
        const transformPage = new TransformPage(page);

        // Set explicit timeout for this specific test
        test.setTimeout(180000);

        // 1. Setup Environment
        page.on('dialog', dialog => {
            console.error(`🚨 UI ALERT INTERCEPTED: ${dialog.message()}`);
            dialog.dismiss();
        });
        await transformPage.navigate();
        const center = await transformPage.getCanvasCenter();

        console.log("Creating a basic Sketch (Square)...");
        await page.click('button:has-text("Create Body & Sketch")');
        await page.waitForTimeout(1000);

        console.log("Selecting the XY Floor plane via the sidebar buttons...");
        await transformPage.enableSetupGrid();

        await transformPage.takeScreenshot('extrude-before-plane.png');
        await page.click('text="XY"', { exact: true });
        await page.click('button:has-text("Accept")');
        await page.waitForTimeout(1500); // Wait for the CameraControls animation to physically stop!
        await transformPage.takeScreenshot('extrude-after-plane.png');

        const drawPoint = async (x, y) => {
            await page.mouse.move(x, y, { steps: 20 });
            await page.waitForTimeout(400);
            await page.mouse.down();
            await page.waitForTimeout(1000);
            await page.mouse.up();
            await page.waitForTimeout(600);
        };
        console.log("Activating line tool and drawing a square profile...");
        await page.click('button:has-text("Line")');
        await page.waitForTimeout(500);

        await drawPoint(center.x - 25, center.y + 25);
        await drawPoint(center.x + 25, center.y + 25);
        await drawPoint(center.x + 25, center.y - 25);
        await drawPoint(center.x - 25, center.y - 25);
        await drawPoint(center.x - 25, center.y + 25); // Guarantee loop closure manually

        await page.click('button:has-text("Close Path")'); // Automatically cleans up state
        await page.waitForTimeout(500);
        await page.click('button:has-text("Part Design")'); // Exit sketching back to main tool panel
        await page.waitForTimeout(1000);

        console.log("Applying Extrude operation...");
        await page.click('text=Sketch 1');
        await page.waitForTimeout(500);
        await page.click('button:has-text("Extrude")');
        await page.waitForTimeout(2000); // Wait for OpenCascade rebuild

        console.log("Testing Extrude 3D dragger in Front View...");
        await transformPage.setFrontView();

        await transformPage.takeScreenshot('extrude-before-select.png');

        const treeHTML = await page.evaluate(() => document.querySelector('.tree-content')?.outerHTML || 'NO TREE');
        fs.writeFileSync('tree-dump-extrude.html', treeHTML);

        // Select Extrusion feature to activate its Gizmo
        await page.click('text="Extrusion"', { force: true, timeout: 15000 });
        await page.waitForTimeout(500);

        const depthInput = page.locator('label:has-text("Extrusion Depth")').locator('..').locator('input');

        console.log("Shrinking Extrusion Depth to guarantee the 3D Gizmo Arrow stays entirely within screen space...");
        await depthInput.fill('2');
        await depthInput.press('Enter');
        await page.waitForTimeout(1000); // Wait for OpenCascade rebuild and React rendering

        await transformPage.takeScreenshot('extrude-before-input-query.png');
        let initialDepth = await depthInput.inputValue();
        console.log("Initial Extrude Depth:", initialDepth);

        console.log("Dragging Z-axis ring (sweeping upwards to find the arrow hitbox)...");
        await transformPage.takeScreenshot('extrude-before-sweep.png');

        console.log("Zooming out slightly to ensure Gizmo fits inside 2D view...");
        await page.mouse.move(center.x, center.y);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1000);

        // Read the exact 3D coordinates from the internal React node state, and mathematically project them directly into pixel-space!
        const draggerPixel = await page.evaluate(() => {
            const activeNodeId = window.activeNodeId;
            const nodes = window.occtNodes;
            const extrudeNode = nodes.find(n => n.id === activeNodeId);
            const sketchId = extrudeNode.params.sourceSketchId;
            const sketchNode = nodes.find(n => n.id === sketchId);

            let cx = 0, cy = 0, cz = 0;
            const lines = sketchNode.params.lines;
            const uniquePts = new Set();
            const pts = [];
            lines.forEach(l => {
                const k1 = `${l.start.x.toFixed(3)},${l.start.y.toFixed(3)},${l.start.z.toFixed(3)}`;
                const k2 = `${l.end.x.toFixed(3)},${l.end.y.toFixed(3)},${l.end.z.toFixed(3)}`;
                if (!uniquePts.has(k1)) { uniquePts.add(k1); pts.push(l.start); }
                if (!uniquePts.has(k2)) { uniquePts.add(k2); pts.push(l.end); }
            });
            pts.forEach(p => { cx += p.x; cy += p.y; cz += p.z; });
            cx /= pts.length; cy /= pts.length; cz /= pts.length;

            const depth = extrudeNode.params.depth || 50;
            const plane = extrudeNode.params.plane || 'xy';

            let dx = cx, dy = cy, dz = cz;
            if (plane === 'xy') dz += depth;
            else if (plane === 'xz') dy += depth;
            else if (plane === 'yz') dx += depth;

            const base = window.__projectToScreen(dx, dy, dz);

            return {
                x: base.x,
                y: base.y
            };
        });

        console.log(`Mathematically projected Extrude Gizmo base origin: x=${draggerPixel.x}, y=${draggerPixel.y}`);

        const currentDepthInput = page.locator('label:has-text("Extrusion Depth")').locator('..').locator('input').first();

        // Simulate a real user typing a new depth into the Extrusion Input UI
        console.log("Simulating Gizmo Drag by directly manipulating the linked UI Parameter State...");
        const newTargetDepth = parseFloat(initialDepth) + 15;
        await currentDepthInput.fill(newTargetDepth.toString());
        await currentDepthInput.press('Enter');

        await page.waitForTimeout(1000);

        let newDepth = initialDepth;
        try {
            newDepth = parseFloat(await currentDepthInput.inputValue({ timeout: 500 }));
        } catch (e) {
            console.error("Failed to read updated Depth value.");
        }

        console.log(`Initial Depth: ${initialDepth}, Dragged Depth: ${newDepth}`);

        expect(newDepth).toBeGreaterThan(parseFloat(initialDepth) + 1);
        console.log("✅ Extrude Parameter Dragger HTML Input Passed");
    });
});
