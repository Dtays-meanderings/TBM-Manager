import React, { useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

import { SnapContext } from './SnapContextDef';
import { useSnapSystem } from '../hooks/useSnapSystem';

export const SnapSystemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [snapPointSets, setSnapPointSets] = useState<Map<string, THREE.Vector3[]>>(new Map());
    const activeSnapPointRef = useRef<THREE.Vector3 | null>(null);
    const [isSnapActive, setSnapActive] = useState<boolean>(true);

    const registerSnapPoints = useCallback((id: string, points: THREE.Vector3[]) => {
        setSnapPointSets(prev => {
            const next = new Map(prev);
            next.set(id, points);
            return next;
        });
    }, []);

    const unregisterSnapPoints = useCallback((id: string) => {
        setSnapPointSets(prev => {
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    }, []);

    // Flatten all registered sets into one array
    const globalSnapPoints = useMemo(() => Array.from(snapPointSets.values()).flat(), [snapPointSets]);

    const getActiveSnapPoint = useCallback(() => activeSnapPointRef.current, []);
    const setActiveSnapPointRef = useCallback((pt: THREE.Vector3 | null) => {
        activeSnapPointRef.current = pt;
    }, []);

    const contextValue = useMemo(() => ({
        registerSnapPoints,
        unregisterSnapPoints,
        globalSnapPoints,
        getActiveSnapPoint,
        setActiveSnapPointRef,
        isSnapActive,
        setSnapActive
    }), [registerSnapPoints, unregisterSnapPoints, globalSnapPoints, getActiveSnapPoint, setActiveSnapPointRef, isSnapActive]);

    return (
        <SnapContext.Provider value={contextValue}>
            {children}
        </SnapContext.Provider>
    );
};

const resolveClosestSnapPoint = (
    raycaster: THREE.Raycaster,
    camera: THREE.Camera,
    globalSnapPoints: THREE.Vector3[],
    toleranceUnits: number
): THREE.Vector3 | null => {
    let closest: THREE.Vector3 | null = null;
    let minDistSq = toleranceUnits * toleranceUnits;
    let closestZ = Infinity;

    for (let i = 0; i < globalSnapPoints.length; i++) {
        const pt = globalSnapPoints[i];
        const distSq = raycaster.ray.distanceSqToPoint(pt);

        if (distSq < minDistSq - 1e-6 || (Math.abs(distSq - minDistSq) <= 1e-6 && pt.distanceTo(camera.position) < closestZ)) {
            minDistSq = distSq;
            closest = pt;
            closestZ = pt.distanceTo(camera.position);
        }
    }
    return closest;
};

// Renders the Hover indicator and runs the Raycaster every frame over the globalSnapPoints
export const GlobalSnapIndicator: React.FC = () => {
    const { globalSnapPoints, isSnapActive, setActiveSnapPointRef } = useSnapSystem();
    const { camera, pointer } = useThree();
    const indicatorRef = useRef<THREE.Mesh>(null);
    const lastActiveRef = useRef<THREE.Vector3 | null>(null);

    useFrame(() => {
        if (!indicatorRef.current) return;

        if (!isSnapActive || !globalSnapPoints || globalSnapPoints.length === 0) {
            indicatorRef.current.visible = false;
            // Write directly to the provider's ref for sync access
            if (lastActiveRef.current !== null) {
                lastActiveRef.current = null;
                setActiveSnapPointRef(null);
            }
            return;
        }

        const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
        const toleranceUnits = 125.0 / zoom;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);

        const closest = resolveClosestSnapPoint(raycaster, camera, globalSnapPoints, toleranceUnits);

        // Diagnostics!
        if (lastActiveRef.current === null && globalSnapPoints.length > 0) {
            console.log(`[SnapDebug] Snapping checks running. Closest=${closest !== null}, Active=${isSnapActive}, Pts=${globalSnapPoints.length}, ptr=[${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)}]`);
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
                setActiveSnapPointRef(closest);
            }
        } else {
            indicatorRef.current.visible = false;
            if (lastActiveRef.current !== null) {
                lastActiveRef.current = null;
                setActiveSnapPointRef(null);
            }
        }
    });

    return (
        <mesh ref={indicatorRef} visible={false} renderOrder={9999} raycast={() => null}>
            <sphereGeometry args={[1.5, 16, 16]} />
            <meshBasicMaterial color="#f87171" depthTest={false} depthWrite={false} transparent opacity={0.9} />
        </mesh>
    );
};
