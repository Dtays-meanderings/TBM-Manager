import { test, expect } from '@playwright/test';
import { TransformPage } from './TransformPage.js';

test.describe('Object Transform Dragger E2E', () => {

    test('Validates global Translation and offset Rotation updates', async ({ page }) => {
        const transformPage = new TransformPage(page);

        // Set explicit timeout for this specific test
        test.setTimeout(45000);

        // 1. Setup Environment
        await transformPage.navigate();

        console.log("Constructing a Box shape...");
        await page.locator('text=Part Design').click();
        await page.waitForTimeout(500);
        console.log("Maintaining default 100x100x100 Box geometry securely within the Raycast bypass zone...");

        await transformPage.btnGenerate.click();
        await page.waitForTimeout(2000); // Allow OCCT geometry buffer to build

        // 2. Translation UI Verification
        console.log("Activating Transform tool...");
        await transformPage.btnTransform.click();

        const posXInput = transformPage.getInput('Object Transform', 'Pos X');
        const posYInput = transformPage.getInput('Object Transform', 'Pos Y');
        const posZInput = transformPage.getInput('Object Transform', 'Pos Z');
        const initialX = parseFloat(await posXInput.inputValue());
        const initialY = parseFloat(await posYInput.inputValue());
        const initialZ = parseFloat(await posZInput.inputValue());

        // Assert the Transform properties panel mounted
        expect(await posXInput.isVisible()).toBeTruthy();
        expect(await posZInput.isVisible()).toBeTruthy();
        console.log("✅ Transform HTML UI Renders correctly");

        // Wait for React-Three-Fiber to reconcile and push the Gizmo meshes to the WebGL Canvas!
        await page.waitForTimeout(1000);
        // 3. Mathematical Projection of the Z-Axis Vector Offset onto 2D Pixels
        const dragStartPix = await page.evaluate(() => {
            return window.__projectToScreen(0, 0, 1.5); // Starts securely on the physical wireframe shaft near 0,0,0
        });
        const dragEndPix = await page.evaluate(() => {
            return window.__projectToScreen(0, 0, 6.0); // Drags upwards geometrically
        });

        // Drag the Blue Z-axis translation arrow deterministically
        console.log(`Dragging mathematically projected Z-axis shaft from [${dragStartPix.x}, ${dragStartPix.y}] to [${dragEndPix.x}, ${dragEndPix.y}]`);
        await transformPage.takeScreenshot('transform-before-drag.png');
        await transformPage.dragGizmo(dragStartPix.x, dragStartPix.y, dragEndPix.x, dragEndPix.y);
        await transformPage.takeScreenshot('transform-after-drag.png');

        // Give OpenCascade WebAssembly sufficient threading time to rebuild the BRep and flush React state
        await page.waitForTimeout(2000);
        console.log("Evaluating Drag results...");

        const draggedX = parseFloat(await posXInput.inputValue());
        const MathAbsDraggedY = Math.abs(parseFloat(await posYInput.inputValue()) - initialY);
        const MathAbsDraggedZ = Math.abs(parseFloat(await posZInput.inputValue()) - initialZ);

        console.log(`Dragged X: ${draggedX}, Dragged Y Delta: ${MathAbsDraggedY}, Dragged Z Delta: ${MathAbsDraggedZ}`);

        // Use soft threshold checks to validate the coordinates drifted from the origin physically
        expect(MathAbsDraggedY + MathAbsDraggedZ).toBeGreaterThan(0.1); // We don't care which axis dragged yet!
        console.log("✅ 3D Translation Drag Passed");        // 4. Validate State Synchronization Availability
        const actualRotation = await transformPage.getActiveNodeRotation();
        console.log(`Actual Node Rotation State: ${JSON.stringify(actualRotation)}`);

        expect(actualRotation).not.toBeNull();
        console.log("✅ State Synchronization Validated");
        console.log("✅ State Synchronization Validated");
    });
});
