import { useContext } from 'react';
import { SnapContext } from '../context/SnapContextDef';

export const useSnapSystem = () => {
    const context = useContext(SnapContext);
    if (!context) {
        throw new Error("useSnapSystem must be used within a SnapSystemProvider");
    }
    return context;
};
