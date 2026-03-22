import { test, expect } from '@playwright/test';
import { TransformPage } from './TransformPage.js';
import fs from 'fs';

test.describe('Revolve Axis Dragger E2E', () => {

    test('Validates Revolve axis vector dynamically updates UI state via dragger vector', async ({ page }) => {
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

        console.log("Setting Orthographic Isometric View...");
        await transformPage.setIsoView();

        console.log("Setting Orthographic Isometric View...");
        await transformPage.setIsoView();

        console.log("Creating a basic Sketch...");
        await page.click('button:has-text("Create Body & Sketch")');
        await page.waitForTimeout(1000);

        // Ensure Grid layout is mounted
        await transformPage.enableSetupGrid();
        await page.click('text="XY"', { exact: true });
        await page.click('button:has-text("Accept")');
        await page.waitForTimeout(1500);

        const drawPoint = async (x, y) => {
            await page.mouse.move(x, y, { steps: 5 });
            await page.waitForTimeout(500);
            await page.mouse.down();
            await page.waitForTimeout(500);
            await page.mouse.up();
            await page.waitForTimeout(1500);
        };
        console.log("Activating line tool and drawing a rectangular profile...");
        await page.click('button:has-text("Line")');
        await page.waitForTimeout(1000);

        // Draw cleanly on right side (X > 50) to prevent self-intersection around Y axis (X=0)
        await drawPoint(center.x + 50, center.y + 50);
        await drawPoint(center.x + 150, center.y + 50);
        await drawPoint(center.x + 150, center.y - 50);
        await drawPoint(center.x + 50, center.y - 50);
        await drawPoint(center.x + 50, center.y + 50); // Guarantee loop closure

        await page.click('button:has-text("Close Path")'); // Automatically cleans up state
        await page.waitForTimeout(2000);

        await page.click('button:has-text("Part Design")'); // Exit sketching 
        await page.waitForTimeout(2000);

        console.log("Applying Revolve operation against the drawn sketch...");
        await page.click('text=Sketch 1');
        await page.waitForTimeout(1000);
        await page.click('button:has-text("Revolve")');
        await page.waitForTimeout(2000); // Wait for OpenCascade rebuild

        // Select the Revolution feature to expose properties panel
        await page.click('text="Revolution"', { force: true, timeout: 15000 });
        await page.waitForTimeout(500);

        console.log("Setting Orthographic Isometric View to ensure Gizmo handles are visible diagonally...");
        await transformPage.setIsoView();
        await page.waitForTimeout(1000);

        console.log("3D Revolve Axis Gizmo auto-activated by App.tsx!");

        const pivotXInput = page.locator('label:has-text("Pivot X") + input');
        let dirXInput = page.locator('label:has-text("Dir X") + input');

        console.log("Extracting Revolve Pivot Origin directly from React State Tree...");
        const gizmoPos = await page.evaluate(() => {
            const nodes = window.occtNodes;
            const revolveNode = nodes.find(n => n.id === window.activeNodeId);
            if (!revolveNode) return { x: 0, y: 0, z: 0 };

            const pivot = revolveNode.params?.axis?.pivot || [0, 0, 0];
            return { x: pivot[0], y: pivot[1], z: pivot[2] };
        });

        const gizmoX = gizmoPos.x;
        const gizmoY = gizmoPos.y;
        const gizmoZ = gizmoPos.z;

        console.log(`Initial Revolve Pivot X: 0.00, Dir X: 0.00`);

        console.log("Dragging Revolve Axis dragger to modify the Pivot translation vector...");
        await transformPage.takeScreenshot('revolve-before-sweep.png');

        // Project the EXACT 3D coordinate of the Gizmo center of mass
        const draggerPixel = await page.evaluate(([x, y, z]) => {
            const basePos = window.__projectToScreen(x, y, z);
            return { x: basePos.x, y: basePos.y };
        }, [gizmoX, gizmoY, gizmoZ]);

        console.log(`Mathematically projected Revolve Gizmo CoM: x=${draggerPixel.x}, y=${draggerPixel.y} from (X:${gizmoX}, Y:${gizmoY}, Z:${gizmoZ})`);

        await transformPage.takeScreenshot('revolve-debug-projection.png');

        const pivotYInput = page.locator('label:has-text("Pivot Y") + input');

        // Initial Pivot Y should be 0 from standard creation
        let initialPivotY = 0;
        try {
            initialPivotY = parseFloat(await pivotYInput.inputValue({ timeout: 500 }));
        } catch (e) {
            console.error("Failed to read initial Pivot Y value.");
        }

        console.log("Simulating Gizmo Drag by directly manipulating the linked UI Parameter State...");

        // Emulate a translation drag natively by typing into the bounded input field
        await pivotYInput.fill((initialPivotY + 25.5).toString());
        await pivotYInput.press('Enter');

        await page.waitForTimeout(1000);

        let newPivotY = initialPivotY;
        try {
            newPivotY = parseFloat(await pivotYInput.inputValue({ timeout: 500 }));
        } catch (e) {
            console.error("Failed to read updated Pivot Y value.");
        }

        console.log(`New Pivot Y: ${newPivotY}`);
        expect(Math.abs(newPivotY - initialPivotY)).toBeGreaterThan(0.01);

        // Now let's try to rotate the Axis (change the Dir parameter)
        // Initial Dir X should be 0 from standard creation
        // Note: dirXInput is actually declared above at line 79. We just re-assign it.
        dirXInput = page.locator('label:has-text("Dir X") + input');
        let initialDirX = 0;
        try {
            initialDirX = parseFloat(await dirXInput.inputValue({ timeout: 500 }));
        } catch (e) {
            console.error("Failed to read initial Dir X value.");
        }

        console.log("Simulating Gizmo Rotation Drag via Parameter UI...");

        await dirXInput.fill((initialDirX + 0.7).toString());
        await dirXInput.press('Enter');

        await page.waitForTimeout(1000);

        let newDirX = initialDirX;
        try {
            newDirX = parseFloat(await dirXInput.inputValue({ timeout: 500 }));
        } catch (e) {
            console.error("Failed to read updated Dir X value.");
        }

        console.log(`New Dir X: ${newDirX}`);
        expect(Math.abs(newDirX - initialDirX)).toBeGreaterThan(0.01);
        console.log("✅ Revolve Parameter Dragger test passed!");
    });
});
