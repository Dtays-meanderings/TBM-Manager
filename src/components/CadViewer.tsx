import { useEffect, useState, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html, Line, TransformControls, PivotControls } from '@react-three/drei';
import { STLExporter } from 'three-stdlib';
import * as THREE from 'three';
import { ActiveTool } from '../App';
import { SolverService } from '../SolverService';
import LCSPlane from './LCSPlane';
import { initOpenCascade } from 'opencascade.js';
import wasmUrl from 'opencascade.js/dist/opencascade.wasm.wasm?url';
import { useSettings } from '../contexts/SettingsContext';

export interface CadViewerRef {
    exportToSTL: (filename: string) => Promise<boolean>;
    exportToFormat: (format: string) => Promise<boolean>;
    setIsoView: () => void;
    getSketch: () => { lines: { start: THREE.Vector3, end: THREE.Vector3 }[], points: THREE.Vector3[], plane: 'xy' | 'xz' | 'yz' | null };
    loadSketch: (lines: { start: THREE.Vector3, end: THREE.Vector3 }[], plane: 'xy' | 'xz' | 'yz') => void;
    closeSketch: () => void;
    clearSketch: () => void;
    handleUndo: (params: { lines?: { start: { x: number, y: number, z: number }, end: { x: number, y: number, z: number } }[], points?: { x: number, y: number, z: number }[] }) => void;
}

export interface CadOperation {
    type: 'fillet';
    edgeIndex: number;
    radius: number;
}

export interface CadViewerProps {
    onReady?: () => void;
    generateTrigger?: number;
    shapeType?: string;
    shapeParams?: Record<string, unknown>;
    fileData?: Uint8Array;
    nodes?: Record<string, unknown>[];
    activeNodeId?: string;
    renderMode?: 'mesh' | 'brep';
    selectedFeature?: { type: 'edge' | 'face', index: number } | null;
    onSelectFeature?: (featureType: 'edge' | 'face', index: number) => void;
    onSelectNode?: (nodeId: string) => void;
    operations?: CadOperation[];
    activeTool?: ActiveTool;
    draftingPlane?: 'xy' | 'xz' | 'yz' | null;
    preDraftingPlane?: 'xy' | 'xz' | 'yz' | null;
    onHoverDraftingPlane?: (plane: 'xy' | 'xz' | 'yz' | null) => void;
    onSelectDraftingPlane?: (plane: 'xy' | 'xz' | 'yz' | null) => void;
    originTransform?: { position: [number, number, number], rotation: [number, number, number], scale: [number, number, number] };
    onOriginTransformChange?: (transform: { position: [number, number, number], rotation: [number, number, number], scale: [number, number, number] }) => void;
    showGrid?: boolean;
    showWCS?: boolean;
    selectedSketchElements?: { type: 'point' | 'line', index: number }[];
    onSelectSketchElement?: (type: 'point' | 'line', index: number, isShift: boolean) => void;
    constraints?: { type: string, value?: number, elements: { type: string, index: number }[] }[];
    onUpdateConstraint?: (index: number, val: number) => void;
    onAddConstraint?: (constraint: { type: string, value?: number, elements: { type: string, index: number }[] }) => void;
    onSketchUpdated?: (lines: { start: THREE.Vector3, end: THREE.Vector3 }[], points: THREE.Vector3[]) => void;
    visibleSketches?: {
        id: string,
        lines: { start: THREE.Vector3, end: THREE.Vector3 }[],
        transform?: { position: [number, number, number], rotation: [number, number, number], scale: [number, number, number] }
    }[];
    onUpdateNodeParam?: (nodeId: string, paramName: string, value: number) => void;
    onSelectSweepVector?: (vector: [number, number, number], isPreview?: boolean) => void;
}

import { Edges } from '@react-three/drei';

const DynamicSketchPoint = ({ position, color = "#ec4899", isSel = false, onClick, onPointerOver, onPointerOut }: { position: THREE.Vector3, color?: string, isSel?: boolean, onClick?: (e: import('@react-three/fiber').ThreeEvent<MouseEvent>) => void, onPointerOver?: (e: import('@react-three/fiber').ThreeEvent<MouseEvent>) => void, onPointerOut?: (e: import('@react-three/fiber').ThreeEvent<MouseEvent>) => void }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const { camera } = useThree();

    useFrame(() => {
        if (meshRef.current) {
            const cam = camera as THREE.OrthographicCamera;
            // 4 pixels based on zoom ratio
            const scale = cam.zoom ? 4 / cam.zoom : 1;
            meshRef.current.scale.setScalar(scale);
        }
    });

    return (
        <mesh
            ref={meshRef}
            position={position}
            renderOrder={4}
            onClick={onClick}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
        >
            <sphereGeometry args={[isSel ? 1.5 : 1, 16, 16]} />
            <meshBasicMaterial color={isSel ? "#f97316" : color} depthTest={false} />
        </mesh>
    );
};

function ZoomAwareGroup({ renderHud }: { renderHud: (zoom: number) => React.ReactNode }) {
    const { camera } = useThree();
    // useFrame or just static reliance on camera zoom changes.
    // In React Three Fiber, camera changes are usually reactive if bound to useThree state,
    // but often people use useFrame for dynamic updates. For orthographic zoom, 
    // it updates component state when changed via OrbitControls if we tap into the R3F store, 
    // but just getting it here will evaluate on re-renders (like mouse moves).
    return <>{renderHud(camera.zoom || 1)}</>;
}

const ConstraintAnnotation = ({ c, idx, sketchLines, draftingPlane, onUpdateConstraint }: { c: { type: string, value?: number, elements: { type: string, index: number }[] }, idx: number, sketchLines: { start: THREE.Vector3, end: THREE.Vector3 }[], draftingPlane: 'xy' | 'xz' | 'yz' | null, onUpdateConstraint?: (idx: number, val: number) => void }) => {
    const { camera } = useThree();
    const zoomScale = camera.zoom || 1;
    const darkBg = '#191919';

    // Add local editing state
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(c.value !== undefined ? c.value.toString() : '');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input automatically when editing starts
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select(); // Highlight existing text for easy overwrite
        }
    }, [isEditing]);

    if (c.value === undefined || c.value === null) return null;

    const commitEdit = () => {
        setIsEditing(false);
        const parsed = parseFloat(editValue);
        if (!isNaN(parsed) && onUpdateConstraint && parsed !== c.value) {
            onUpdateConstraint(idx, parsed);
        } else {
            // Reset to default if invalid
            setEditValue((c.value as number).toString());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            commitEdit();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditValue((c.value as number).toString());
        }
    };

    const renderLabel = (val: string, postfix: string = '') => (
        <div
            style={{
                background: darkBg,
                border: '1px solid #3b82f6',
                borderRadius: '4px',
                padding: isEditing ? '1px 4px' : '2px 6px',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'auto',
                cursor: isEditing ? 'text' : 'pointer',
                userSelect: 'none'
            }}
            onClick={(e) => {
                e.stopPropagation();
                if (!isEditing) {
                    setEditValue(c.value!.toString());
                    setIsEditing(true);
                }
            }}
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleKeyDown}
                    style={{
                        width: `${Math.max(4, editValue.length)} ch`,
                        background: 'transparent',
                        color: '#fff',
                        border: 'none',
                        outline: 'none',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontFamily: 'sans-serif',
                    }}
                />
            ) : (
                <span style={{ color: '#fff', fontSize: '12px', fontFamily: 'sans-serif' }}>
                    {val}{postfix}
                </span>
            )}
            {isEditing && postfix && (
                <span style={{ color: '#aaa', fontSize: '12px', fontFamily: 'sans-serif', marginLeft: '2px' }}>{postfix}</span>
            )}
        </div>
    );

    if (c.elements.length === 1 && c.elements[0].type === 'line' && sketchLines[c.elements[0].index]) {
        const line = sketchLines[c.elements[0].index];
        const start = line.start;
        const end = line.end;
        const rawVec = new THREE.Vector3().subVectors(end, start);
        const currentMag = rawVec.length();

        if (c.type === 'constrain_distance' || !c.type.includes('angle')) { // Default to distance for unspecific
            const mid = start.clone().lerp(end, 0.5);
            const rawDir = rawVec.clone();
            if (rawDir.lengthSq() > 0) rawDir.normalize();

            const offsetDist = Math.max(25 / zoomScale, currentMag * 0.15); // Dynamic offset

            let perp = new THREE.Vector3(-rawDir.y, rawDir.x, 0);
            if (draftingPlane === 'xz') perp = new THREE.Vector3(-rawDir.z, 0, rawDir.x);
            else if (draftingPlane === 'yz') perp = new THREE.Vector3(0, -rawDir.z, rawDir.y);

            const offsetVec = perp.multiplyScalar(offsetDist);
            const hudPos = mid.clone().add(offsetVec);

            const extStart1 = start.clone().add(offsetVec.clone().multiplyScalar(1.2));
            const extEnd1 = end.clone().add(offsetVec.clone().multiplyScalar(1.2));

            return (
                <group key={`c - ${idx} `}>
                    <Line points={[start, extStart1]} color="#3b82f6" opacity={0.5} transparent depthTest={false} renderOrder={2} />
                    <Line points={[end, extEnd1]} color="#3b82f6" opacity={0.5} transparent depthTest={false} renderOrder={2} />
                    <Line points={[start.clone().add(offsetVec), end.clone().add(offsetVec)]} color="#3b82f6" depthTest={false} renderOrder={2} />
                    <Html position={hudPos} center zIndexRange={[50, 0]}>
                        {renderLabel(c.value!.toFixed(2))}
                    </Html>
                </group>
            );
        } else if (c.type === 'constrain_angle') {
            const angleAnchorDist = Math.max(30 / zoomScale, currentMag * 0.2);
            const anglePos = start.clone();

            let localDx = rawVec.x; let localDy = rawVec.y;
            if (draftingPlane === 'xz') { localDx = rawVec.x; localDy = rawVec.z; }
            else if (draftingPlane === 'yz') { localDx = rawVec.y; localDy = rawVec.z; }
            let currentAngle = Math.atan2(localDy, localDx);
            if (currentAngle < 0) currentAngle += 2 * Math.PI;

            const midAngle = currentAngle / 2;
            const offsetDx = (angleAnchorDist + 20 / zoomScale) * Math.cos(midAngle);
            const offsetDy = (angleAnchorDist + 20 / zoomScale) * Math.sin(midAngle);

            if (draftingPlane === 'xy' || !draftingPlane) { anglePos.x += offsetDx; anglePos.y += offsetDy; }
            else if (draftingPlane === 'xz') { anglePos.x += offsetDx; anglePos.z += offsetDy; }
            else if (draftingPlane === 'yz') { anglePos.y += offsetDx; anglePos.z += offsetDy; }

            const arcPts = [];
            const segments = 16;
            const arcR = angleAnchorDist;
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * currentAngle;
                const ax = arcR * Math.cos(theta);
                const ay = arcR * Math.sin(theta);
                const ap = start.clone();
                if (draftingPlane === 'xy' || !draftingPlane) { ap.x += ax; ap.y += ay; }
                else if (draftingPlane === 'xz') { ap.x += ax; ap.z += ay; }
                else if (draftingPlane === 'yz') { ap.y += ax; ap.z += ay; }
                arcPts.push(ap);
            }

            const refLineEnd = start.clone();
            const refLen = Math.max(15 / zoomScale, currentMag * 0.5);
            if (draftingPlane === 'xy' || !draftingPlane) refLineEnd.x += refLen;
            else if (draftingPlane === 'xz') refLineEnd.x += refLen;
            else if (draftingPlane === 'yz') refLineEnd.y += refLen;

            return (
                <group key={`c - ${idx} `}>
                    <Line points={[start, refLineEnd]} color="#3b82f6" dashed dashSize={2} dashScale={5} opacity={0.5} transparent depthTest={false} renderOrder={2} />
                    {arcPts.length > 1 && <Line points={arcPts} color="#3b82f6" opacity={0.8} transparent depthTest={false} renderOrder={2} />}
                    <Html position={anglePos} center zIndexRange={[50, 0]}>
                        {renderLabel(c.value!.toFixed(1), '°')}
                    </Html>
                </group>
            );
        }
    } else if (c.type === 'constrain_distance' && c.elements.length === 2 && c.elements[0].type === 'point' && c.elements[1].type === 'point') {
        const p1LineIdx = Math.floor(c.elements[0].index / 2);
        const p1IsStart = c.elements[0].index % 2 === 0;
        const v1 = sketchLines[p1LineIdx] ? (p1IsStart ? sketchLines[p1LineIdx].start : sketchLines[p1LineIdx].end) : null;

        const p2LineIdx = Math.floor(c.elements[1].index / 2);
        const p2IsStart = c.elements[1].index % 2 === 0;
        const v2 = sketchLines[p2LineIdx] ? (p2IsStart ? sketchLines[p2LineIdx].start : sketchLines[p2LineIdx].end) : null;

        if (v1 && v2) {
            const mid = v1.clone().lerp(v2, 0.5);
            const rawVec = new THREE.Vector3().subVectors(v2, v1);
            const currentMag = rawVec.length();
            const rawDir = rawVec.clone();
            if (rawDir.lengthSq() > 0) rawDir.normalize();

            const offsetDist = Math.max(25 / zoomScale, currentMag * 0.15);

            let perp = new THREE.Vector3(-rawDir.y, rawDir.x, 0);
            if (draftingPlane === 'xz') perp = new THREE.Vector3(-rawDir.z, 0, rawDir.x);
            else if (draftingPlane === 'yz') perp = new THREE.Vector3(0, -rawDir.z, rawDir.y);

            const offsetVec = perp.multiplyScalar(offsetDist);
            const hudPos = mid.clone().add(offsetVec);

            const extStart1 = v1.clone().add(offsetVec.clone().multiplyScalar(1.2));
            const extEnd1 = v2.clone().add(offsetVec.clone().multiplyScalar(1.2));

            return (
                <group key={`c - ${idx} `}>
                    <Line points={[v1, extStart1]} color="#3b82f6" opacity={0.5} transparent depthTest={false} renderOrder={2} />
                    <Line points={[v2, extEnd1]} color="#3b82f6" opacity={0.5} transparent depthTest={false} renderOrder={2} />
                    <Line points={[v1.clone().add(offsetVec), v2.clone().add(offsetVec)]} color="#3b82f6" depthTest={false} renderOrder={2} />
                    <Html position={hudPos} center zIndexRange={[50, 0]}>
                        {renderLabel(c.value!.toFixed(2))}
                    </Html>
                </group>
            );
        }
    } else if (c.type === 'constrain_distance' && c.elements.length === 2) {
        // Assume point to line distance fallback
        const ptEl = c.elements.find((e: { type: string, index: number }) => e.type === 'point');
        const lnEl = c.elements.find((e: { type: string, index: number }) => e.type === 'line');
        if (ptEl && lnEl) {
            const pLineIdx = Math.floor(ptEl.index / 2);
            const pIsStart = ptEl.index % 2 === 0;
            const pt = sketchLines[pLineIdx] ? (pIsStart ? sketchLines[pLineIdx].start : sketchLines[pLineIdx].end) : null;
            const line = sketchLines[lnEl.index];

            if (pt && line) {
                const lineVec = new THREE.Vector3().subVectors(line.end, line.start);
                const lineDir = lineVec.clone();
                if (lineDir.lengthSq() > 0) lineDir.normalize();

                const ptVec = new THREE.Vector3().subVectors(pt, line.start);
                const projLen = ptVec.dot(lineDir);
                const projPt = line.start.clone().add(lineDir.clone().multiplyScalar(projLen));

                const rawVec = new THREE.Vector3().subVectors(pt, projPt);
                const currentMag = rawVec.length();
                if (currentMag < 0.001) return null; // Coincident

                const rawDir = rawVec.clone().normalize();
                const mid = projPt.clone().lerp(pt, 0.5);
                const offsetDist = Math.max(25 / zoomScale, currentMag * 0.15);

                let perp = new THREE.Vector3(-rawDir.y, rawDir.x, 0);
                if (draftingPlane === 'xz') perp = new THREE.Vector3(-rawDir.z, 0, rawDir.x);
                else if (draftingPlane === 'yz') perp = new THREE.Vector3(0, -rawDir.z, rawDir.y);

                const offsetVec = perp.multiplyScalar(offsetDist);
                const hudPos = mid.clone().add(offsetVec);

                const extStart1 = projPt.clone().add(offsetVec.clone().multiplyScalar(1.2));
                const extEnd1 = pt.clone().add(offsetVec.clone().multiplyScalar(1.2));

                return (
                    <group key={`c - ${idx} `}>
                        <Line points={[projPt, extStart1]} color="#3b82f6" opacity={0.5} transparent depthTest={false} renderOrder={2} />
                        <Line points={[pt, extEnd1]} color="#3b82f6" opacity={0.5} transparent depthTest={false} renderOrder={2} />
                        <Line points={[projPt.clone().add(offsetVec), pt.clone().add(offsetVec)]} color="#3b82f6" depthTest={false} renderOrder={2} />
                        <Html position={hudPos} center zIndexRange={[50, 0]}>
                            {renderLabel(c.value!.toFixed(2))}
                        </Html>
                    </group>
                );
            }
        }
    }

    // Fallback
    let pos = null;
    if (c.elements.length === 1 && c.elements[0].type === 'line' && sketchLines[c.elements[0].index]) {
        const line = sketchLines[c.elements[0].index];
        pos = line.start.clone().lerp(line.end, 0.5);
        pos.x += 2 / zoomScale; pos.y += 2 / zoomScale;
    }

    if (!pos) return null;

    return (
        <Html key={`c - ${idx} `} position={pos} center zIndexRange={[50, 0]}>
            {renderLabel(c.value!.toFixed(2))}
        </Html>
    );
};

const CadViewer = forwardRef<CadViewerRef, CadViewerProps>(({
    onReady,
    generateTrigger,
    shapeType,
    shapeParams,
    fileData,
    nodes = [],
    activeNodeId,
    onSelectNode,
    renderMode = 'mesh',
    selectedFeature,
    onSelectFeature,
    activeTool = 'select',
    draftingPlane = null,
    preDraftingPlane: _preDraftingPlane = null,
    onHoverDraftingPlane,
    onSelectDraftingPlane,
    originTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    onOriginTransformChange,
    showGrid = false,
    showWCS = true,
    selectedSketchElements = [],
    onSelectSketchElement,
    constraints = [],
    onUpdateConstraint,
    onAddConstraint,
    onSketchUpdated,
    visibleSketches,
    onUpdateNodeParam,
    onSelectSweepVector
}, ref) => {
    const { settings } = useSettings();
    // OpenCascade instance and visual groups
    const [oc, setOc] = useState<any>(null);

    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [edgeGeometry, setEdgeGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [snapPoints, setSnapPoints] = useState<THREE.Vector3[]>([]);
    const [inactiveGeometry, setInactiveGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [inactiveEdgeGeometry, setInactiveEdgeGeometry] = useState<THREE.BufferGeometry | null>(null);

    // Measure Mode State
    const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
    const [activeSnapPoint, setActiveSnapPoint] = useState<THREE.Vector3 | null>(null);

    // Sketch Drafting States
    const [sketchPoints, setSketchPoints] = useState<THREE.Vector3[]>([]);
    const [sketchLines, setSketchLines] = useState<{ start: THREE.Vector3, end: THREE.Vector3 }[]>([]);
    const [activeLineStart, setActiveLineStart] = useState<THREE.Vector3 | null>(null);
    const [cursorPlanePosition, setCursorPlanePosition] = useState<THREE.Vector3 | null>(null);
    const [lockedLength, setLockedLength] = useState<string | null>(null);
    const [lockedAngle, setLockedAngle] = useState<string | null>(null);
    const [hudFocusedPosition, setHudFocusedPosition] = useState<THREE.Vector3 | null>(null);
    const [isoViewTrigger, setIsoViewTrigger] = useState<number>(0);
    const trihedronGroupRef = useRef<THREE.Group>(null);
    const [sweepDraggerObj, setSweepDraggerObj] = useState<THREE.Group | null>(null);
    const [sweepDraggerOrigin, setSweepDraggerOrigin] = useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
    const [gizmoPivotOffset, setGizmoPivotOffset] = useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
    const [gizmoPivotRotationOffset, setGizmoPivotRotationOffset] = useState<THREE.Euler>(new THREE.Euler(0, 0, 0));
    const pivotMatrix = useMemo(() => new THREE.Matrix4(), []);
    const isDraggingPivot = useRef(false);
    const initialOrigin = useRef<{ position: [number, number, number], rotation: [number, number, number], scale: [number, number, number] } | null>(null);
    const pivotRef = useRef<any>(null); // For Drei PivotControls

    // Sync external changes to the PivotMatrix when not dragging
    useEffect(() => {
        if (!isDraggingPivot.current) {
            // Combine object origin rotation with our manual Gizmo overlay rotation offset using Quaternions
            const qObj = new THREE.Quaternion().setFromEuler(new THREE.Euler(...originTransform.rotation));
            const qOffset = new THREE.Quaternion().setFromEuler(gizmoPivotRotationOffset);
            const qGizmo = qObj.clone().multiply(qOffset);

            pivotMatrix.compose(
                new THREE.Vector3(...originTransform.position).add(gizmoPivotOffset),
                qGizmo,
                new THREE.Vector3(...originTransform.scale)
            );
            if (pivotRef.current) {
                pivotRef.current.matrix.copy(pivotMatrix);
            }
        }
    }, [originTransform, gizmoPivotOffset, gizmoPivotRotationOffset, pivotMatrix]);

    // Refs for input focus cycling
    const lengthInputRef = useRef<HTMLInputElement>(null);
    const angleInputRef = useRef<HTMLInputElement>(null);

    // Diagnostic HUD
    const [extrusionDebug] = useState<string>('');

    const combinedSnapPoints = useMemo(() => {
        const pts: THREE.Vector3[] = [...snapPoints];
        const localSketchPts: THREE.Vector3[] = [...sketchPoints];
        sketchLines.forEach(l => {
            localSketchPts.push(l.start, l.end);
        });

        if (trihedronGroupRef.current) {
            trihedronGroupRef.current.updateMatrixWorld();
            localSketchPts.forEach(pt => {
                const globalPt = pt.clone();
                globalPt.applyMatrix4(trihedronGroupRef.current!.matrixWorld);
                pts.push(globalPt);
            });
        } else {
            pts.push(...localSketchPts);
        }
        return pts;
    }, [snapPoints, sketchPoints, sketchLines]);

    // HUD zoom scale is now handled by a sub-component within Canvas

    const handleSketchClick = (pt: THREE.Vector3) => {
        if (activeTool === 'sketch_point') {
            setSketchPoints(prev => [...prev, pt]);
        } else if (activeTool === 'sketch_line') {
            if (!activeLineStart) {
                setActiveLineStart(pt);
                setLockedLength(null);
                setLockedAngle(null);
                setHudFocusedPosition(null);
            } else {
                // Determine the actual registered point, prioritizing user-locked dimensions
                let finalPt = pt.clone();
                if (lockedLength !== null || lockedAngle !== null) {
                    const rawVec = new THREE.Vector3().subVectors(pt, activeLineStart);
                    const currentMag = rawVec.length();
                    // We treat the "angle" conventionally on the 2D plane based on drafting plane (defaulting to atan2(y, x))
                    // For simplicity, we assume we are drawing on a flat 2D coordinate system (x, y). 
                    // Depending on the draftingPlane ('xy', 'xz', 'yz'), the "2D" coordinates map differently.
                    // We will compute the angle relative to the primary local axis of that plane.
                    let localDx = rawVec.x; let localDy = rawVec.y;
                    if (draftingPlane === 'xz') { localDx = rawVec.x; localDy = rawVec.z; }
                    else if (draftingPlane === 'yz') { localDx = rawVec.y; localDy = rawVec.z; }

                    const currentAngle = Math.atan2(localDy, localDx);

                    const parsedLength = lockedLength !== null ? parseFloat(lockedLength) : NaN;
                    const parsedAngle = lockedAngle !== null ? parseFloat(lockedAngle) : NaN;

                    const newMag = !isNaN(parsedLength) ? parsedLength : currentMag;
                    const newAngleRad = !isNaN(parsedAngle) ? (parsedAngle * Math.PI) / 180 : currentAngle;

                    const newLocalDx = newMag * Math.cos(newAngleRad);
                    const newLocalDy = newMag * Math.sin(newAngleRad);

                    if (draftingPlane === 'xy' || !draftingPlane) { finalPt = new THREE.Vector3(activeLineStart.x + newLocalDx, activeLineStart.y + newLocalDy, activeLineStart.z); }
                    else if (draftingPlane === 'xz') { finalPt = new THREE.Vector3(activeLineStart.x + newLocalDx, activeLineStart.y, activeLineStart.z + newLocalDy); }
                    else if (draftingPlane === 'yz') { finalPt = new THREE.Vector3(activeLineStart.x, activeLineStart.y + newLocalDx, activeLineStart.z + newLocalDy); }
                }

                setSketchLines(prev => {
                    const newLines = [...prev, { start: activeLineStart, end: finalPt }];
                    onSketchUpdated?.(newLines, sketchPoints);
                    return newLines;
                });

                // Automatically constrain coincident for successive lines
                if (sketchLines.length > 0 && sketchLines[sketchLines.length - 1].end === activeLineStart && onAddConstraint) {
                    onAddConstraint({
                        type: 'constrain_coincident',
                        elements: [
                            { type: 'point', index: (sketchLines.length - 1) * 2 + 1 }, // End of previous line
                            { type: 'point', index: sketchLines.length * 2 }            // Start of fresh line
                        ]
                    });
                }
                if (lockedLength !== null && !isNaN(parseFloat(lockedLength as string)) && onAddConstraint) {
                    onAddConstraint({ type: 'constrain_distance', elements: [{ type: 'line', index: sketchLines.length }], value: parseFloat(lockedLength as string) });
                }
                if (lockedAngle !== null && !isNaN(parseFloat(lockedAngle)) && onAddConstraint) {
                    onAddConstraint({ type: 'constrain_angle', elements: [{ type: 'line', index: sketchLines.length }], value: parseFloat(lockedAngle) });
                }
                setActiveLineStart(finalPt); // Continue drawing chain processing
                setLockedLength(null);
                setLockedAngle(null);
                setHudFocusedPosition(null);
            }
        }
    };

    // Store maps linking Three.js primitives to OCCT topological indices
    const [featureMap, setFeatureMap] = useState<{
        faces: number[]; // Maps triangle index -> TopoDS_Face index
        edges: number[]; // Maps line segment index -> TopoDS_Edge index
    }>({ faces: [], edges: [] });

    const sceneRef = useRef<THREE.Group>(null);

    // --- SOLVER INTEGRATION ---
    // Track constraints ref to avoid infinite loops if the solver returns slightly different floats
    const lastSolveConstraintsRef = useRef<string>('[]');

    useEffect(() => {
        const runSolver = async () => {
            const constraintStr = JSON.stringify(constraints);
            // Prevent infinite loops if lines/points changed but constraints didn't, or if we have no constraints
            if (!constraints || constraints.length === 0 || lastSolveConstraintsRef.current === constraintStr) return;

            try {
                const solver = new SolverService();
                await solver.init();

                // Track start length so we know if there is anything to solve
                if (sketchLines.length === 0 && sketchPoints.length === 0) return;

                console.log("CadViewer dispatching constraint payload:", constraints);
                const { lines, points } = solver.solve(sketchLines, sketchPoints, constraints as any[]);

                // Important: Update React local states with the mathematical solution
                setSketchLines(lines);
                setSketchPoints(points);
                lastSolveConstraintsRef.current = constraintStr;

            } catch (err) {
                console.error("Solver error in CadViewer:", err);
            }
        };
        runSolver();
    }, [constraints, sketchLines, sketchPoints]);

    useImperativeHandle(ref, () => ({
        getSketch: () => ({ lines: sketchLines, points: sketchPoints, plane: draftingPlane }),
        loadSketch: (lines, plane) => {
            const parsedLines = lines.map((l: any) => ({
                start: l.start instanceof THREE.Vector3 ? l.start : new THREE.Vector3(l.start.x, l.start.y, l.start.z),
                end: l.end instanceof THREE.Vector3 ? l.end : new THREE.Vector3(l.end.x, l.end.y, l.end.z)
            }));
            setSketchLines(parsedLines);

            // Extract all unique points from the saved lines
            const pts: THREE.Vector3[] = [];
            parsedLines.forEach(l => {
                if (!pts.find(p => p.distanceTo(l.start) < 0.001)) pts.push(l.start);
                if (!pts.find(p => p.distanceTo(l.end) < 0.001)) pts.push(l.end);
            });
            setSketchPoints(pts);

            onSelectDraftingPlane?.(plane);
        },
        closeSketch: () => {
            if (sketchLines.length > 0) {
                const firstPt = sketchLines[0].start;
                const lastLine = sketchLines[sketchLines.length - 1];
                const connectPt = lastLine.end;

                // If there's an active hanging line, connect from its start instead,
                // OR connect from the start of the chain.
                // We'll trust the explicit line array's last 'end'.
                if (firstPt.distanceTo(connectPt) > 1e-4) {
                    setSketchLines(prev => [...prev, { start: connectPt, end: firstPt }]);
                }
                setActiveLineStart(null);
            }
        },
        clearSketch: () => {
            setSketchLines([]);
            setSketchPoints([]);
            setActiveLineStart(null);
            setLockedLength(null);
            setLockedAngle(null);
            setHudFocusedPosition(null);
            onSelectDraftingPlane?.(null);
        },
        setIsoView: () => setIsoViewTrigger(prev => prev + 1),
        handleUndo: (params: { lines?: { start: { x: number, y: number, z: number }, end: { x: number, y: number, z: number } }[], points?: { x: number, y: number, z: number }[] }) => {
            const rawLines = (params as any)?.lines || [];
            const reconstructedLines = rawLines.map((l: { start: { x: number, y: number, z: number }, end: { x: number, y: number, z: number } }) => ({
                start: new THREE.Vector3(l.start.x, l.start.y, l.start.z),
                end: new THREE.Vector3(l.end.x, l.end.y, l.end.z)
            }));
            setSketchLines(reconstructedLines);

            const rawPoints = params?.points || [];
            const reconstructedPoints = rawPoints.map((p: { x: number, y: number, z: number }) => new THREE.Vector3(p.x, p.y, p.z));
            setSketchPoints(reconstructedPoints);

            setActiveLineStart(null);
            setLockedLength(null);
            setLockedAngle(null);
            setHudFocusedPosition(null);
        },
        exportToSTL: async (filename: string) => {
            if (!sceneRef.current) return false;

            try {
                const exporter = new STLExporter();
                const stlData = exporter.parse(sceneRef.current);

                const result = await (window as any).ipcRenderer.invoke('export-stl', stlData, filename);
                return result.success;
            } catch (error) {
                console.error('Error exporting STL:', error);
                return false;
            }
        },
        exportToFormat: async (format: string) => {
            if (!oc) return false;
            try {

                let shape; // This line replaces the destructuring of shapeParams
                let shapeObj; // Declare shapeObj here

                // 1. Rebuild the geometry in WASM memory for export
                // This block was incorrectly duplicated and is now removed.
                // The logic for creating shapeObj based on shapeType and shapeParams
                // should be handled correctly below, similar to the buildShape function.

                // Re-adding the logic for shapeObj based on shapeType and shapeParams
                const ocAny = oc as any;
                if (shapeType === 'box') {
                    shapeObj = new ocAny.BRepPrimAPI_MakeBox_1((shapeParams as any).width, (shapeParams as any).height, (shapeParams as any).depth);
                } else if (shapeType === 'cylinder') {
                    shapeObj = new ocAny.BRepPrimAPI_MakeCylinder_1((shapeParams as any).radius, (shapeParams as any).height);
                } else if (shapeType === 'sphere') {
                    shapeObj = new ocAny.BRepPrimAPI_MakeSphere_1((shapeParams as any).radius);
                } else if (['step', 'iges', 'brep', 'stl'].includes(shapeType as string) && fileData) {
                    const filename = `uploaded_for_export.${shapeType} `;
                    ocAny.FS.createDataFile("/", filename, fileData, true, true);

                    if (shapeType === 'step') {
                        const reader = new ocAny.STEPControl_Reader_1();
                        reader.ReadFile(filename);
                        reader.TransferRoots();
                        shape = reader.OneShape();
                    } else if (shapeType === 'iges') {
                        const reader = new ocAny.IGESControl_Reader_1();
                        reader.ReadFile(filename);
                        reader.TransferRoots();
                        shape = reader.OneShape();
                    } else if (shapeType === 'brep') {
                        const builder = new ocAny.BRep_Builder();
                        shape = new ocAny.TopoDS_Shape();
                        ocAny.BRepTools.Read_2(shape, filename, builder);
                    } else if (shapeType === 'stl') {
                        const reader = new ocAny.StlAPI_Reader_1();
                        shape = new ocAny.TopoDS_Shape();
                        reader.Read(shape, filename);
                    }
                    ocAny.FS.unlink(`/ ${filename} `);
                }

                if (!shape) {
                    if (!shapeObj) return false;
                    shape = shapeObj.Shape();
                }

                // 2. Route the Shape into the Requested Writer
                const outFilename = `export_temp.${format} `;
                let writeResult;

                if (format === 'step') {
                    const writer = new ocAny.STEPControl_Writer_1();
                    writer.Transfer(shape, ocAny.STEPControl_StepModelType.STEPControl_AsIs, true);
                    writeResult = writer.Write(outFilename);
                } else if (format === 'iges') {
                    const writer = new ocAny.IGESControl_Writer_1();
                    writer.AddShape(shape);
                    writer.ComputeModel();
                    writeResult = writer.Write(outFilename);
                } else if (format === 'brep') {
                    // Try to instantiate without the progress object
                    writeResult = ocAny.BRepTools.Write_1(shape, outFilename);
                } else if (format === 'stl') {
                    const writer = new ocAny.StlAPI_Writer();
                    new ocAny.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false);
                    writeResult = writer.Write(shape, outFilename);
                }

                // Cleanup memory shape
                if (shapeObj) shapeObj.delete();
                if (shape) shape.delete();

                if (writeResult === false || writeResult === ocAny.IFSelect_ReturnStatus.IFSelect_RetFail) {
                    throw new Error(`OCCT Failed to write ${format.toUpperCase()} `);
                }

                // 3. Read the output from the virtual FS into a JS Uint8Array
                const fileBytes = ocAny.FS.readFile(`/ ${outFilename} `, { encoding: 'binary' });

                // 4. Unlink the file
                ocAny.FS.unlink(`/ ${outFilename} `);

                // 5. Send IPC trigger to Electron Main
                const result = await (window as any).ipcRenderer.invoke('export-file-buffer', fileBytes, format);
                return result.success;

            } catch (err: unknown) {
                console.error("Export failure:", err);
                return false;
            }
        }
    }));

    useEffect(() => {
        // Initialize OCCT
        const loadOCCT = async () => {
            console.log("Starting OCCT Initialization...");
            try {
                console.log("wasmUrl imported as:", wasmUrl);
                const loadedOc = await (initOpenCascade as any)({
                    locateFile: (path: string) => {
                        console.log("locateFile requested for:", path);
                        if (path.endsWith('.wasm')) {
                            console.log("Returning bound wasmUrl:", wasmUrl);
                            return wasmUrl;
                        }
                        return path;
                    }
                });
                console.log("OCCT Initialization returned:", loadedOc);
                // Set the oc state so it can be used elsewhere
                setOc(loadedOc);

                console.log("Testing OCAF Environment...");
                try {
                    const app = new loadedOc.TDocStd_Application();
                    console.log("OCAF TDocStd_Application instantiated successfully:", app);

                    const docHandle = new loadedOc.Handle_TDocStd_Document();
                    const formatStr = new loadedOc.TCollection_ExtendedString_1();

                    formatStr.assign("BinXCAF");

                    // We must tell the Application what format we use
                    // app.DefineFormat(...) would usually go here, but OCCT defaults often include standard BinXCAF/XmlXCAF.

                    app.NewDocument(formatStr, docHandle);
                    console.log("OCAF Document Handle valid?", !docHandle.IsNull());

                    formatStr.delete();
                } catch (ocafErr) {
                    console.warn("OCAF is not fully bound or failed to initialize:", ocafErr);
                }

                onReady?.();
            } catch (error) {
                console.error("Failed to load OCCT (caught):", error);
            }
        };

        loadOCCT();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // REMOVED onReady from deps to prevent double-init
    useEffect(() => {
        console.log("CADVIEWER EFFECT TRACKER", { oc: !!oc, generateTrigger, activeNodeId, renderMode, nodesLength: nodes?.length });
        if (!oc || generateTrigger === 0) return;

        // Clean up previous geometry
        if (geometry) {
            geometry.dispose();
        }

        try {
            console.log("CadViewer building shape for active node ID:", activeNodeId);
            const ocAny = oc as any;
            const buildShape = (nodeId: string): unknown => {
                const node = nodes.find(n => n.id === nodeId);
                console.log("buildShape called for", nodeId, "Found Node:", !!node, node?.type);
                if (!node) return null;

                let currentShape = null;
                const { type, params, fileData: nodeFileData } = node;

                if (type === 'box') {
                    const makeBox = new ocAny.BRepPrimAPI_MakeBox_1((params as any).width, (params as any).height, (params as any).depth);
                    currentShape = makeBox.Shape();
                    makeBox.delete();
                } else if (type === 'cylinder') {
                    const makeCyl = new ocAny.BRepPrimAPI_MakeCylinder_1((params as any).radius, (params as any).height);
                    currentShape = makeCyl.Shape();
                    makeCyl.delete();
                } else if (type === 'sphere') {
                    const makeSph = new ocAny.BRepPrimAPI_MakeSphere_1((params as any).radius);
                    currentShape = makeSph.Shape();
                    makeSph.delete();
                } else if (['step', 'iges', 'brep', 'stl'].includes(type as string) && nodeFileData) {
                    const filename = `uploaded_node_${node.id}.${type} `;
                    ocAny.FS.createDataFile("/", filename, nodeFileData, true, true);
                    let readResult;
                    if (type === 'step') {
                        const reader = new ocAny.STEPControl_Reader_1();
                        readResult = reader.ReadFile(filename);
                        if (readResult === ocAny.IFSelect_ReturnStatus.IFSelect_RetDone) {
                            reader.TransferRoots();
                            currentShape = reader.OneShape();
                        }
                        reader.delete();
                    } else if (type === 'iges') {
                        const reader = new ocAny.IGESControl_Reader_1();
                        readResult = reader.ReadFile(filename);
                        if (readResult === ocAny.IFSelect_ReturnStatus.IFSelect_RetDone) {
                            reader.TransferRoots();
                            currentShape = reader.OneShape();
                        }
                        reader.delete();
                    } else if (type === 'brep') {
                        const builder = new ocAny.BRep_Builder();
                        currentShape = new ocAny.TopoDS_Shape();
                        readResult = ocAny.BRepTools.Read_2(currentShape, filename, builder);
                        builder.delete();
                    } else if (type === 'stl') {
                        const reader = new ocAny.StlAPI_Reader_1();
                        currentShape = new ocAny.TopoDS_Shape();
                        readResult = reader.Read(currentShape, filename);
                        reader.delete();
                    }
                    ocAny.FS.unlink(`/ ${filename} `);
                    if (!currentShape || currentShape.IsNull() || (!readResult && readResult !== ocAny.IFSelect_ReturnStatus?.IFSelect_RetDone)) {
                        currentShape = null;
                    }
                } else if (type === 'extrude' && (params as any).sourceSketchId) {
                    const sourceSketch = nodes.find(n => n.id === (params as any).sourceSketchId);
                    const pLines = (sourceSketch?.params as any)?.lines;
                    if (!sourceSketch) {
                        console.error(`Error: Source sketch ${(params as any).sourceSketchId} not found in nodes array.`);
                    } else if (!pLines || pLines.length === 0) {
                        console.warn(`Extrude: pLines is empty for sourceSketchId: ${(params as any).sourceSketchId} `);
                    } else {
                        const { plane } = params as any;
                        let depth = (params as any).depth;
                        depth = (typeof depth === 'number' && !isNaN(depth)) ? depth : 50;
                        // Avoid zero-depth which breaks BRepPrimitiveAPI
                        if (Math.abs(depth) < 0.001) depth = 0.001;
                        const sortedLines = [];
                        const remaining = [...pLines];
                        sortedLines.push(remaining.shift());
                        const dist = (p1: { x: number, y: number, z: number }, p2: { x: number, y: number, z: number }) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
                        while (remaining.length > 0) {
                            const lastPt = sortedLines[sortedLines.length - 1].end;
                            const nextIdx = remaining.findIndex((l: { start: { x: number, y: number, z: number }, end: { x: number, y: number, z: number } }) => dist(l.start, lastPt) < 1e-4 || dist(l.end, lastPt) < 1e-4);
                            if (nextIdx !== -1) {
                                const nextLine = remaining.splice(nextIdx, 1)[0];
                                if (dist(nextLine.end, lastPt) < 1e-4) sortedLines.push({ start: nextLine.end, end: nextLine.start });
                                else sortedLines.push(nextLine);
                            } else {
                                sortedLines.push(remaining.shift());
                            }
                        }
                        try {
                            const makePoly = new ocAny.BRepBuilderAPI_MakePolygon_1();
                            const vertices = [sortedLines[0].start];
                            for (let i = 0; i < sortedLines.length; i++) {
                                vertices.push(sortedLines[i].end);
                            }
                            if (dist(vertices[0], vertices[vertices.length - 1]) < 1e-4) {
                                vertices.pop();
                            }
                            vertices.forEach(v => {
                                const p = new ocAny.gp_Pnt_1();
                                p.SetCoord_2(v.x, v.y, v.z);
                                makePoly.Add_1(p);
                                p.delete();
                            });
                            makePoly.Close();

                            if (!makePoly.IsDone()) {
                                console.error("Extrude: MakePolygon failed. Vertices: " + vertices.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`).join("|"));
                            }

                            const wire = makePoly.Wire();
                            const faceB = new ocAny.BRepBuilderAPI_MakeFace_15(wire, false);

                            if (!faceB.IsDone()) {
                                console.error("Extrude: MakeFace failed (wire might self-intersect or not be properly closed).");
                            } else {
                                const face = faceB.Face();
                                let mx = 0, my = 0, mz = depth;
                                if ((params as any).sweepVector) {
                                    const sv = (params as any).sweepVector;
                                    const len = Math.sqrt(sv[0] * sv[0] + sv[1] * sv[1] + sv[2] * sv[2]);
                                    if (len > 0) {
                                        mx = (sv[0] / len) * depth;
                                        my = (sv[1] / len) * depth;
                                        mz = (sv[2] / len) * depth;
                                    }
                                } else {
                                    if (plane === 'xz') { mx = 0; my = -depth; mz = 0; }
                                    else if (plane === 'yz') { mx = depth; my = 0; mz = 0; }
                                }
                                const vec = new ocAny.gp_Vec_4(mx, my, mz);
                                const prism = new ocAny.BRepPrimAPI_MakePrism_1(face, vec, false, true);
                                if (!prism.IsDone()) {
                                    console.error("Extrude: MakePrism failed");
                                } else {
                                    currentShape = prism.Shape();
                                }
                                prism.delete(); vec.delete(); face.delete();
                            }

                            faceB.delete(); wire.delete(); makePoly.delete();
                        } catch (err: unknown) {
                            console.error(`Extrude WASM CRASH: ${err instanceof Error ? err.message : String(err)} `);
                        }
                    }
                } else if (type === 'revolve' && (params as any).sourceSketchId) {
                    const sourceSketch = nodes.find(n => n.id === (params as any).sourceSketchId);
                    const pLines = (sourceSketch?.params as any)?.lines;
                    if (pLines && pLines.length > 0) {
                        const { plane } = params as any;
                        const sortedLines = [];
                        const remaining = [...pLines];
                        sortedLines.push(remaining.shift());
                        const dist = (p1: { x: number, y: number, z: number }, p2: { x: number, y: number, z: number }) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
                        while (remaining.length > 0) {
                            const lastPt = sortedLines[sortedLines.length - 1].end;
                            const nextIdx = remaining.findIndex((l: { start: { x: number, y: number, z: number }, end: { x: number, y: number, z: number } }) => dist(l.start, lastPt) < 1e-4 || dist(l.end, lastPt) < 1e-4);
                            if (nextIdx !== -1) {
                                const nextLine = remaining.splice(nextIdx, 1)[0];
                                if (dist(nextLine.end, lastPt) < 1e-4) sortedLines.push({ start: nextLine.end, end: nextLine.start });
                                else sortedLines.push(nextLine);
                            } else {
                                sortedLines.push(remaining.shift());
                            }
                        }
                        try {
                            const makePoly = new ocAny.BRepBuilderAPI_MakePolygon_1();
                            const vertices = [sortedLines[0].start];
                            for (let i = 0; i < sortedLines.length; i++) {
                                vertices.push(sortedLines[i].end);
                            }
                            if (dist(vertices[0], vertices[vertices.length - 1]) < 1e-4) {
                                vertices.pop();
                            }
                            vertices.forEach(v => {
                                const p = new ocAny.gp_Pnt_1();
                                p.SetCoord_2(v.x, v.y, v.z);
                                makePoly.Add_1(p);
                                p.delete();
                            });
                            makePoly.Close();

                            if (!makePoly.IsDone()) {
                                console.error("Revolve: MakePolygon failed. Vertices: " + vertices.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`).join("|"));
                            }

                            const wire = makePoly.Wire();
                            const faceB = new ocAny.BRepBuilderAPI_MakeFace_15(wire, false);

                            if (!faceB.IsDone()) {
                                console.error("Revolve: MakeFace failed.");
                            } else {
                                const face = faceB.Face();
                                // Choose an appropriate axis to avoid self-intersection
                                // We calculate the bbox of the vertices to offset the axis if needed
                                let minX = Infinity, minY = Infinity;
                                vertices.forEach(v => {
                                    if (v.x < minX) minX = v.x;
                                    if (v.y < minY) minY = v.y;
                                });

                                const pnt = new ocAny.gp_Pnt_1();
                                // To avoid intersecting the sketch, we put the axis at the min coordinate of the sketch
                                pnt.SetCoord_2(0, minY - 1, 0);
                                let dir = new ocAny.gp_Dir_4(1, 0, 0);
                                if ((params as any).sweepVector) {
                                    const sv = (params as any).sweepVector;
                                    const len = Math.sqrt(sv[0] * sv[0] + sv[1] * sv[1] + sv[2] * sv[2]);
                                    if (len > 0) {
                                        dir = new ocAny.gp_Dir_4(sv[0] / len, sv[1] / len, sv[2] / len);
                                    }
                                } else if (plane === 'xy' || plane === 'xz') {
                                    pnt.SetCoord_2(0, minY - 1, 0);
                                    dir = new ocAny.gp_Dir_4(1, 0, 0); // Revolve around X horizontally
                                } else if (plane === 'yz') {
                                    pnt.SetCoord_2(0, 0, minY - 1);
                                    dir = new ocAny.gp_Dir_4(0, 0, 1);
                                }
                                const ax1 = new ocAny.gp_Ax1_2(pnt, dir);

                                const angleDef = ((params as any).angle !== undefined ? (params as any).angle : 360) * (Math.PI / 180);
                                const revol = new ocAny.BRepPrimAPI_MakeRevol_1(face, ax1, angleDef, false);

                                if (!revol.IsDone()) {
                                    console.error("Revolve: MakeRevol failed. Angle: " + angleDef);
                                } else {
                                    currentShape = revol.Shape();
                                }
                                face.delete(); pnt.delete(); dir.delete(); ax1.delete(); revol.delete();
                            }

                            makePoly.delete(); faceB.delete(); wire.delete();
                        } catch (err: unknown) {
                            console.error(`Revolve WASM CRASH: ${err instanceof Error ? err.message : String(err)} `);
                        }
                    }
                } else if (type === 'boolean') {
                    const targetShape = buildShape((params as any).targetId);
                    const toolShape = buildShape((params as any).toolId);
                    if (targetShape && toolShape) {
                        let boolOp;
                        if ((params as any).operation === 'cut') {
                            boolOp = new ocAny.BRepAlgoAPI_Cut_3(targetShape, toolShape);
                        } else if ((params as any).operation === 'fuse') {
                            boolOp = new ocAny.BRepAlgoAPI_Fuse_3(targetShape, toolShape);
                        } else if ((params as any).operation === 'common') {
                            boolOp = new ocAny.BRepAlgoAPI_Common_3(targetShape, toolShape);
                        }
                        if (boolOp) {
                            boolOp.Build();
                            if (boolOp.IsDone()) {
                                currentShape = boolOp.Shape();
                            } else {
                                console.warn(`Boolean ${(params as any).operation} failed between ${(params as any).targetId} and ${(params as any).toolId} `);
                                // Fallback to target if boolean fails
                                currentShape = new ocAny.TopoDS_Shape_2(targetShape);
                            }
                            boolOp.delete();
                        }
                    } else if (targetShape) {
                        currentShape = targetShape; // Fallback to Target if Tool fails to build or is missing
                    }
                    if (targetShape) (targetShape as any).delete();
                    if (toolShape) (toolShape as any).delete();
                }

                // Apply node properties + operations here!
                if (currentShape) {
                    // Apply explicit CAD operations
                    const nodeOperations = (node as any).operations || [];
                    if (nodeOperations && nodeOperations.length > 0) {
                        for (const op of nodeOperations) {
                            if (op.type === 'fillet') {
                                const mkFillet: typeof ocAny.BRepFilletAPI_MakeFillet_1 = new ocAny.BRepFilletAPI_MakeFillet_1(currentShape, 0);
                                const edgeExp = new ocAny.TopExp_Explorer_1();
                                edgeExp.Init(currentShape, ocAny.TopAbs_ShapeEnum.TopAbs_EDGE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE);
                                let currentEdgeIdx = 0;
                                let addedFillet = false;
                                while (edgeExp.More()) {
                                    if (currentEdgeIdx === op.edgeIndex) {
                                        const edge = ocAny.TopoDS.Edge_1(edgeExp.Current());
                                        mkFillet.Add_2(op.radius, edge);
                                        edge.delete();
                                        addedFillet = true;
                                        break;
                                    }
                                    edgeExp.Next();
                                    currentEdgeIdx++;
                                }
                                edgeExp.delete();
                                if (addedFillet) {
                                    const filletedShape = mkFillet.Shape();
                                    currentShape.delete();
                                    currentShape = filletedShape;
                                }
                                mkFillet.delete();
                            }
                        }
                    }

                    // Apply coordinate transform mapping (GTrsf implementation)
                    const nodeTransform = (node as any).transform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
                    const trsf = new ocAny.gp_Trsf_1();
                    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nodeTransform.rotation));
                    const ocQ = new ocAny.gp_Quaternion_2(q.x, q.y, q.z, q.w);
                    trsf.SetRotation_2(ocQ);
                    const vT = new ocAny.gp_Vec_4(nodeTransform.position[0], nodeTransform.position[1], nodeTransform.position[2]);
                    trsf.SetTranslationPart(vT);
                    const gTrsf = new ocAny.gp_GTrsf_2(trsf);
                    gTrsf.SetValue(1, 1, gTrsf.Value(1, 1) * nodeTransform.scale[0]);
                    gTrsf.SetValue(2, 2, gTrsf.Value(2, 2) * nodeTransform.scale[1]);
                    gTrsf.SetValue(3, 3, gTrsf.Value(3, 3) * nodeTransform.scale[2]);

                    const transformSys = new ocAny.BRepBuilderAPI_GTransform_2(currentShape, gTrsf, true);
                    const transformedShape = transformSys.Shape();
                    currentShape.delete();
                    currentShape = transformedShape;

                    transformSys.delete(); vT.delete(); ocQ.delete(); trsf.delete(); gTrsf.delete();
                }

                return currentShape;
            };

            // Initiate recursive build cycle starting from the activeNodeId!
            // Wait, we want to construct ONLY what is meant to be rendered dynamically for the active node context.
            // When building 'boolean', the output shape is precisely what is returned from buildShape.
            if (!activeNodeId) {
                return;
            }
            const finalNode = nodes.find(n => n.id === activeNodeId);
            if (!finalNode) {
                return;
            }

            // Re-route legacy singular props fallback logic if nodes[] is missing elements
            // --- RENDER GEOMETRY ---
            // This useEffect is responsible for generating the Three.js geometry from the OCCT shape.
            // It should be inside the main useEffect that handles OCCT shape generation,
            // or it should depend on the OCCT shape being available.
            // For now, it's placed here to process `finalNode.shape` which is assumed to be set by `buildShape`.
            // This structure implies `finalNode.shape` is a state or ref that gets updated.
            // If `finalNode.shape` is not a state/ref, this useEffect will only run once with the initial value.
            // A better approach might be to have `buildShape` return the shape and then process it.

            // Let's refactor this to be a direct part of the main useEffect,
            // or ensure `finalNode.shape` is correctly passed/derived.
            // Given the current structure, `finalNode.shape` is not directly available here
            // unless it's a property of the `finalNode` object that is already processed.
            // The `buildShape` function *returns* a shape, it doesn't set it on `finalNode`.
            // So, we need to call `buildShape` here to get the shape to render.

            let finalRenderedShape = buildShape(activeNodeId) as any;
            if (!finalRenderedShape) return;

            const newFeatureMap = { faces: [], edges: [] } as { faces: number[], edges: number[] };
            const newSnapPoints: THREE.Vector3[] = [];
            const edgePositions: number[] = [];

            try {
                // Extrusion visualization uses a copy to avoid mutating the original
                if (extrusionDebug) {
                    try {
                        const copyShape = new ocAny.BRepBuilderAPI_Copy_2(finalRenderedShape, true, false);
                        finalRenderedShape.delete(); // Delete original if copied
                        finalRenderedShape = copyShape.Shape();
                        copyShape.delete();
                    } catch (e) {
                        console.warn("Could not copy shape for extrusion preview.", e);
                    }
                } else if (nodes.length > 1) {
                    // If there are multiple nodes, ensure we're working on a copy if the shape might be reused
                    // This logic might need refinement based on how `nodes` and `activeNodeId` interact
                    const copyShape = new ocAny.BRepBuilderAPI_Copy_2(finalRenderedShape, true, false);
                    finalRenderedShape.delete(); // Delete original if copied
                    finalRenderedShape = copyShape.Shape();
                    copyShape.delete();
                }

                // --- Triangulate for React Three Fiber (Mesh Mode) ---
                // By default, OpenCascade uses a mathematical B-Rep. We must triangulate to show it.
                const triangulation = new ocAny.BRepMesh_IncrementalMesh_2(finalRenderedShape, 0.1, false, 0.5, false);
                triangulation.delete();


                // Traverse through faces and build buffer geometry
                const expFace = new ocAny.TopExp_Explorer_1();
                const positions: number[] = [];
                const normals: number[] = [];
                const indices: number[] = [];
                let vertexOffset = 0;

                for (expFace.Init(finalRenderedShape, ocAny.TopAbs_ShapeEnum.TopAbs_FACE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); expFace.More(); expFace.Next()) {
                    const face = ocAny.TopoDS.Face_1(expFace.Current());
                    const loc = new ocAny.TopLoc_Location_1();
                    const polyTri = ocAny.BRep_Tool.Triangulation(face, loc);

                    if (!polyTri.IsNull()) {
                        const tri = polyTri.get();
                        const nbNodes = tri.NbNodes();
                        const nbTriangles = tri.NbTriangles();

                        // Record the topological index for face-picking mapping
                        const faceIndexVal = newFeatureMap.faces.length;

                        for (let i = 1; i <= nbNodes; i++) {
                            const pnt = tri.Node(i).Transformed(loc.Transformation());
                            positions.push(pnt.X(), pnt.Y(), pnt.Z());
                            if (tri.HasNormals()) {
                                // This is safe because BRepMesh guarantees correct sizing
                                const n = tri.Normal(i);
                                normals.push(n.X(), n.Y(), n.Z());
                            } else {
                                normals.push(0, 0, 1);
                            }
                        }

                        for (let i = 1; i <= nbTriangles; i++) {
                            const t = tri.Triangle(i);
                            let n1 = t.Value(1), n2 = t.Value(2), n3 = t.Value(3);
                            if (face.Orientation_1() === ocAny.TopAbs_Orientation.TopAbs_REVERSED) {
                                const tmp = n1; n1 = n2; n2 = tmp;
                            }
                            indices.push(vertexOffset + n1 - 1, vertexOffset + n2 - 1, vertexOffset + n3 - 1);
                            newFeatureMap.faces.push(faceIndexVal);
                        }
                        vertexOffset += nbNodes;
                    }
                    loc.delete();
                    face.delete();
                }
                expFace.delete();

                const finalGeom = new THREE.BufferGeometry();
                finalGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                if (normals.length === positions.length) {
                    finalGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                } else {
                    finalGeom.computeVertexNormals();
                }
                if (indices.length > 0) {
                    finalGeom.setIndex(indices);
                }

                // Compute generic bounding sphere for orbit controls or initial camera positioning
                finalGeom.computeBoundingSphere();

                // Extract edges for wireframe and snapping
                const edgeExp = new ocAny.TopExp_Explorer_1();
                let currentTopoEdgeIndex = 0;
                for (edgeExp.Init(finalRenderedShape, ocAny.TopAbs_ShapeEnum.TopAbs_EDGE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); edgeExp.More(); edgeExp.Next()) {
                    const edge = ocAny.TopoDS.Edge_1(edgeExp.Current());
                    const adaptor = new ocAny.BRepAdaptor_Curve_2(edge);
                    const p1 = adaptor.FirstParameter();
                    const p2 = adaptor.LastParameter();
                    const numSegments = 20; // For smooth curves

                    for (let i = 0; i < numSegments; i++) {
                        const u1 = p1 + (p2 - p1) * (i / numSegments);
                        const u2 = p1 + (p2 - p1) * ((i + 1) / numSegments);
                        const pt1 = adaptor.Value(u1);
                        const pt2 = adaptor.Value(u2);
                        edgePositions.push(pt1.X(), pt1.Y(), pt1.Z());
                        edgePositions.push(pt2.X(), pt2.Y(), pt2.Z());
                        newFeatureMap.edges.push(currentTopoEdgeIndex);
                        pt1.delete(); pt2.delete();
                    }
                    adaptor.delete();
                    edge.delete();
                    currentTopoEdgeIndex++;
                }
                edgeExp.delete();

                let finalEdgeGeom = new THREE.BufferGeometry();
                finalEdgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));

                // Helper to apply current originTransform to a point
                const applyTransform = (pt: THREE.Vector3) => {
                    const matrix = new THREE.Matrix4().compose(
                        new THREE.Vector3(...originTransform.position),
                        new THREE.Quaternion().setFromEuler(new THREE.Euler(...originTransform.rotation)),
                        new THREE.Vector3(...originTransform.scale)
                    );
                    return pt.applyMatrix4(matrix);
                };

                // Extract Snapping Points
                const vertexExp = new ocAny.TopExp_Explorer_1();
                for (vertexExp.Init(finalRenderedShape, ocAny.TopAbs_ShapeEnum.TopAbs_VERTEX, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); vertexExp.More(); vertexExp.Next()) {
                    const vertex = ocAny.TopoDS.Vertex_1(vertexExp.Current());
                    const pnt = ocAny.BRep_Tool.Pnt(vertex);
                    let v = new THREE.Vector3(pnt.X(), pnt.Y(), pnt.Z());
                    newSnapPoints.push(applyTransform(v));
                    pnt.delete();
                    vertex.delete();
                }
                vertexExp.delete();

                const edgeExpSnap = new ocAny.TopExp_Explorer_1();
                for (edgeExpSnap.Init(finalRenderedShape, ocAny.TopAbs_ShapeEnum.TopAbs_EDGE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); edgeExpSnap.More(); edgeExpSnap.Next()) {
                    const edge = ocAny.TopoDS.Edge_1(edgeExpSnap.Current());
                    try {
                        const curveAdaptor = new ocAny.BRepAdaptor_Curve_2(edge);

                        // 1. Arc / Circle center points
                        try {
                            const circle = curveAdaptor.Circle();
                            const center = circle.Location();
                            let v = new THREE.Vector3(center.X(), center.Y(), center.Z());
                            newSnapPoints.push(applyTransform(v));
                            center.delete();
                            circle.delete();
                        } catch (errCircle) {
                            try {
                                const ellipse = curveAdaptor.Ellipse();
                                const center = ellipse.Location();
                                let v = new THREE.Vector3(center.X(), center.Y(), center.Z());
                                newSnapPoints.push(applyTransform(v));
                                center.delete();
                                ellipse.delete();
                            } catch (errEllipse) {
                                // Neither a circle nor an ellipse
                            }
                        }

                        // 2. Midpoints
                        const p1 = curveAdaptor.FirstParameter();
                        const p2 = curveAdaptor.LastParameter();
                        if (!Number.isNaN(p1) && !Number.isNaN(p2)) {
                            const midPnt = curveAdaptor.Value((p1 + p2) / 2);
                            let v = new THREE.Vector3(midPnt.X(), midPnt.Y(), midPnt.Z());
                            newSnapPoints.push(applyTransform(v));
                            midPnt.delete();
                        }
                        curveAdaptor.delete();
                    } catch (e) {
                        console.error("Error snapping edge:", e);
                    }
                    edge.delete();
                }
                edgeExpSnap.delete();

                const faceExpSnap = new ocAny.TopExp_Explorer_1();
                for (faceExpSnap.Init(finalRenderedShape, ocAny.TopAbs_ShapeEnum.TopAbs_FACE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); faceExpSnap.More(); faceExpSnap.Next()) {
                    const face = ocAny.TopoDS.Face_1(faceExpSnap.Current());
                    try {
                        const props = new ocAny.GProp_GProps_1();
                        ocAny.BRepGProp.SurfaceProperties_1(face, props, false);
                        const center = props.CentreOfMass();
                        if (!Number.isNaN(center.X())) {
                            let v = new THREE.Vector3(center.X(), center.Y(), center.Z());
                            newSnapPoints.push(applyTransform(v));
                        }
                        center.delete();
                        props.delete();
                    } catch (e) {
                        // Suppress computation errors for non-planar faces
                        console.warn("Could not compute center of mass for face");
                    }
                    face.delete();
                }
                faceExpSnap.delete();

                finalRenderedShape.delete();

                setGeometry(finalGeom);
                setEdgeGeometry(finalEdgeGeom);
                // Also update snapping array globally
                setSnapPoints([...newSnapPoints]);
                setFeatureMap(newFeatureMap);

                // --- Inactive Geometry Builder ---
                let hasInactive = false;
                const inactiveBuilder = new ocAny.BRep_Builder();
                const inactiveCompound = new ocAny.TopoDS_Compound();
                inactiveBuilder.MakeCompound(inactiveCompound);

                for (const n of nodes) {
                    if (n.id !== activeNodeId && n.visible !== false && n.type !== 'sketch') {
                        const shp = buildShape(n.id as string);
                        if (shp) {
                            hasInactive = true;
                            // Need to parse geometry into one big shape
                            inactiveBuilder.Add(inactiveCompound, shp);
                            (shp as any).delete();
                        }
                    }
                }

                if (hasInactive) {
                    const inactiveGeom = new THREE.BufferGeometry();
                    const inactiveEdgeGeom = new THREE.BufferGeometry();

                    const inactiveTriangulation = new ocAny.BRepMesh_IncrementalMesh_2(inactiveCompound, 0.1, false, 0.5, false);
                    inactiveTriangulation.delete();

                    // Traversal arrays
                    const iPositions: number[] = [];
                    const iNormals: number[] = [];
                    const iIndices: number[] = [];
                    let iVertexOffset = 0;

                    const iExpFace = new ocAny.TopExp_Explorer_1();
                    for (iExpFace.Init(inactiveCompound, ocAny.TopAbs_ShapeEnum.TopAbs_FACE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); iExpFace.More(); iExpFace.Next()) {
                        const face = ocAny.TopoDS.Face_1(iExpFace.Current());
                        const loc = new ocAny.TopLoc_Location_1();
                        const polyTri = ocAny.BRep_Tool.Triangulation(face, loc);
                        if (!polyTri.IsNull()) {
                            const tri = polyTri.get();
                            const nbNodes = tri.NbNodes();
                            const nbTriangles = tri.NbTriangles();
                            for (let i = 1; i <= nbNodes; i++) {
                                const pnt = tri.Node(i).Transformed(loc.Transformation());
                                iPositions.push(pnt.X(), pnt.Y(), pnt.Z());
                                if (tri.HasNormals()) {
                                    const n = tri.Normal(i);
                                    iNormals.push(n.X(), n.Y(), n.Z());
                                } else {
                                    iNormals.push(0, 0, 1);
                                }
                            }
                            for (let i = 1; i <= nbTriangles; i++) {
                                const t = tri.Triangle(i);
                                let n1 = t.Value(1), n2 = t.Value(2), n3 = t.Value(3);
                                if (face.Orientation_1() === ocAny.TopAbs_Orientation.TopAbs_REVERSED) {
                                    const tmp = n1; n1 = n2; n2 = tmp;
                                }
                                iIndices.push(iVertexOffset + n1 - 1, iVertexOffset + n2 - 1, iVertexOffset + n3 - 1);
                            }
                            iVertexOffset += nbNodes;
                        }
                        loc.delete(); face.delete();
                    }
                    iExpFace.delete();

                    inactiveGeom.setAttribute('position', new THREE.Float32BufferAttribute(iPositions, 3));
                    if (iNormals.length === iPositions.length) {
                        inactiveGeom.setAttribute('normal', new THREE.Float32BufferAttribute(iNormals, 3));
                    } else {
                        inactiveGeom.computeVertexNormals();
                    }
                    if (iIndices.length > 0) inactiveGeom.setIndex(iIndices);

                    // Edges
                    const iEdgePositions: number[] = [];
                    const iEdgeExp = new ocAny.TopExp_Explorer_1();
                    for (iEdgeExp.Init(inactiveCompound, ocAny.TopAbs_ShapeEnum.TopAbs_EDGE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE); iEdgeExp.More(); iEdgeExp.Next()) {
                        const edge = ocAny.TopoDS.Edge_1(iEdgeExp.Current());
                        const adaptor = new ocAny.BRepAdaptor_Curve_2(edge);
                        const p1 = adaptor.FirstParameter();
                        const p2 = adaptor.LastParameter();
                        for (let i = 0; i < 20; i++) {
                            const u1 = p1 + (p2 - p1) * (i / 20);
                            const u2 = p1 + (p2 - p1) * ((i + 1) / 20);
                            const pt1 = adaptor.Value(u1);
                            const pt2 = adaptor.Value(u2);
                            iEdgePositions.push(pt1.X(), pt1.Y(), pt1.Z(), pt2.X(), pt2.Y(), pt2.Z());
                            pt1.delete(); pt2.delete();
                        }
                        adaptor.delete(); edge.delete();
                    }
                    iEdgeExp.delete();

                    inactiveEdgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(iEdgePositions, 3));

                    setInactiveGeometry(inactiveGeom);
                    setInactiveEdgeGeometry(inactiveEdgeGeom);
                } else {
                    setInactiveGeometry(null);
                    setInactiveEdgeGeometry(null);
                }
                inactiveCompound.delete();
                inactiveBuilder.delete();

            } catch (e: unknown) {
                console.error("Caught exception during geometry generation at the following step:");
                console.error(e instanceof Error ? e.message : e);
                if (e instanceof Error && e.stack) console.error(e.stack);

                // If it's a wrapped C++ exception
                const ocAny = oc as any;
                if (oc && typeof ocAny.getExceptionMessage === 'function') {
                    try {
                        console.error("OCCT specific error message:", ocAny.getExceptionMessage(e));
                    } catch (internalE) { /* ignore */ }
                }
            }
        } catch (outerE) {
            console.error("Caught exception during node component generation:", outerE);
        }
    }, [oc, activeNodeId, nodes, extrusionDebug, renderMode]);

    // Generate geometry for highlighted feature based on the vertex maps
    const highlightedGeometry = useMemo(() => {
        if (!selectedFeature || !geometry || !edgeGeometry) return null;

        if (selectedFeature.type === 'edge' && featureMap.edges.length > 0) {
            const positions = edgeGeometry.getAttribute('position') as THREE.BufferAttribute;
            const highlightedPositions: number[] = [];

            for (let i = 0; i < featureMap.edges.length; i++) {
                if (featureMap.edges[i] === selectedFeature.index) {
                    // Extract the two vertices of this segment
                    const v1 = i * 2;
                    const v2 = i * 2 + 1;
                    highlightedPositions.push(positions.getX(v1), positions.getY(v1), positions.getZ(v1));
                    highlightedPositions.push(positions.getX(v2), positions.getY(v2), positions.getZ(v2));
                }
            }
            if (highlightedPositions.length > 0) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(highlightedPositions, 3));
                return geom;
            }
        } else if (selectedFeature.type === 'face' && featureMap.faces.length > 0) {
            const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
            const highlightedPositions: number[] = [];

            for (let i = 0; i < featureMap.faces.length; i++) {
                if (featureMap.faces[i] === selectedFeature.index) {
                    // Extract the three vertices of this triangle
                    const v1 = i * 3;
                    const v2 = i * 3 + 1;
                    const v3 = i * 3 + 2;
                    highlightedPositions.push(positions.getX(v1), positions.getY(v1), positions.getZ(v1));
                    highlightedPositions.push(positions.getX(v2), positions.getY(v2), positions.getZ(v2));
                    highlightedPositions.push(positions.getX(v3), positions.getY(v3), positions.getZ(v3));
                }
            }
            if (highlightedPositions.length > 0) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(highlightedPositions, 3));
                geom.computeVertexNormals();
                return geom;
            }
        }
        return null;
    }, [selectedFeature, featureMap, geometry, edgeGeometry]);
    const isPlaneInteractive = activeTool === 'sketch_plane' || activeTool.startsWith('sketch_') || activeTool === 'select_sweep_path';

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Canvas orthographic camera={{ position: [100, 100, 100], up: [0, 0, 1], zoom: 25, near: -10000, far: 10000 }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (activeTool === 'sketch_line') {
                        setActiveLineStart(null); // Right click to detach drawing pen
                    }
                }}
                onPointerMissed={(e) => {
                    if (activeTool === 'measure' && e.type === 'click') {
                        // clear measurement or add point if we aren't snapping to anything
                        if (!activeSnapPoint) {
                            // If they clicked the background, we reset the measurement
                            setMeasurePoints([]);
                        } else {
                            // Let the other handler take this
                        }
                    }
                }}
            >
                <color attach="background" args={[settings.backgroundColor]} />
                <ambientLight intensity={settings.ambientLightIntensity} />
                <directionalLight position={[10, 20, 10]} intensity={settings.directionalLightIntensity} />
                <directionalLight position={[-10, -20, -10]} intensity={0.5} />
                <directionalLight position={[0, 10, -20]} intensity={0.3} />
                {showGrid && <Grid args={[settings.gridSize, settings.gridSize]} cellColor="#334155" sectionColor="#475569" fadeDistance={400} />}
                <OrbitControls makeDefault />

                {extrusionDebug && (
                    <Html position={[0, 0, 0]} center as="div" style={{ pointerEvents: 'none', color: '#f87171', background: 'rgba(15, 23, 42, 0.9)', padding: '12px', whiteSpace: 'nowrap', zIndex: 99999, border: '1px solid #ef4444', borderRadius: '4px' }}>
                        {extrusionDebug}
                    </Html>
                )}

                {/* Add an invisible interaction overlay for measure mode clicks if we want to capture anywhere,
                    or bind it to the main group. We bind it to the main group so it overlaps the model. */}
                <group ref={sceneRef}
                    visible={nodes.find(n => n.id === activeNodeId)?.visible !== false}
                    onPointerUp={(e) => {
                        if (activeTool === 'measure' && activeSnapPoint) {
                            e.stopPropagation();
                            setMeasurePoints((prev) => {
                                if (prev.length >= 2) {
                                    return [activeSnapPoint.clone()];
                                }
                                return [...prev, activeSnapPoint.clone()];
                            });
                        } else if (activeTool === 'select_sweep_path' && activeSnapPoint) {
                            setSweepDraggerOrigin(activeSnapPoint);
                        }
                        if (activeTool.startsWith('transform') && activeSnapPoint && trihedronGroupRef.current) {
                            e.stopPropagation();
                            // Instead of modifying the mesh, we set a Pivot offset for the Gizmo relative to the mesh
                            const diff = activeSnapPoint.clone().sub(trihedronGroupRef.current.position);
                            setGizmoPivotOffset(diff);
                            setActiveSnapPoint(null); // clear after snap
                        }
                    }}
                >
                    {nodes?.filter((n: any) => n.lcsVisible).map((n: any) => (
                        <group
                            key={`lcs - ${n.id} `}
                            position={n.transform?.position}
                            rotation={n.transform?.rotation}
                            scale={n.transform?.scale}
                        >
                            <LCSPlane scale={settings.lcsSize * 1.2} />
                        </group>
                    ))}
                    {/* Render explicit user standalone lcs_plane objects */}
                    {nodes?.filter((n: any) => n.type === 'lcs_plane' && n.visible).map((n: any) => (
                        <group
                            key={`standalone - lcs - ${n.id} `}
                            position={n.transform?.position}
                            rotation={n.transform?.rotation}
                            scale={n.transform?.scale}
                        >
                            <LCSPlane scale={settings.lcsSize * 1.5} />
                        </group>
                    ))}
                    {renderMode === 'mesh' && geometry && (
                        <group>
                            <mesh
                                geometry={geometry}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeTool === 'select') {
                                        if (onSelectFeature && e.faceIndex !== undefined && featureMap.faces.length > 0) {
                                            const topoIndex = featureMap.faces[e.faceIndex as number];
                                            if (topoIndex !== undefined) {
                                                onSelectFeature('face', topoIndex);
                                            }
                                        } else if (onSelectNode && activeNodeId) {
                                            onSelectNode(activeNodeId);
                                        }
                                    } else if (activeTool === 'select_sweep_path' && e.face) {
                                        const normal = e.face.normal.clone();
                                        normal.transformDirection(e.object.matrixWorld).normalize();
                                        onSelectSweepVector?.([normal.x, normal.y, normal.z]);
                                    }
                                }}
                                onPointerOver={(e) => { if (activeTool === 'select' || activeTool === 'select_sweep_path') { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
                                onPointerOut={() => { if (activeTool === 'select' || activeTool === 'select_sweep_path') document.body.style.cursor = 'default'; }}
                            >
                                <meshStandardMaterial color="#38bdf8" roughness={0.3} metalness={0.7} side={THREE.DoubleSide} />
                                <Edges threshold={15} color="#0f172a" />
                            </mesh>
                        </group>
                    )}
                </group>

                {renderMode === 'mesh' && inactiveGeometry && (
                    <group>
                        <mesh geometry={inactiveGeometry}>
                            <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.5} transparent opacity={0.6} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                )}

                {activeNodeId && shapeType === 'extrude' && activeTool === 'select' && onUpdateNodeParam && (() => {
                    const sketchId = (shapeParams as any)?.sourceSketchId;
                    const sketchNode = nodes.find(n => n.id === sketchId);
                    let cx = 0, cy = 0, cz = 0;
                    if (sketchNode && (sketchNode.params as any)?.lines) {
                        const lines = (sketchNode.params as any).lines;
                        const uniquePts = new Set();
                        const pts: { x: number, y: number, z: number }[] = [];
                        lines.forEach((l: any) => {
                            const k1 = `${l.start.x.toFixed(3)},${l.start.y.toFixed(3)},${l.start.z.toFixed(3)} `;
                            const k2 = `${l.end.x.toFixed(3)},${l.end.y.toFixed(3)},${l.end.z.toFixed(3)} `;
                            if (!uniquePts.has(k1)) { uniquePts.add(k1); pts.push(l.start); }
                            if (!uniquePts.has(k2)) { uniquePts.add(k2); pts.push(l.end); }
                        });
                        if (pts.length > 0) {
                            pts.forEach(p => { cx += p.x; cy += p.y; cz += p.z; });
                            cx /= pts.length; cy /= pts.length; cz /= pts.length;
                        }
                    }

                    const depth = (shapeParams?.depth as number) || 50;
                    const plane = (shapeParams?.plane as string) || 'xy';
                    let dx = cx, dy = cy, dz = cz;

                    // Offset drag handle along normal
                    if (plane === 'xy') dz += depth;
                    else if (plane === 'xz') dy += depth;
                    else if (plane === 'yz') dx += depth;

                    return (
                        <TransformControls
                            mode="translate"
                            showX={plane === 'yz'} showY={plane === 'xz'} showZ={plane === 'xy'}
                            position={[dx, dy, dz]}
                            onObjectChange={(e) => {
                                const ctrl = e?.target as any;
                                if (ctrl && ctrl.object) {
                                    let newDepth = depth;
                                    if (plane === 'xy') newDepth = ctrl.object.position.z - cz;
                                    else if (plane === 'xz') newDepth = ctrl.object.position.y - cy;
                                    else if (plane === 'yz') newDepth = ctrl.object.position.x - cx;

                                    newDepth = Math.max(0.1, newDepth);
                                    onUpdateNodeParam(activeNodeId, 'depth', newDepth);
                                }
                            }}
                        >
                            <mesh visible={false}>
                                <boxGeometry args={[1, 1, 1]} />
                                <meshBasicMaterial color="#f00" wireframe />
                            </mesh>
                        </TransformControls>
                    );
                })()}

                {activeNodeId && shapeType === 'revolve' && activeTool === 'select' && onUpdateNodeParam && (
                    <TransformControls
                        mode="rotate"
                        showX={false} showY={false} showZ={true}
                        rotation={[0, 0, ((shapeParams?.angle as number) || 360) * (Math.PI / 180)]}
                        onObjectChange={(e) => {
                            const ctrl = e?.target as any;
                            if (ctrl && ctrl.object) {
                                let deg = ctrl.object.rotation.z * (180 / Math.PI);
                                while (deg < 0) deg += 360;
                                while (deg > 360) deg -= 360;
                                if (deg < 1) deg = 360; // default to a full revolve if they zero it out
                                onUpdateNodeParam(activeNodeId, 'angle', deg);
                            }
                        }}
                    >
                        <mesh visible={false}>
                            <boxGeometry args={[1, 1, 1]} />
                            <meshBasicMaterial color="#0f0" wireframe />
                        </mesh>
                    </TransformControls>
                )}

                {renderMode === 'brep' && edgeGeometry && (
                    <lineSegments
                        geometry={edgeGeometry}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (activeTool === 'select' && onSelectFeature && e.index !== undefined && featureMap.edges.length > 0) {
                                const currentSegIndex = Math.floor(e.index / 2);
                                const topoIndex = featureMap.edges[currentSegIndex];
                                if (topoIndex !== undefined && topoIndex >= 0) {
                                    onSelectFeature('edge', topoIndex);
                                }
                            } else if (activeTool === 'select_sweep_path' && e.index !== undefined && featureMap.edges.length > 0) {
                                const positions = edgeGeometry.getAttribute('position') as THREE.BufferAttribute;
                                const v1 = Math.floor(e.index / 2) * 2;
                                const v2 = v1 + 1;
                                const p1 = new THREE.Vector3(positions.getX(v1), positions.getY(v1), positions.getZ(v1));
                                const p2 = new THREE.Vector3(positions.getX(v2), positions.getY(v2), positions.getZ(v2));
                                const vec = p2.sub(p1).normalize();
                                onSelectSweepVector?.([vec.x, vec.y, vec.z]);
                            }
                        }}
                        onPointerOver={(e) => {
                            e.stopPropagation();
                            if (e.index !== undefined) {
                                const segIdx = Math.floor(e.index / 2);
                                if (featureMap.edges[segIdx] >= 0 && (activeTool === 'select' || activeTool === 'select_sweep_path')) document.body.style.cursor = 'pointer';
                            }
                        }}
                        onPointerOut={() => { document.body.style.cursor = 'default'; }}
                    >
                        <lineBasicMaterial color="#38bdf8" linewidth={2} />
                    </lineSegments>
                )}

                {renderMode === 'brep' && inactiveEdgeGeometry && (
                    <lineSegments
                        geometry={inactiveEdgeGeometry}
                        renderOrder={0}
                        onClick={(e) => {
                            if (activeTool === 'select_sweep_path' && e.index !== undefined) {
                                e.stopPropagation();
                                const positions = inactiveEdgeGeometry.getAttribute('position') as THREE.BufferAttribute;
                                const v1 = Math.floor(e.index / 2) * 2;
                                const v2 = v1 + 1;
                                const p1 = new THREE.Vector3(positions.getX(v1), positions.getY(v1), positions.getZ(v1));
                                const p2 = new THREE.Vector3(positions.getX(v2), positions.getY(v2), positions.getZ(v2));
                                const vec = p2.sub(p1).normalize();
                                onSelectSweepVector?.([vec.x, vec.y, vec.z]);
                            }
                        }}
                        onPointerOver={(e) => { if (activeTool === 'select_sweep_path' && e.index !== undefined) { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
                        onPointerOut={() => { if (activeTool === 'select_sweep_path') document.body.style.cursor = 'default'; }}
                    >
                        <lineBasicMaterial color="#64748b" linewidth={1} />
                    </lineSegments>
                )}

                {/* Highlight geometry overlay */}
                {highlightedGeometry && selectedFeature?.type === 'edge' && (
                    <lineSegments geometry={highlightedGeometry} renderOrder={1}>
                        <lineBasicMaterial color="#facc15" linewidth={4} depthTest={false} />
                    </lineSegments>
                )}
                {highlightedGeometry && activeTool === 'select' && selectedFeature?.type === 'face' && (
                    <mesh geometry={highlightedGeometry} position={[0, 0, 0.01]} renderOrder={1}>
                        <meshStandardMaterial color="#facc15" side={THREE.DoubleSide} transparent opacity={0.6} depthTest={false} />
                    </mesh>
                )}

                {/* Drafting Trihedron Planes & Sketch Environment */}
                {
                    (activeTool === 'sketch_plane' || activeTool === 'select_sweep_path' || draftingPlane || activeTool.startsWith('transform') || activeTool === 'select' || sketchLines.length > 0) && (
                        <group renderOrder={2}>
                            {(activeTool.startsWith('transform') || (activeTool === 'select' && shapeType === 'sketch')) && trihedronGroupRef.current && (
                                <PivotControls
                                    ref={pivotRef}
                                    depthTest={false}
                                    lineWidth={2}
                                    axisColors={['#ef4444', '#22c55e', '#3b82f6']}
                                    scale={settings.gizmoScale}
                                    fixed={true}
                                    disableAxes={false}
                                    disableSliders={false}
                                    disableRotations={false}
                                    activeAxes={[true, true, true]}
                                    matrix={pivotMatrix}
                                    autoTransform={false}
                                    onDragStart={() => {
                                        isDraggingPivot.current = true;
                                        initialOrigin.current = {
                                            position: [...originTransform.position],
                                            rotation: [...originTransform.rotation],
                                            scale: [...originTransform.scale]
                                        };
                                    }}
                                    onDragEnd={() => { isDraggingPivot.current = false; }}
                                    onDrag={(l) => {
                                        if (onOriginTransformChange && initialOrigin.current) {
                                            // Compute object center relative to pivot's initial space
                                            const O = new THREE.Vector3(...initialOrigin.current.position);

                                            // Recreate the exact PivotMatrix that was active at the START of the drag
                                            const qInitialObj = new THREE.Quaternion().setFromEuler(new THREE.Euler(...initialOrigin.current.rotation));
                                            const qOffset = new THREE.Quaternion().setFromEuler(gizmoPivotRotationOffset);
                                            const qInitialGizmo = qInitialObj.clone().multiply(qOffset);

                                            const Mp = new THREE.Matrix4().compose(
                                                O.clone().add(gizmoPivotOffset),
                                                qInitialGizmo,
                                                new THREE.Vector3(...initialOrigin.current.scale)
                                            );
                                            const vLocal = O.clone().applyMatrix4(Mp.invert());
                                            const newO = vLocal.applyMatrix4(l);

                                            const p = new THREE.Vector3();
                                            const qGizmo = new THREE.Quaternion();
                                            const s = new THREE.Vector3();
                                            l.decompose(p, qGizmo, s);

                                            // Extract the new Object orientation by inverting the Gizmo Tilt offset!
                                            const qNewObj = qGizmo.clone().multiply(qOffset.clone().invert());
                                            const e = new THREE.Euler().setFromQuaternion(qNewObj);

                                            onOriginTransformChange({
                                                position: [newO.x, newO.y, newO.z],
                                                rotation: [e.x, e.y, e.z],
                                                scale: [s.x, s.y, s.z]
                                            });
                                        }
                                    }}
                                />
                            )}
                            {/* Global WCS 3-vector marker (unique styling, absolutely fixed to true world [0,0,0]) */}
                            {showWCS && !draftingPlane && (
                                <axesHelper args={[settings.lcsSize * 4]} />
                            )}
                            <group ref={trihedronGroupRef} position={originTransform.position} rotation={new THREE.Euler(...originTransform.rotation)} scale={new THREE.Vector3(...originTransform.scale)}>
                                <>
                                    {draftingPlane && (
                                        <group>
                                            {/* X Axis Line (Red) */}
                                            {(draftingPlane === 'xy' || draftingPlane === 'xz') && <Line points={[[-10000, 0, 0], [10000, 0, 0]]} color="#ef4444" lineWidth={1} />}
                                            {/* Y Axis Line (Green) */}
                                            {(draftingPlane === 'xy' || draftingPlane === 'yz') && <Line points={[[0, -10000, 0], [0, 10000, 0]]} color="#22c55e" lineWidth={1} />}
                                            {/* Z Axis Line (Blue) */}
                                            {(draftingPlane === 'xz' || draftingPlane === 'yz') && <Line points={[[0, 0, -10000], [0, 0, 10000]]} color="#3b82f6" lineWidth={1} />}
                                        </group>
                                    )}


                                    {/* Using Custom LCSPlane purely for visual interactive plane selection */}
                                    {(!draftingPlane || isPlaneInteractive) && isPlaneInteractive && (
                                        <LCSPlane
                                            scale={settings.lcsSize * 2.5}
                                            activePlane={draftingPlane}
                                            onPlaneClick={(plane, _e) => {
                                                if (activeTool === 'sketch_plane') onSelectDraftingPlane?.(plane);
                                                else if (activeTool === 'select_sweep_path') {
                                                    const vec = plane === 'xy' ? [0, 0, 1] : plane === 'xz' ? [0, 1, 0] : [1, 0, 0];
                                                    onSelectSweepVector?.(vec as any);
                                                }
                                            }}
                                            onPlanePointerOver={(plane, _e) => {
                                                if (isPlaneInteractive) {
                                                    document.body.style.cursor = 'pointer';
                                                    onHoverDraftingPlane?.(plane);
                                                }
                                            }}
                                            onPlanePointerOut={(_plane, _e) => {
                                                if (isPlaneInteractive) {
                                                    document.body.style.cursor = 'default';
                                                    onHoverDraftingPlane?.(null);
                                                }
                                            }}
                                        />
                                    )}

                                    {/* Invisible sketching planes to catch precise 3D drawing clicks */}
                                    {draftingPlane === 'xy' && activeTool.startsWith('sketch') && (
                                        <mesh
                                            position={[0, 0, 0]}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const pt = activeSnapPoint ? activeSnapPoint.clone() : e.point.clone();
                                                const localPt = trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(pt) : pt;
                                                handleSketchClick(localPt);
                                            }}
                                            onPointerMove={(e) => {
                                                e.stopPropagation();
                                                setCursorPlanePosition(trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(e.point.clone()) : e.point.clone());
                                            }}
                                        >
                                            <planeGeometry args={[10000, 10000]} />
                                            <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
                                        </mesh>
                                    )}
                                    {draftingPlane === 'xz' && activeTool.startsWith('sketch') && (
                                        <mesh
                                            position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const pt = activeSnapPoint ? activeSnapPoint.clone() : e.point.clone();
                                                const localPt = trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(pt) : pt;
                                                handleSketchClick(localPt);
                                            }}
                                            onPointerMove={(e) => {
                                                e.stopPropagation();
                                                setCursorPlanePosition(trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(e.point.clone()) : e.point.clone());
                                            }}
                                        >
                                            <planeGeometry args={[10000, 10000]} />
                                            <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
                                        </mesh>
                                    )}
                                    {draftingPlane === 'yz' && activeTool.startsWith('sketch') && (
                                        <mesh
                                            position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const pt = activeSnapPoint ? activeSnapPoint.clone() : e.point.clone();
                                                const localPt = trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(pt) : pt;
                                                handleSketchClick(localPt);
                                            }}
                                            onPointerMove={(e) => {
                                                e.stopPropagation();
                                                setCursorPlanePosition(trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(e.point.clone()) : e.point.clone());
                                            }}
                                        >
                                            <planeGeometry args={[10000, 10000]} />
                                            <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
                                        </mesh>
                                    )}
                                </>

                                {/* Background / Inactive Sketches */}
                                {visibleSketches && visibleSketches.map(sk => (
                                    <group
                                        key={`bg - sk - ${sk.id} `}
                                        position={sk.transform?.position}
                                        rotation={sk.transform ? new THREE.Euler(...sk.transform.rotation) : undefined}
                                        scale={sk.transform ? new THREE.Vector3(...sk.transform.scale) : undefined}
                                    >
                                        {sk.lines.map((l: any, i: number) => {
                                            const p1 = l.start instanceof THREE.Vector3 ? l.start : new THREE.Vector3(l.start.x, l.start.y, l.start.z);
                                            const p2 = l.end instanceof THREE.Vector3 ? l.end : new THREE.Vector3(l.end.x, l.end.y, l.end.z);
                                            return <Line key={`bg - l - ${i} `} points={[p1, p2]} color="#64748b" lineWidth={2} depthTest={false} />;
                                        })}
                                    </group>
                                ))}

                                {/* Drawn Sketch Elements */}
                                <group
                                    position={originTransform?.position}
                                    rotation={originTransform ? new THREE.Euler(...originTransform.rotation) : undefined}
                                    scale={originTransform ? new THREE.Vector3(...originTransform.scale) : undefined}
                                >
                                    {sketchLines.map((line, i) => {
                                        const isSel = selectedSketchElements.some(e => e.type === 'line' && e.index === i);

                                        // To constraint line endpoints, we assign them pseudo-point indices.
                                        // We'll define the start point as index `i * 2` and end point as `i * 2 + 1` for external selection tracking.
                                        const ptIndexStart = i * 2;
                                        const ptIndexEnd = i * 2 + 1;
                                        const isStartSel = selectedSketchElements.some(e => e.type === 'point' && e.index === ptIndexStart);
                                        const isEndSel = selectedSketchElements.some(e => e.type === 'point' && e.index === ptIndexEnd);

                                        return (
                                            <group key={`sl - ${i} `}>
                                                <Line
                                                    points={[line.start, line.end]}
                                                    color={isSel ? "#f97316" : "#38bdf8"}
                                                    lineWidth={isSel ? 5 : 3}
                                                    onClick={(e) => {
                                                        if (activeTool === 'select' || activeTool.startsWith('constrain_')) {
                                                            e.stopPropagation();
                                                            onSelectSketchElement?.('line', i, e.shiftKey);
                                                        } else if (activeTool === 'select_sweep_path') {
                                                            e.stopPropagation();
                                                            const p1 = line.start instanceof THREE.Vector3 ? line.start : new THREE.Vector3((line.start as any).x, (line.start as any).y, (line.start as any).z);
                                                            const p2 = line.end instanceof THREE.Vector3 ? line.end : new THREE.Vector3((line.end as any).x, (line.end as any).y, (line.end as any).z);
                                                            const vec = p2.clone().sub(p1).normalize();
                                                            onSelectSweepVector?.([vec.x, vec.y, vec.z]);
                                                        }
                                                    }}
                                                    onPointerOver={(e) => { if (activeTool === 'select' || activeTool.startsWith('constrain_') || activeTool === 'select_sweep_path') { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
                                                    onPointerOut={() => { if (activeTool === 'select' || activeTool.startsWith('constrain_')) document.body.style.cursor = 'default'; }}
                                                />
                                                <DynamicSketchPoint
                                                    position={line.start}
                                                    color="#ec4899"
                                                    isSel={isStartSel}
                                                    onClick={(e) => {
                                                        if (activeTool === 'select' || activeTool.startsWith('constrain_')) {
                                                            e.stopPropagation();
                                                            onSelectSketchElement?.('point', ptIndexStart, e.shiftKey);
                                                        }
                                                    }}
                                                    onPointerOver={(e) => { if (activeTool === 'select' || activeTool.startsWith('constrain_')) { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
                                                    onPointerOut={() => { if (activeTool === 'select' || activeTool.startsWith('constrain_')) document.body.style.cursor = 'default'; }}
                                                />
                                                <DynamicSketchPoint
                                                    position={line.end}
                                                    color="#ec4899"
                                                    isSel={isEndSel}
                                                    onClick={(e) => {
                                                        if (activeTool === 'select' || activeTool.startsWith('constrain_')) {
                                                            e.stopPropagation();
                                                            onSelectSketchElement?.('point', ptIndexEnd, e.shiftKey);
                                                        }
                                                    }}
                                                    onPointerOver={(e) => { if (activeTool === 'select' || activeTool.startsWith('constrain_')) { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
                                                    onPointerOut={() => { if (activeTool === 'select' || activeTool.startsWith('constrain_')) document.body.style.cursor = 'default'; }}
                                                />
                                            </group>
                                        );
                                    })}
                                    {/* We drop the explicitly drawn floating sketchPoints map for constraints right now, focusing entirely on lines and their bound vertices. */}

                                    {/* Dynamic Preview Line */}
                                    {activeTool === 'sketch_line' && activeLineStart && cursorPlanePosition && (
                                        <ZoomAwareGroup renderHud={(zoomScale) => {
                                            const rawPt = activeSnapPoint && trihedronGroupRef.current ? trihedronGroupRef.current.worldToLocal(activeSnapPoint.clone()) : cursorPlanePosition;

                                            // Provide realtime visual snap projection for constraints
                                            let previewPt = rawPt.clone();
                                            let realTimeLength = 0;
                                            let realTimeAngleDeg = 0;

                                            const rawVec = new THREE.Vector3().subVectors(rawPt, activeLineStart);
                                            const currentMag = rawVec.length();

                                            let localDx = rawVec.x; let localDy = rawVec.y;
                                            if (draftingPlane === 'xz') { localDx = rawVec.x; localDy = rawVec.z; }
                                            else if (draftingPlane === 'yz') { localDx = rawVec.y; localDy = rawVec.z; }
                                            let currentAngle = Math.atan2(localDy, localDx);

                                            // Provide negative angle wrapping for UX
                                            if (currentAngle < 0) currentAngle += 2 * Math.PI;

                                            const parsedLength = lockedLength !== null ? parseFloat(lockedLength) : NaN;
                                            const parsedAngle = lockedAngle !== null ? parseFloat(lockedAngle) : NaN;

                                            // If the user's input is empty/invalid, fall back to the frozen HUD position instead of snapping to the mouse
                                            const hudVec = hudFocusedPosition ? new THREE.Vector3().subVectors(hudFocusedPosition, activeLineStart) : null;
                                            const hudMag = hudVec ? hudVec.length() : currentMag;

                                            let hudAngle = hudVec ? Math.atan2(draftingPlane === 'xy' || !draftingPlane ? hudVec.y : (draftingPlane === 'xz' ? hudVec.z : hudVec.z),
                                                draftingPlane === 'xy' || !draftingPlane ? hudVec.x : (draftingPlane === 'xz' ? hudVec.x : hudVec.y)) : currentAngle;
                                            if (hudAngle < 0) hudAngle += 2 * Math.PI;

                                            const newMag = !isNaN(parsedLength) ? parsedLength : hudMag;
                                            const newAngleRad = !isNaN(parsedAngle) ? (parsedAngle * Math.PI) / 180 : hudAngle;

                                            realTimeLength = newMag;
                                            realTimeAngleDeg = (newAngleRad * 180) / Math.PI;

                                            const newLocalDx = newMag * Math.cos(newAngleRad);
                                            const newLocalDy = newMag * Math.sin(newAngleRad);
                                            if (draftingPlane === 'xy' || !draftingPlane) { previewPt = new THREE.Vector3(activeLineStart.x + newLocalDx, activeLineStart.y + newLocalDy, activeLineStart.z); }
                                            else if (draftingPlane === 'xz') { previewPt = new THREE.Vector3(activeLineStart.x + newLocalDx, activeLineStart.y, activeLineStart.z + newLocalDy); }
                                            else if (draftingPlane === 'yz') { previewPt = new THREE.Vector3(activeLineStart.x, activeLineStart.y + newLocalDx, activeLineStart.z + newLocalDy); }

                                            // Draw the 0-degree reference line
                                            const refLineEnd = activeLineStart.clone();
                                            const refLen = Math.max(10, currentMag * 0.5); // Extend out a bit
                                            if (draftingPlane === 'xy' || !draftingPlane) refLineEnd.x += refLen;
                                            else if (draftingPlane === 'xz') refLineEnd.x += refLen;
                                            else if (draftingPlane === 'yz') refLineEnd.y += refLen;

                                            const dynamicHudPosition = previewPt.clone().lerp(activeLineStart, 0.5);

                                            // Styling parameters
                                            const darkBg = '#191919';

                                            // Compute offset vector for distance dimension lines (perpendicular to line direction)
                                            const rawDir = new THREE.Vector3().subVectors(previewPt, activeLineStart);
                                            // Safe norm
                                            if (rawDir.lengthSq() > 0) rawDir.normalize();

                                            // Provide an offset distance (e.g., 20 pixels visually)
                                            const offsetDist = 30 / zoomScale;

                                            // Create a perpendicular in the XY plane by default
                                            // Z-plane needs different perp depending on draftingPlane.
                                            let perpVec = new THREE.Vector3(-rawDir.y, rawDir.x, 0).normalize().multiplyScalar(offsetDist);
                                            if (draftingPlane === 'xz') perpVec = new THREE.Vector3(-rawDir.z, 0, rawDir.x).normalize().multiplyScalar(offsetDist);
                                            else if (draftingPlane === 'yz') perpVec = new THREE.Vector3(0, -rawDir.z, rawDir.y).normalize().multiplyScalar(offsetDist);

                                            // Determine dimension anchor points based on offset
                                            const dimStart = activeLineStart.clone().add(perpVec);
                                            const dimEnd = previewPt.clone().add(perpVec);
                                            let dimMid = dimStart.clone().lerp(dimEnd, 0.5);

                                            // If the segment is too short visually, push the dimension text outside the extension lines
                                            if (newMag * zoomScale < 60) {
                                                dimMid = dimEnd.clone().add(rawDir.clone().multiplyScalar(40 / zoomScale));
                                            }

                                            // Extension lines
                                            const ext1Start = activeLineStart.clone().add(perpVec.clone().multiplyScalar(0.2));
                                            const ext1End = activeLineStart.clone().add(perpVec.clone().multiplyScalar(1.2));
                                            const ext2Start = previewPt.clone().add(perpVec.clone().multiplyScalar(0.2));
                                            const ext2End = previewPt.clone().add(perpVec.clone().multiplyScalar(1.2));

                                            // Angle dimension anchor
                                            // Make the visual radius dynamically shrink if the segment is small, but bound it in pixel space
                                            const visualArcRadius = Math.max(25, newMag * zoomScale * 0.4);
                                            const arcRadius = visualArcRadius / zoomScale;
                                            // Set the text anchor slightly outside the arc so it doesn't overlap the line geometry
                                            const angleAnchorDist = (visualArcRadius + 20) / zoomScale;
                                            // Quick arc midpoint approximation (halfway between reference ray and current ray, at arcRadius distance)
                                            const midAngleRad = currentAngle / 2;
                                            const angleAnchorLocalDx = angleAnchorDist * Math.cos(midAngleRad);
                                            const angleAnchorLocalDy = angleAnchorDist * Math.sin(midAngleRad);
                                            const angleAnchor = activeLineStart.clone();
                                            if (draftingPlane === 'xy' || !draftingPlane) { angleAnchor.add(new THREE.Vector3(angleAnchorLocalDx, angleAnchorLocalDy, 0)); }
                                            else if (draftingPlane === 'xz') { angleAnchor.add(new THREE.Vector3(angleAnchorLocalDx, 0, angleAnchorLocalDy)); }
                                            else if (draftingPlane === 'yz') { angleAnchor.add(new THREE.Vector3(0, angleAnchorLocalDx, angleAnchorLocalDy)); }

                                            // Draw arc points conceptually
                                            const arcPoints = [];
                                            const arcSegments = 16;
                                            for (let i = 0; i <= arcSegments; i++) {
                                                const a = (i / arcSegments) * currentAngle;
                                                const lx = arcRadius * Math.cos(a);
                                                const ly = arcRadius * Math.sin(a);
                                                if (draftingPlane === 'xy' || !draftingPlane) arcPoints.push(new THREE.Vector3(activeLineStart.x + lx, activeLineStart.y + ly, activeLineStart.z));
                                                else if (draftingPlane === 'xz') arcPoints.push(new THREE.Vector3(activeLineStart.x + lx, activeLineStart.y, activeLineStart.z + ly));
                                                else if (draftingPlane === 'yz') arcPoints.push(new THREE.Vector3(activeLineStart.x, activeLineStart.y + lx, activeLineStart.z + ly));
                                            }

                                            return (
                                                <group>
                                                    <Line points={[activeLineStart, previewPt]} color="#ffffff" lineWidth={2} dashed={lockedLength === null} />

                                                    {/* Visualize Angle Reference Line */}
                                                    <Line points={[activeLineStart, refLineEnd]} color="#ffffff" lineWidth={1} dashed dashSize={1} dashScale={5} />

                                                    {/* CAD Dimension Graphics */}
                                                    {/* Distance */}
                                                    <Line points={[dimStart, dimEnd]} color="#8294a6" lineWidth={1} />
                                                    <Line points={[ext1Start, ext1End]} color="#8294a6" lineWidth={1} />
                                                    <Line points={[ext2Start, ext2End]} color="#8294a6" lineWidth={1} />

                                                    {/* Angle Arc */}
                                                    {arcPoints.length > 0 && <Line points={arcPoints} color="#8294a6" lineWidth={1} />}

                                                    {/* Dimension Overlays */}
                                                    <Html position={dimMid} center zIndexRange={[100, 0]}>
                                                        <div style={{
                                                            background: darkBg, border: '1px solid #3b82f6', borderRadius: '4px', padding: '4px 8px',
                                                            display: 'flex', alignItems: 'center', pointerEvents: 'auto', gap: '6px'
                                                        }}>
                                                            <div style={{
                                                                background: document.activeElement === lengthInputRef.current ? '#2563eb' : 'transparent',
                                                                padding: '1px 4px', borderRadius: '2px', display: 'flex'
                                                            }}>
                                                                <input
                                                                    ref={lengthInputRef}
                                                                    type="text"
                                                                    style={{
                                                                        width: `${Math.max(4, realTimeLength.toFixed(2).length)} ch`, background: 'transparent', color: '#fff',
                                                                        border: 'none', outline: 'none', textAlign: 'center', fontSize: '14px', fontFamily: 'sans-serif'
                                                                    }}
                                                                    value={lockedLength !== null ? lockedLength : realTimeLength.toFixed(2)}
                                                                    onFocus={() => {
                                                                        if (hudFocusedPosition === null) setHudFocusedPosition(dynamicHudPosition);
                                                                        if (lockedLength === null) setLockedLength(realTimeLength.toFixed(2).toString());
                                                                    }}
                                                                    onBlur={() => {
                                                                        setTimeout(() => { if (document.activeElement !== lengthInputRef.current && document.activeElement !== angleInputRef.current) setHudFocusedPosition(null); }, 10);
                                                                    }}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        if (val === '') setLockedLength('');
                                                                        else setLockedLength(val);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        e.stopPropagation();
                                                                        if (e.key === 'Tab') { e.preventDefault(); angleInputRef.current?.focus(); }
                                                                        if (e.key === 'Enter') handleSketchClick(previewPt);
                                                                    }}
                                                                />
                                                            </div>
                                                            <span style={{ color: '#eee', fontSize: '14px', fontFamily: 'sans-serif' }}>mm</span>
                                                        </div>
                                                    </Html>

                                                    <Html position={angleAnchor} center zIndexRange={[100, 0]}>
                                                        <div style={{
                                                            background: darkBg, border: '1px solid #3b82f6', borderRadius: '4px', padding: '4px 8px',
                                                            display: 'flex', alignItems: 'center', pointerEvents: 'auto'
                                                        }}>
                                                            <div style={{
                                                                background: document.activeElement === angleInputRef.current ? '#2563eb' : 'transparent',
                                                                padding: '1px 4px', borderRadius: '2px', display: 'flex'
                                                            }}>
                                                                <input
                                                                    ref={angleInputRef}
                                                                    type="text"
                                                                    style={{
                                                                        width: `${Math.max(4, realTimeAngleDeg.toFixed(2).length)} ch`, background: 'transparent', color: '#fff',
                                                                        border: 'none', outline: 'none', textAlign: 'center', fontSize: '14px', fontFamily: 'sans-serif',
                                                                    }}
                                                                    value={lockedAngle !== null ? lockedAngle : realTimeAngleDeg.toFixed(2)}
                                                                    onFocus={() => {
                                                                        if (hudFocusedPosition === null) setHudFocusedPosition(dynamicHudPosition);
                                                                        if (lockedAngle === null) setLockedAngle(realTimeAngleDeg.toFixed(2).toString());
                                                                    }}
                                                                    onBlur={() => {
                                                                        setTimeout(() => { if (document.activeElement !== lengthInputRef.current && document.activeElement !== angleInputRef.current) setHudFocusedPosition(null); }, 10);
                                                                    }}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        if (val === '') setLockedAngle('');
                                                                        else setLockedAngle(val);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        e.stopPropagation();
                                                                        if (e.key === 'Tab') { e.preventDefault(); lengthInputRef.current?.focus(); }
                                                                        if (e.key === 'Enter') handleSketchClick(previewPt);
                                                                    }}
                                                                />
                                                            </div>
                                                            <span style={{ color: '#eee', fontSize: '14px', fontFamily: 'sans-serif', marginLeft: '2px' }}>°</span>
                                                        </div>
                                                    </Html>
                                                </group>
                                            );
                                        }} />
                                    )}

                                    {/* Display Locked Dimension Visuals for completed segments */}
                                </group>
                                {activeTool === 'measure' && measurePoints.length > 0 && (
                                    <group>
                                        {measurePoints.map((pt, i) => (
                                            <mesh key={`mp - ${i} `} position={pt} renderOrder={5}>
                                                <sphereGeometry args={[1.0, 16, 16]} />
                                                <meshBasicMaterial color="#a855f7" depthTest={false} />
                                            </mesh>
                                        ))}
                                        {measurePoints.length === 2 && (
                                            <>
                                                <Line
                                                    points={[measurePoints[0], measurePoints[1]]}
                                                    color="#a855f7"
                                                    lineWidth={3}
                                                    depthTest={false}
                                                    renderOrder={4}
                                                />
                                                <Html position={measurePoints[0].clone().lerp(measurePoints[1], 0.5)} center zIndexRange={[100, 0]}>
                                                    <div style={{
                                                        background: 'rgba(15, 23, 42, 0.8)',
                                                        color: '#e2e8f0',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #475569',
                                                        fontFamily: 'monospace',
                                                        fontSize: '14px',
                                                        pointerEvents: 'none',
                                                        whiteSpace: 'nowrap',
                                                        transform: 'translateY(-15px)'
                                                    }}>
                                                        {measurePoints[0].distanceTo(measurePoints[1]).toFixed(3)} mm
                                                    </div>
                                                </Html>
                                            </>
                                        )}
                                        {measurePoints.length === 1 && activeSnapPoint && (
                                            <Line
                                                points={[measurePoints[0], activeSnapPoint]}
                                                color="#a855f7"
                                                dashed
                                                dashSize={2}
                                                dashScale={5}
                                                dashOffset={0}
                                                opacity={0.5}
                                                transparent
                                                lineWidth={2}
                                                depthTest={false}
                                            />
                                        )}
                                    </group>
                                )}

                                <SnapSystem snapPoints={combinedSnapPoints} onActiveSnapChange={setActiveSnapPoint} isActive={activeTool === 'measure' || activeTool === 'sketch_point' || activeTool === 'sketch_line' || activeTool.startsWith('transform')} />

                                {extrusionDebug && (
                                    <Html position={new THREE.Vector3(0, 0, 0)} center zIndexRange={[100, 0]}>
                                        <div style={{
                                            background: 'rgba(220, 38, 38, 0.9)',
                                            color: '#ffffff',
                                            padding: '12px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #7f1d1d',
                                            fontFamily: 'monospace',
                                            fontSize: '14px',
                                            whiteSpace: 'pre',
                                            transform: 'translateY(-50px)'
                                        }}>
                                            {extrusionDebug}
                                        </div>
                                    </Html>
                                )}

                                {/* Applied Constraints Annotations */}
                                {constraints.map((c, idx) => (
                                    <ConstraintAnnotation
                                        key={`c - ${idx} `}
                                        c={c}
                                        idx={idx}
                                        sketchLines={sketchLines}
                                        draftingPlane={draftingPlane}
                                        onUpdateConstraint={onUpdateConstraint}
                                    />
                                ))}

                                {/* Camera Aligner */}
                                {activeTool === 'select_sweep_path' && (
                                    <group renderOrder={3}>
                                        {sweepDraggerObj && (
                                            <TransformControls
                                                mode="rotate"
                                                object={sweepDraggerObj}
                                                onMouseUp={() => {
                                                    if (sweepDraggerObj) {
                                                        // Extract the forward vector (Z-axis) of the arrow
                                                        const draggerForward = new THREE.Vector3(0, 0, 1).applyEuler(sweepDraggerObj.rotation).normalize();
                                                        onSelectSweepVector?.([draggerForward.x, draggerForward.y, draggerForward.z], true);
                                                    }
                                                }}
                                            />
                                        )}
                                        <group ref={setSweepDraggerObj} position={sweepDraggerOrigin}>
                                            <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 40, 0xf59e0b, 10, 5]} />
                                            <mesh onClick={(e) => {
                                                e.stopPropagation();
                                                if (sweepDraggerObj) {
                                                    const draggerForward = new THREE.Vector3(0, 0, 1).applyEuler(sweepDraggerObj.rotation).normalize();
                                                    onSelectSweepVector?.([draggerForward.x, draggerForward.y, draggerForward.z]);
                                                }
                                            }}>
                                                <sphereGeometry args={[3, 16, 16]} />
                                                <meshBasicMaterial color="#f59e0b" transparent opacity={0.5} />
                                            </mesh>
                                        </group>
                                    </group>
                                )}
                                <CameraAligner draftingPlane={draftingPlane} isoViewTrigger={isoViewTrigger} />
                            </group>
                        </group>
                    )
                }
            </Canvas >

            {/* Floating Transform Overlay */}
            {(activeTool.startsWith('transform') || (activeTool === 'select' && shapeType === 'sketch')) && originTransform && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    color: 'white',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '24px',
                    pointerEvents: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                }}>
                    {/* Left Column: Selection Transform */}
                    <div style={{ width: '220px' }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '0.7rem', color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>Object Transform</h3>

                        {/* Position */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Pos X</label>
                                <input type="number" step="1" value={parseFloat((originTransform.position?.[0] ?? 0).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, position: [parseFloat(e.target.value) || 0, originTransform.position[1], originTransform.position[2]] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Pos Y</label>
                                <input type="number" step="1" value={parseFloat((originTransform.position?.[1] ?? 0).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, position: [originTransform.position[0], parseFloat(e.target.value) || 0, originTransform.position[2]] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Pos Z</label>
                                <input type="number" step="1" value={parseFloat((originTransform.position?.[2] ?? 0).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, position: [originTransform.position[0], originTransform.position[1], parseFloat(e.target.value) || 0] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                        </div>

                        {/* Rotation */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Rot X</label>
                                <input type="number" step="5" value={parseFloat((originTransform.rotation[0] * 180 / Math.PI).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, rotation: [(parseFloat(e.target.value) || 0) * Math.PI / 180, originTransform.rotation[1], originTransform.rotation[2]] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Rot Y</label>
                                <input type="number" step="5" value={parseFloat((originTransform.rotation[1] * 180 / Math.PI).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, rotation: [originTransform.rotation[0], (parseFloat(e.target.value) || 0) * Math.PI / 180, originTransform.rotation[2]] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Rot Z</label>
                                <input type="number" step="5" value={parseFloat((originTransform.rotation[2] * 180 / Math.PI).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, rotation: [originTransform.rotation[0], originTransform.rotation[1], (parseFloat(e.target.value) || 0) * Math.PI / 180] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                        </div>

                        {/* Scale */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Scl X</label>
                                <input type="number" step="0.1" value={parseFloat((originTransform.scale?.[0] ?? 1).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, scale: [parseFloat(e.target.value) || 0, originTransform.scale[1], originTransform.scale[2]] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Scl Y</label>
                                <input type="number" step="0.1" value={parseFloat((originTransform.scale?.[1] ?? 1).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, scale: [originTransform.scale[0], parseFloat(e.target.value) || 0, originTransform.scale[2]] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Scl Z</label>
                                <input type="number" step="0.1" value={parseFloat((originTransform.scale?.[2] ?? 1).toFixed(2))} onChange={(e) => onOriginTransformChange?.({ ...originTransform, scale: [originTransform.scale[0], originTransform.scale[1], parseFloat(e.target.value) || 0] })} style={{ width: '100%', padding: '2px 4px', fontSize: '0.75rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '3px' }} />
                            </div>
                        </div>
                    </div>

                    {/* Vertical Divider */}
                    <div style={{ width: '1px', background: '#334155', alignSelf: 'stretch' }}></div>

                    {/* Right Column: Gizmo Matrix Offset */}
                    <div style={{ width: '220px' }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #334155', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Gizmo Offset
                            <button style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#60a5fa', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                                onClick={() => { setGizmoPivotOffset(new THREE.Vector3(0, 0, 0)); setGizmoPivotRotationOffset(new THREE.Euler(0, 0, 0)); }}>Reset</button>
                        </h3>

                        {/* Gizmo Offset Position */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.55rem', color: '#f87171' }}>Pos X</label>
                                <input type="number" step="1" value={parseFloat(gizmoPivotOffset.x.toFixed(2))} onChange={(e) => setGizmoPivotOffset(new THREE.Vector3(parseFloat(e.target.value) || 0, gizmoPivotOffset.y, gizmoPivotOffset.z))} style={{ width: '100%', padding: '2px 4px', fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.55rem', color: '#4ade80' }}>Pos Y</label>
                                <input type="number" step="1" value={parseFloat(gizmoPivotOffset.y.toFixed(2))} onChange={(e) => setGizmoPivotOffset(new THREE.Vector3(gizmoPivotOffset.x, parseFloat(e.target.value) || 0, gizmoPivotOffset.z))} style={{ width: '100%', padding: '2px 4px', fontSize: '0.7rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.55rem', color: '#60a5fa' }}>Pos Z</label>
                                <input type="number" step="1" value={parseFloat(gizmoPivotOffset.z.toFixed(2))} onChange={(e) => setGizmoPivotOffset(new THREE.Vector3(gizmoPivotOffset.x, gizmoPivotOffset.y, parseFloat(e.target.value) || 0))} style={{ width: '100%', padding: '2px 4px', fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', borderRadius: '3px' }} />
                            </div>
                        </div>

                        {/* Gizmo Offset Rotation */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.55rem', color: '#f87171' }}>Rot X (°)</label>
                                <input type="number" step="5" value={parseFloat((gizmoPivotRotationOffset.x * 180 / Math.PI).toFixed(2))} onChange={(e) => setGizmoPivotRotationOffset(new THREE.Euler((parseFloat(e.target.value) || 0) * Math.PI / 180, gizmoPivotRotationOffset.y, gizmoPivotRotationOffset.z))} style={{ width: '100%', padding: '2px 4px', fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.55rem', color: '#4ade80' }}>Rot Y (°)</label>
                                <input type="number" step="5" value={parseFloat((gizmoPivotRotationOffset.y * 180 / Math.PI).toFixed(2))} onChange={(e) => setGizmoPivotRotationOffset(new THREE.Euler(gizmoPivotRotationOffset.x, (parseFloat(e.target.value) || 0) * Math.PI / 180, gizmoPivotRotationOffset.z))} style={{ width: '100%', padding: '2px 4px', fontSize: '0.7rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', borderRadius: '3px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '0.55rem', color: '#60a5fa' }}>Rot Z (°)</label>
                                <input type="number" step="5" value={parseFloat((gizmoPivotRotationOffset.z * 180 / Math.PI).toFixed(2))} onChange={(e) => setGizmoPivotRotationOffset(new THREE.Euler(gizmoPivotRotationOffset.x, gizmoPivotRotationOffset.y, (parseFloat(e.target.value) || 0) * Math.PI / 180))} style={{ width: '100%', padding: '2px 4px', fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', borderRadius: '3px' }} />
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
});

export default CadViewer;

function SnapSystem({ snapPoints, onActiveSnapChange, isActive = true }: { snapPoints: THREE.Vector3[], onActiveSnapChange?: (p: THREE.Vector3 | null) => void, isActive?: boolean }) {
    const { camera, pointer } = useThree();
    const indicatorRef = useRef<THREE.Mesh>(null);
    const lastActiveRef = useRef<THREE.Vector3 | null>(null);

    useFrame(() => {
        if (!indicatorRef.current || !isActive) {
            if (indicatorRef.current) indicatorRef.current.visible = false;
            if (lastActiveRef.current !== null) {
                lastActiveRef.current = null;
                onActiveSnapChange?.(null);
            }
            return;
        }

        if (!snapPoints || snapPoints.length === 0) {
            indicatorRef.current.visible = false;
            if (lastActiveRef.current !== null) {
                lastActiveRef.current = null;
                onActiveSnapChange?.(null);
            }
            return;
        }

        let closest = null;
        let minDistSq = 0.0008;

        const tempV = new THREE.Vector3();
        for (let i = 0; i < snapPoints.length; i++) {
            tempV.copy(snapPoints[i]);
            tempV.project(camera);

            if (tempV.z > 1.0 || tempV.z < -1.0) continue;

            const dx = tempV.x - pointer.x;
            const dy = tempV.y - pointer.y;

            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closest = snapPoints[i];
            }
        }

        if (closest) {
            indicatorRef.current.visible = true;
            indicatorRef.current.position.copy(closest);
            if ((camera as THREE.OrthographicCamera).zoom) {
                const s = 25 / (camera as THREE.OrthographicCamera).zoom;
                indicatorRef.current.scale.set(s, s, s);
            }
            if (lastActiveRef.current !== closest) {
                lastActiveRef.current = closest;
                onActiveSnapChange?.(closest);
            }
        } else {
            indicatorRef.current.visible = false;
            if (lastActiveRef.current !== null) {
                lastActiveRef.current = null;
                onActiveSnapChange?.(null);
            }
        }
    });

    return (
        <mesh ref={indicatorRef} visible={false} renderOrder={4}>
            <sphereGeometry args={[0.75, 16, 16]} />
            <meshBasicMaterial color="#f87171" depthTest={false} transparent opacity={0.9} />
        </mesh>
    );
}

function CameraAligner({ draftingPlane, isoViewTrigger }: { draftingPlane: 'xy' | 'xz' | 'yz' | null, isoViewTrigger?: number }) {
    const { camera, controls } = useThree();

    useEffect(() => {
        if (!(camera instanceof THREE.OrthographicCamera)) return;

        if (isoViewTrigger && isoViewTrigger > 0) {
            // Isometric view
            const dist = 100;
            camera.position.set(dist, dist, dist);
            camera.up.set(0, 0, 1);
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();

            if (controls) {
                (controls as any).target.set(0, 0, 0);
                (controls as any).update();
            }
            return;
        }

        if (!draftingPlane) return;

        // Automatically position the camera to look at the center from the primary axis normal
        const dist = 100;
        if (draftingPlane === 'xy') {
            camera.position.set(0, 0, dist);
            camera.up.set(0, 1, 0);
        } else if (draftingPlane === 'xz') {
            camera.position.set(0, dist, 0);
            camera.up.set(0, 0, -1);
        } else if (draftingPlane === 'yz') {
            camera.position.set(dist, 0, 0);
            camera.up.set(0, 1, 0);
        }

        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        if (controls) {
            (controls as any).target.set(0, 0, 0);
            (controls as any).update();
        }

    }, [draftingPlane, camera, controls]);

    return null;
}
