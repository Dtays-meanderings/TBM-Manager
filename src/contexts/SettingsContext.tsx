import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppSettings = {
    gizmoScale: number;
    lcsSize: number;
    gridSize: number;
    backgroundColor: string;
    ambientLightIntensity: number;
    directionalLightIntensity: number;
};

export const defaultSettings: AppSettings = {
    gizmoScale: 1.0,  // Scale multiplier, or fixed pixel size for the gizmo dragger
    lcsSize: 10,      // Scale multiplier for the LCS planes
    gridSize: 200,    // Defines the `<Grid>` extents in both axes
    backgroundColor: '#020617', // Canvas background CSS
    ambientLightIntensity: 0.6,
    directionalLightIntensity: 1.2
};

type SettingsContextType = {
    settings: AppSettings;
    updateSettings: (newSettings: Partial<AppSettings>) => void;
};

const SettingsContext = createContext<SettingsContextType>({
    settings: defaultSettings,
    updateSettings: () => { }
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('get-settings').then((storedSettings: Partial<AppSettings> | null) => {
                if (storedSettings && Object.keys(storedSettings).length > 0) {
                    setSettings(prev => ({ ...prev, ...storedSettings }));
                }
                setLoaded(true);
            }).catch((err: any) => {
                console.error("Failed to load settings:", err);
                setLoaded(true);
            });
        } else {
            console.warn("IPC unavailable (likely web environment). Using default browser settings.");
            setLoaded(true);
        }
    }, []);

    const updateSettings = (partial: Partial<AppSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...partial };
            if (window.ipcRenderer) {
                window.ipcRenderer.invoke('save-settings', next).catch((e: any) => console.error(e));
            }
            return next;
        });
    };

    // Defer mounting until we have hydrated from disk to avoid a blinding white flash.
    if (!loaded) return null;

    return (
        <SettingsContext.Provider value={{ settings, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};
