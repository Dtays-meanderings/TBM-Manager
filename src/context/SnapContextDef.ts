import { createContext } from 'react';
import * as THREE from 'three';

export interface SnapContextProps {
    // Methods to provide points to the system
    registerSnapPoints: (id: string, points: THREE.Vector3[]) => void;
    unregisterSnapPoints: (id: string) => void;

    // Global State access
    globalSnapPoints: THREE.Vector3[];
    getActiveSnapPoint: () => THREE.Vector3 | null;
    setActiveSnapPointRef: (pt: THREE.Vector3 | null) => void;

    // Raycaster enabling
    isSnapActive: boolean;
    setSnapActive: (active: boolean) => void;
}

export const SnapContext = createContext<SnapContextProps | undefined>(undefined);
