import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';

export type PlaneId = 'xy' | 'xz' | 'yz';

interface LCSPlaneProps {
    visible?: boolean;
    scale?: number;
    position?: [number, number, number];
    rotation?: [number, number, number];
    onPointerOver?: (e: any) => void;
    onPointerOut?: (e: any) => void;
    onClick?: (e: any) => void;
    onPlaneClick?: (plane: PlaneId, e: any) => void;
    onPlanePointerMove?: (plane: PlaneId, e: any) => void;
    onPlanePointerOver?: (plane: PlaneId, e: any) => void;
    onPlanePointerOut?: (plane: PlaneId, e: any) => void;
    activePlane?: PlaneId | null; // if set, maybe we hide the other planes? (optional)
}

export default function LCSPlane({
    visible = true,
    scale = 10,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    onPointerOver,
    onPointerOut,
    onClick,
    onPlaneClick,
    onPlanePointerMove,
    onPlanePointerOver,
    onPlanePointerOut,
    activePlane
}: LCSPlaneProps) {
    const groupRef = useRef<THREE.Group>(null);
    const { camera } = useThree();

    // Constant screen size scaling
    useFrame(() => {
        if (!groupRef.current || !visible) return;

        // If orthographic camera, scale by zoom
        if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
            const orthoCam = camera as THREE.OrthographicCamera;
            const s = (scale * 2.5) / orthoCam.zoom;
            groupRef.current.scale.set(s, s, s);
        } else {
            // Perspective camera logic (distance based)
            const dist = camera.position.distanceTo(groupRef.current.position);
            const s = (dist * scale) / 500;
            groupRef.current.scale.set(s, s, s);
        }
    });

    if (!visible) return null;

    // Design parameters based on user sketch: 
    // "important details... separation of the objects (gaps between planes, points, and vector handles)"
    const gap = 0.5;
    const originRadius = 0.4;

    // Axis parameters
    const axisLength = 4.0;
    const cylinderRadius = 0.25; // thicker
    const coneHeight = 1.2;
    const coneRadius = 0.55; // thicker

    // Plane parameters
    const planeSize = 3.0;

    // Calculate start positions to enforce the 'gap' from the origin
    const axisStartDist = originRadius + gap;
    const planeStartDist = axisStartDist;

    // Helper functions for the axes (Cylinder + Cone)
    const renderAxis = (color: string, eulerRot: [number, number, number]) => {
        // We build the axis pointing up (+Y) and then rotate the whole group
        return (
            <group rotation={eulerRot}>
                {/* Cylinder segment */}
                <mesh position={[0, axisStartDist + axisLength / 2, 0]}>
                    <cylinderGeometry args={[cylinderRadius, cylinderRadius, axisLength, 16]} />
                    <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
                </mesh>
                {/* Arrowhead */}
                <mesh position={[0, axisStartDist + axisLength + coneHeight / 2, 0]}>
                    <coneGeometry args={[coneRadius, coneHeight, 16]} />
                    <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
                </mesh>
            </group>
        );
    };

    // Helper function for the Planes
    const renderPlane = (id: PlaneId, color: string, eulerRot: [number, number, number], offsetPos: [number, number, number], label: string) => {
        if (activePlane && activePlane !== id) return null; // hide inactive planes if one is selected
        return (
            <group rotation={eulerRot}>
                <mesh
                    position={offsetPos}
                    onClick={(e) => { e.stopPropagation(); onPlaneClick?.(id, e); onClick?.(e); }}
                    onPointerMove={(e) => onPlanePointerMove?.(id, e)}
                    onPointerOver={(e) => { e.stopPropagation(); onPlanePointerOver?.(id, e); onPointerOver?.(e); }}
                    onPointerOut={(e) => { onPlanePointerOut?.(id, e); onPointerOut?.(e); }}
                >
                    <planeGeometry args={[planeSize, planeSize]} />
                    <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.4} side={THREE.DoubleSide} />
                </mesh>
                {/* Wireframe outline for visibility as drawn in sketch */}
                <lineSegments position={offsetPos}>
                    <edgesGeometry args={[new THREE.PlaneGeometry(planeSize, planeSize)]} />
                    <lineBasicMaterial color={color} transparent opacity={0.8} depthTest={false} />
                </lineSegments>
                {/* XY / XZ / YZ Labels (Front) */}
                <Text
                    position={[offsetPos[0] + planeSize / 2 - 0.7, offsetPos[1] + planeSize / 2 - 0.7, offsetPos[2]]}
                    fontSize={1.0}
                    color={color}
                    material-depthTest={false}
                    renderOrder={1000}
                >
                    {label}
                </Text>
                {/* XY / XZ / YZ Labels (Back) */}
                <Text
                    position={[offsetPos[0] + planeSize / 2 - 0.7, offsetPos[1] + planeSize / 2 - 0.7, offsetPos[2]]}
                    rotation={[0, Math.PI, 0]}
                    fontSize={1.0}
                    color={color}
                    material-depthTest={false}
                    renderOrder={1000}
                >
                    {label}
                </Text>
            </group>
        );
    };

    return (
        <group
            ref={groupRef}
            position={position}
            rotation={new THREE.Euler(...rotation)}
            renderOrder={999} // Render on top of scene geometry
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
            onClick={onClick}
        >
            {/* 1. Origin Point (A rounded styled point, not a perfect sphere if you prefer, but standard sphere is clean) */}
            <mesh>
                <sphereGeometry args={[originRadius, 16, 16]} />
                <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.9} />
            </mesh>

            {/* Outline the origin point for clarity against light backgrounds */}
            <mesh>
                <sphereGeometry args={[originRadius * 1.1, 16, 16]} />
                <meshBasicMaterial color="#1e293b" depthTest={false} transparent opacity={0.5} side={THREE.BackSide} />
            </mesh>

            {/* 2. Vector Handles with explicit gaps */}
            {/* X-Axis (Red) -> rotate -90 on Z to point along +X */}
            {renderAxis("#ef4444", [0, 0, -Math.PI / 2])}

            {/* Y-Axis (Green) -> points along +Y natively */}
            {renderAxis("#22c55e", [0, 0, 0])}

            {/* Z-Axis (Blue) -> rotate 90 on X to point along +Z */}
            {renderAxis("#3b82f6", [Math.PI / 2, 0, 0])}


            {/* 3. 3D Construct Planes with explicit gaps from axes lines */}
            {/* XY Plane (Blue-ish) */}
            {renderPlane('xy', "#3b82f6", [0, 0, 0], [planeStartDist + planeSize / 2, planeStartDist + planeSize / 2, 0], "XY")}

            {/* XZ Plane (Green-ish) -> Rotate around X by 90 to lie flat */}
            {renderPlane('xz', "#22c55e", [Math.PI / 2, 0, 0], [planeStartDist + planeSize / 2, planeStartDist + planeSize / 2, 0], "XZ")}

            {/* YZ Plane (Red-ish) -> Rotate around Y by -90 to lie vertically */}
            {renderPlane('yz', "#ef4444", [0, -Math.PI / 2, 0], [planeStartDist + planeSize / 2, planeStartDist + planeSize / 2, 0], "YZ")}

        </group>
    );
}
