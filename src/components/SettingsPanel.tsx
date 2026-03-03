import { useSettings } from '../contexts/SettingsContext';
import { Settings as SettingsIcon, Maximize, Sun } from 'lucide-react';

export default function SettingsPanel() {
    const { settings, updateSettings } = useSettings();

    return (
        <div className="settings-panel" style={{ padding: '2rem', color: '#e2e8f0', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
                <SettingsIcon size={28} style={{ marginRight: '1rem', color: '#38bdf8' }} />
                <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 300 }}>Application Settings</h1>
            </div>

            <div className="settings-section" style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem', border: '1px solid #334155' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                    <Maximize size={18} style={{ marginRight: '0.5rem' }} /> Viewport & Controls
                </h2>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Gizmo Fixed Screen Size</label>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Pixel dimension of the transformation pivot handles</span>
                    </div>
                    <input
                        type="number"
                        style={{ width: '100px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}
                        value={settings.gizmoScale}
                        onChange={(e) => updateSettings({ gizmoScale: parseFloat(e.target.value) || 1 })}
                        min="0.1" step="0.1"
                    />
                </div>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>LCS Base Size</label>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Base scale modifier for Local Coordinate System widgets</span>
                    </div>
                    <input
                        type="number"
                        style={{ width: '100px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}
                        value={settings.lcsSize}
                        onChange={(e) => updateSettings({ lcsSize: parseFloat(e.target.value) || 10 })}
                        min="1" step="0.5"
                    />
                </div>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Infinite Grid Extent</label>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Maximum bounding size of the XYZ reference plane grids</span>
                    </div>
                    <input
                        type="number"
                        style={{ width: '100px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}
                        value={settings.gridSize}
                        onChange={(e) => updateSettings({ gridSize: parseInt(e.target.value) || 200 })}
                        min="20" step="10"
                    />
                </div>
            </div>

            <div className="settings-section" style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem', border: '1px solid #334155' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                    <Sun size={18} style={{ marginRight: '0.5rem' }} /> Design Tokens & Lighting
                </h2>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Background Color</label>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>World canvas environment background</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                            type="color"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', height: '32px', width: '40px', padding: 0, marginRight: '0.5rem' }}
                            value={settings.backgroundColor}
                            onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                        />
                        <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#94a3b8', background: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            {settings.backgroundColor}
                        </div>
                    </div>
                </div>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Ambient Light Intensity</label>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Base global illumination without shadows</span>
                    </div>
                    <input
                        type="number"
                        style={{ width: '100px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}
                        value={settings.ambientLightIntensity}
                        onChange={(e) => updateSettings({ ambientLightIntensity: parseFloat(e.target.value) || 0 })}
                        min="0" step="0.1"
                    />
                </div>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Directional Light Intensity</label>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Main sun/key light reflecting off metallic meshes</span>
                    </div>
                    <input
                        type="number"
                        style={{ width: '100px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}
                        value={settings.directionalLightIntensity}
                        onChange={(e) => updateSettings({ directionalLightIntensity: parseFloat(e.target.value) || 0 })}
                        min="0" step="0.1"
                    />
                </div>
            </div>
        </div>
    );
}
