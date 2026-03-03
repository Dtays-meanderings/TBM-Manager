import { Vector3 } from 'three';
import { init_planegcs_module, GcsWrapper, SketchLine, SketchPoint, Constraint, Algorithm } from '@salusoft89/planegcs';
import planegcsWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';

export interface SolverConstraint {
    type: string;
    elements: { type: 'point' | 'line', index: number }[];
    value?: number;
}

export class SolverService {
    private gcs: GcsWrapper | null = null;

    async init() {
        if (!this.gcs) {
            const module = await init_planegcs_module({ locateFile: () => planegcsWasm });
            this.gcs = new GcsWrapper(new module.GcsSystem());
        }
    }

    solve(
        sketchLines: { start: Vector3, end: Vector3 }[],
        sketchPoints: Vector3[],
        constraints: SolverConstraint[]
    ): { lines: { start: Vector3, end: Vector3 }[], points: Vector3[] } {
        if (!this.gcs) {
            console.warn("SolverService not initialized");
            return { lines: sketchLines, points: sketchPoints };
        }

        this.gcs.clear_data();

        const points: SketchPoint[] = [];
        const lines: SketchLine[] = [];

        // Map each Three.js line to PlaneGCS structures
        // For every sketch line, we extract 2 points: start and end.
        sketchLines.forEach((line, i) => {
            const p1_id = (i * 2).toString();
            const p2_id = (i * 2 + 1).toString();

            points.push({ type: 'point', id: p1_id, x: line.start.x, y: line.start.y, fixed: false });
            points.push({ type: 'point', id: p2_id, x: line.end.x, y: line.end.y, fixed: false });

            lines.push({ type: 'line', id: (sketchLines.length * 2 + i).toString(), p1_id, p2_id });
        });

        // Fix the very first point by default so the whole sketch doesn't float away
        if (points.length > 0) {
            points[0].fixed = true;
        }

        this.gcs.push_primitives_and_params([...points, ...lines]);

        // Construct constraint primitives based on user inputs
        const constraintObjs: Constraint[] = [];
        constraints.forEach((c, idx) => {
            const cid = (1000 + idx).toString(); // arbitrary unique id range for constraints

            if (c.type === 'constrain_coincident') {
                if (c.elements.length === 2 && c.elements[0].type === 'point' && c.elements[1].type === 'point') {
                    constraintObjs.push({
                        type: 'p2p_coincident',
                        id: cid,
                        p1_id: c.elements[0].index.toString(),
                        p2_id: c.elements[1].index.toString()
                    });
                }
            } else if (c.type === 'constrain_horizontal') {
                if (c.elements.length === 1 && c.elements[0].type === 'line') {
                    constraintObjs.push({
                        type: 'horizontal_l',
                        id: cid,
                        l_id: (sketchLines.length * 2 + c.elements[0].index).toString()
                    });
                }
            } else if (c.type === 'constrain_vertical') {
                if (c.elements.length === 1 && c.elements[0].type === 'line') {
                    constraintObjs.push({
                        type: 'vertical_l',
                        id: cid,
                        l_id: (sketchLines.length * 2 + c.elements[0].index).toString()
                    });
                }
            } else if (c.type === 'constrain_distance') {
                if (c.elements.length === 1 && c.elements[0].type === 'line' && c.value !== undefined) {
                    // Distance of a line is P2P distance between its endpoints
                    constraintObjs.push({
                        type: 'p2p_distance',
                        id: cid,
                        p1_id: (c.elements[0].index * 2).toString(),
                        p2_id: (c.elements[0].index * 2 + 1).toString(),
                        distance: c.value
                    });
                } else if (c.elements.length === 2 &&
                    c.elements[0].type === 'point' &&
                    c.elements[1].type === 'point' &&
                    c.value !== undefined) {
                    // Distance between two distinct points
                    constraintObjs.push({
                        type: 'p2p_distance',
                        id: cid,
                        p1_id: c.elements[0].index.toString(),
                        p2_id: c.elements[1].index.toString(),
                        distance: c.value
                    });
                } else if (c.elements.length === 2 && c.value !== undefined) {
                    const pt = c.elements.find(e => e.type === 'point');
                    const ln = c.elements.find(e => e.type === 'line');
                    if (pt && ln) {
                        constraintObjs.push({
                            type: 'p2l_distance',
                            id: cid,
                            p_id: pt.index.toString(),
                            l_id: (sketchLines.length * 2 + ln.index).toString(),
                            distance: c.value
                        });
                    }
                }
            } else if (c.type === 'constrain_angle') {
                if (c.elements.length === 1 && c.elements[0].type === 'line' && c.value !== undefined) {
                    // Angle of a line relative to horizontal. UI locked value is in degrees, so convert to radians.
                    constraintObjs.push({
                        type: 'p2p_angle',
                        id: cid,
                        p1_id: (c.elements[0].index * 2).toString(),
                        p2_id: (c.elements[0].index * 2 + 1).toString(),
                        angle: c.value * Math.PI / 180
                    });
                }
            }
            // TODO: Map other 20+ constraints down into constraintObjs
        });

        this.gcs.push_primitives_and_params(constraintObjs);

        // Run the iteration
        try {
            this.gcs.solve(Algorithm.BFGS);
            this.gcs.apply_solution();
        } catch (e) {
            console.error("Solver Error:", e);
            return { lines: sketchLines, points: sketchPoints }; // return unmodified on failure
        }

        // Unpack solved coordinates back to Three.js Vector3 array format
        const newLines = sketchLines.map(l => ({ start: l.start.clone(), end: l.end.clone() }));
        points.forEach((pt) => {
            const solvedPt = this.gcs?.sketch_index.get_sketch_point(pt.id);
            if (!solvedPt || typeof solvedPt.x !== 'number' || typeof solvedPt.y !== 'number') return;

            const solvedX = solvedPt.x;
            const solvedY = solvedPt.y;

            const baseId = parseInt(pt.id, 10);
            const isStart = baseId % 2 === 0;
            const lineIndex = Math.floor(baseId / 2);

            if (isStart) {
                newLines[lineIndex].start.x = solvedX;
                newLines[lineIndex].start.y = solvedY;
            } else {
                newLines[lineIndex].end.x = solvedX;
                newLines[lineIndex].end.y = solvedY;
            }
        });

        // The input points aren't fundamentally bound to lines in the Three.js state yet,
        // so we just reconstruct the absolute point list from the solved topology.
        const newPoints: Vector3[] = [];
        points.forEach((pt) => {
            const solvedPt = this.gcs?.sketch_index.get_sketch_point(pt.id);
            if (!solvedPt || typeof solvedPt.x !== 'number' || typeof solvedPt.y !== 'number') return;
            newPoints.push(new Vector3(solvedPt.x, solvedPt.y, 0));
        });

        return { lines: newLines, points: newPoints };
    }
}

export const solverService = new SolverService();
