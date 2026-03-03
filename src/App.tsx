import React, { useState, useRef, useEffect } from 'react'
import { Box, Play, Download, Cylinder as CylinderIcon, Circle, Ruler, MousePointer2, Grid as GridIcon, Focus, Minus, Layers, PenTool, Activity, Link, Type, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter, Maximize2, Copy, Square, Triangle, Eye, EyeOff, Settings as SettingsIcon, ChevronRight, ChevronDown } from 'lucide-react'
import * as THREE from 'three'
import { evaluate } from 'mathjs'
import './App.css'
import CadViewer, { CadViewerRef, CadOperation } from './components/CadViewer'
import SettingsPanel from './components/SettingsPanel'

export type ShapeType = 'box' | 'cylinder' | 'sphere' | 'step' | 'iges' | 'brep' | 'stl' | 'extrude' | 'revolve' | 'lcs_plane' | 'none' | 'sketch' | 'part' | 'boolean';
export type ActiveTool = 'select' | 'measure' | 'sketch_plane' | 'sketch_point' | 'sketch_line' | 'transform_translate' | 'transform_rotate' | 'transform_scale' | 'constrain_dimension' | 'constrain_horizontal_dist' | 'constrain_vertical_dist' | 'constrain_distance' | 'constrain_radius_diameter' | 'constrain_radius' | 'constrain_diameter' | 'constrain_angle' | 'constrain_lock' | 'constrain_coincident' | 'constrain_point_on_object' | 'constrain_horizontal' | 'constrain_vertical' | 'constrain_parallel' | 'constrain_perpendicular' | 'constrain_tangent' | 'constrain_equal' | 'constrain_symmetric' | 'constrain_block' | 'constrain_refraction' | 'constrain_toggle_driving' | 'constrain_toggle_active' | 'select_sweep_path'

function App() {
  const [isOcctReady, setIsOcctReady] = useState(false)

  // Layout State
  const [activeTab, setActiveTab] = useState<'part' | 'sketch'>('part')
  const [activeViewTab, setActiveViewTab] = useState<'document' | 'settings'>('document')
  const [showGrid, setShowGrid] = useState(false)
  const [showWCS, setShowWCS] = useState(true)
  const [showLCS, setShowLCS] = useState(true)

  // Shape Parameters
  const [shapeType, setShapeType] = useState<ShapeType>('none')
  const [widthExpr, setWidthExpr] = useState('50')
  const [heightExpr, setHeightExpr] = useState('50')
  const [depthExpr, setDepthExpr] = useState('50')
  const [radiusExpr, setRadiusExpr] = useState('25')

  const [renderMode, setRenderMode] = useState<'mesh' | 'brep'>('mesh')

  const [paramErrors, setParamErrors] = useState<Record<string, string>>({})

  const [selectedFeature, setSelectedFeature] = useState<{ type: 'edge' | 'face', index: number } | null>(null)
  const [selectedSketchElements, setSelectedSketchElements] = useState<{ type: 'point' | 'line', index: number }[]>([])
  const [filletRadius, setFilletRadius] = useState<string>("5.0")
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [draftingPlane, setDraftingPlane] = useState<'xy' | 'xz' | 'yz' | null>(null)
  const [preDraftingPlane, setPreDraftingPlane] = useState<'xy' | 'xz' | 'yz' | null>(null)

  // --- SCENE GRAPH STATE ARCHITECTURE ---
  type SceneNode = {
    id: string;
    name: string;
    type: ShapeType;
    params: Record<string, unknown>;
    fileData?: Uint8Array;
    transform: { position: [number, number, number], rotation: [number, number, number], scale: [number, number, number] };
    operations: CadOperation[];
    visible: boolean;
    parentId?: string;
    expanded?: boolean;
    lcsVisible?: boolean;
  };

  const [nodes, setNodes] = useState<SceneNode[]>([
    {
      id: 'root-1',
      name: 'Part 1',
      type: 'none',
      params: { width: 50, height: 50, depth: 50, radius: 25, constraints: [] },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      operations: [],
      visible: true
    }
  ]);
  const [activeNodeId, setActiveNodeId] = useState<string>('root-1');

  // Derive active states for compatibility
  const activeNode = nodes.find(n => n.id === activeNodeId) || nodes[0] || null;
  const activeConfig = activeNode || {} as Partial<SceneNode>;
  const operations = activeNode?.operations || [];

  const setActiveConfig = (updater: Partial<SceneNode> | ((prev: SceneNode) => Partial<SceneNode>)) => {
    setNodes(prev => {
      const idx = prev.findIndex(n => n.id === activeNodeId);
      if (idx === -1) return prev;
      const current = prev[idx];
      const next = typeof updater === 'function' ? updater(current) : updater;
      const newNodes = [...prev];
      newNodes[idx] = { ...current, ...next };
      return newNodes;
    });
  };

  const setOperations = (updater: CadOperation[] | ((prev: CadOperation[]) => CadOperation[])) => {
    setNodes(prev => {
      const idx = prev.findIndex(n => n.id === activeNodeId);
      if (idx === -1) return prev;
      const currentOps = prev[idx].operations || [];
      const newOps = typeof updater === 'function' ? updater(currentOps) : updater;
      const newNodes = [...prev];
      newNodes[idx] = { ...prev[idx], operations: newOps };
      return newNodes;
    });
  };

  // Tree View Selection State
  // Make activeTreeNode alias activeNodeId to keep tree UI happy
  const activeTreeNode = activeNodeId;
  const setActiveTreeNode = setActiveNodeId;

  const [isEditingSketch, setIsEditingSketch] = useState<boolean>(false);

  // Undo/Redo Stacks
  const [, setHistory] = useState<SceneNode[][]>([]);
  const [, setRedoHistory] = useState<SceneNode[][]>([]);

  // We explicitly ignore the legacy newParams arg; we just snapshot the global tree.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pushToHistory = (_newParams?: unknown) => {
    setHistory(prev => [...prev.slice(-19), JSON.parse(JSON.stringify(nodes))]); // Keep last 20 states
    setRedoHistory([]); // Branching history clears the redo path
  };

  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const previousState = newHistory.pop();
      if (previousState) {
        setRedoHistory(r => [...r, JSON.parse(JSON.stringify(nodes))]);
        setNodes(previousState);
        setGenerateTrigger(t => t + 1);
        setTimeout(() => {
          const newActiveNode = previousState.find((n: SceneNode) => n.id === activeNodeId) || previousState[0];
          cadViewerRef.current?.handleUndo(newActiveNode.params);
        }, 10);
      }
      return newHistory;
    });
  };

  const redo = () => {
    setRedoHistory(prevRedo => {
      if (prevRedo.length === 0) return prevRedo;
      const newRedoHistory = [...prevRedo];
      const nextState = newRedoHistory.pop();

      if (nextState) {
        setHistory(prevUndo => [...prevUndo.slice(-19), JSON.parse(JSON.stringify(nodes))]);
        setNodes(nextState);
        setGenerateTrigger(t => t + 1);
        setTimeout(() => {
          const newActiveNode = nextState.find((n: SceneNode) => n.id === activeNodeId) || nextState[0];
          cadViewerRef.current?.handleUndo(newActiveNode.params);
        }, 10);
      }
      return newRedoHistory;
    });
  };

  // Keyboard shortcut for Undo/Redo (Ctrl+Z / Ctrl+Y) and OS Menu hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          if (e.shiftKey) redo(); // Some ecosystems use Ctrl+Shift+Z for Redo
          else undo();
          e.preventDefault();
        } else if (e.key.toLowerCase() === 'y') {
          redo();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const undoListener = () => undo();
    const redoListener = () => redo();

    if (window.ipcRenderer) {

      window.ipcRenderer.on('undo-action', undoListener);

      window.ipcRenderer.on('redo-action', redoListener);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);

      if (window.ipcRenderer?.off) {

        window.ipcRenderer.off('undo-action', undoListener);

        window.ipcRenderer.off('redo-action', redoListener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcut for Deleting nodes
  useEffect(() => {
    const handleDelete = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeNodeId) {
          pushToHistory();
          setNodes((prev: SceneNode[]) => {
            const toDelete = new Set([activeNodeId]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const n of prev) {
                if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
                  toDelete.add(n.id);
                  changed = true;
                }
              }
            }
            return prev.filter(n => !toDelete.has(n.id));
          });
          setActiveNodeId('');
          setGenerateTrigger(t => t + 1);
        }
      }
    };
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodeId, nodes]); // include nodes for pushToHistory scope

  const [generateTrigger, setGenerateTrigger] = useState(0)

  const cadViewerRef = useRef<CadViewerRef>(null)

  useEffect(() => {

    if (window.ipcRenderer) {

      const importListener = () => {
        if (fileInputRef.current) {
          fileInputRef.current.click()
        }
      }


      window.ipcRenderer.on('import-file', importListener)

      const exportListener = async (_event: unknown, format: string) => {
        if (cadViewerRef.current) {
          console.log(`Starting export to ${format}...`);
          const success = await cadViewerRef.current.exportToFormat(format);
          if (success) {
            console.log(`Successfully exported to ${format}`);
          } else {
            console.error(`Failed to export to ${format}`);
          }
        }
      }


      window.ipcRenderer.on('export-shape', exportListener)

      return () => {

        if (window.ipcRenderer.off) {

          window.ipcRenderer.off('import-file', importListener)

          window.ipcRenderer.off('export-shape', exportListener)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (isOcctReady) {
      setTimeout(() => {
        console.log("AUTO TRIGGERING FILLET!");
        setSelectedFeature({ type: 'edge', index: 1 });
        setOperations([{ type: 'fillet', edgeIndex: 1, radius: 10 }]);
        setGenerateTrigger(prev => prev + 1);
      }, 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOcctReady]);

  const handleGenerate = () => {
    if (!isOcctReady) return;
    const newErrors: Record<string, string> = {}
    let width = 50, height = 50, depth = 50, radius = 25

    try { width = evaluate(widthExpr); if (width <= 0 || isNaN(width)) throw new Error() } catch { newErrors.width = 'Invalid' }
    try { height = evaluate(heightExpr); if (height <= 0 || isNaN(height)) throw new Error() } catch { newErrors.height = 'Invalid' }
    try { depth = evaluate(depthExpr); if (depth <= 0 || isNaN(depth)) throw new Error() } catch { newErrors.depth = 'Invalid' }
    try { radius = evaluate(radiusExpr); if (radius <= 0 || isNaN(radius)) throw new Error() } catch { newErrors.radius = 'Invalid' }

    setParamErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      setActiveConfig((prev: SceneNode) => {
        if (prev.type === shapeType) {
          // If simply updating parameters, preserve lines, constraints, and operations
          return {
            ...prev,
            params: { ...prev.params, width, height, depth, radius }
          };
        }

        // If changing to a completely new shape type
        setOperations([]);
        return {
          type: shapeType,
          params: { width, height, depth, radius },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
        };
      });
      setSelectedFeature(null);
      setGenerateTrigger(prev => prev + 1);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const extMatch = file.name.match(/\.(step|stp|iges|igs|brep|stl)$/i)
    const fileExt = extMatch ? extMatch[1].toLowerCase() : ''

    let shapeTypeMapping: ShapeType = 'step'
    if (fileExt === 'stp' || fileExt === 'step') shapeTypeMapping = 'step'
    if (fileExt === 'igs' || fileExt === 'iges') shapeTypeMapping = 'iges'
    if (fileExt === 'brep') shapeTypeMapping = 'brep'
    if (fileExt === 'stl') shapeTypeMapping = 'stl'

    setShapeType(shapeTypeMapping)

    try {
      const buffer = await file.arrayBuffer()
      const ui8 = new Uint8Array(buffer)

      setActiveConfig({
        type: shapeTypeMapping,
        params: {},
        fileData: ui8,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      })
      setSelectedFeature(null)
      setOperations([])
      setActiveTreeNode('root')
      setGenerateTrigger(prev => prev + 1)


    } catch (e) {
      console.error("Error reading step file:", e)
    }

    // reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExport = async () => {
    try {
      if (!cadViewerRef.current) return;

      const success = await cadViewerRef.current.exportToSTL(`${shapeType}.stl`);

      if (success) {
        console.log(`Saved successfully`);
      }
    } catch (error) {
      console.error('Error exporting STL:', error)
    }
  }

  // --- Auto Apply Constraints on Selection Workflow ---
  useEffect(() => {
    if (!activeTool.startsWith('constrain_') || selectedSketchElements.length === 0) return;

    let shouldApply = false;

    if (activeTool === 'constrain_distance') {
      if (selectedSketchElements.length === 1 && selectedSketchElements[0].type === 'line') shouldApply = true;
      else if (selectedSketchElements.length === 2) shouldApply = true;
    } else if (activeTool === 'constrain_coincident' || activeTool === 'constrain_point_on_object') {
      if (selectedSketchElements.length === 2) shouldApply = true;
    } else if (['constrain_horizontal', 'constrain_vertical', 'constrain_horizontal_dist', 'constrain_vertical_dist', 'constrain_radius_diameter', 'constrain_radius', 'constrain_diameter', 'constrain_angle'].includes(activeTool)) {
      if (selectedSketchElements.length === 1 && selectedSketchElements[0].type === 'line') shouldApply = true;
      else if (activeTool.includes('dist') && selectedSketchElements.length === 2) shouldApply = true;
      else if (activeTool === 'constrain_angle' && selectedSketchElements.length === 2) shouldApply = true;
    } else if (['constrain_parallel', 'constrain_perpendicular', 'constrain_equal', 'constrain_tangent'].includes(activeTool)) {
      if (selectedSketchElements.length === 2) shouldApply = true;
    } else if (['constrain_lock', 'constrain_block'].includes(activeTool)) {
      if (selectedSketchElements.length === 1) shouldApply = true;
    } else if (activeTool === 'constrain_symmetric') {
      if (selectedSketchElements.length === 3) shouldApply = true;
    }

    if (shouldApply) {
      let numVal: number | undefined = undefined;
      const needsValue = ['constrain_distance', 'constrain_horizontal_dist', 'constrain_vertical_dist', 'constrain_radius_diameter', 'constrain_angle'].includes(activeTool);

      if (needsValue) {
        if (activeTool === 'constrain_distance') {
          const sketchLines = (cadViewerRef.current?.getSketch()?.lines || (activeConfig.params as any).lines || []) as { start: THREE.Vector3, end: THREE.Vector3 }[];
          if (selectedSketchElements.length === 1 && selectedSketchElements[0].type === 'line') {
            const lineIdx = selectedSketchElements[0].index;
            if (sketchLines[lineIdx]) {
              const l = sketchLines[lineIdx];
              numVal = new THREE.Vector3().subVectors(l.end, l.start).length();
            }
          } else if (selectedSketchElements.length === 2 && selectedSketchElements[0].type === 'point' && selectedSketchElements[1].type === 'point') {
            const getPt = (el: { type: string, index: number }) => {
              const lIdx = Math.floor(el.index / 2);
              const isStart = el.index % 2 === 0;
              return sketchLines[lIdx] ? (isStart ? sketchLines[lIdx].start : sketchLines[lIdx].end) : null;
            };
            const p1 = getPt(selectedSketchElements[0]);
            const p2 = getPt(selectedSketchElements[1]);
            if (p1 && p2) numVal = p1.distanceTo(p2);
          } else if (selectedSketchElements.length === 2 && ['point', 'line'].includes(selectedSketchElements[0].type) && ['point', 'line'].includes(selectedSketchElements[1].type)) {
            const ptEl = selectedSketchElements.find(e => e.type === 'point');
            const lnEl = selectedSketchElements.find(e => e.type === 'line');
            if (ptEl && lnEl) {
              const lIdx = Math.floor(ptEl.index / 2);
              const isStart = ptEl.index % 2 === 0;
              const p1 = sketchLines[lIdx] ? (isStart ? sketchLines[lIdx].start : sketchLines[lIdx].end) : null;
              const line = sketchLines[lnEl.index];
              if (p1 && line) {
                const lineVec = new THREE.Vector3().subVectors(line.end, line.start);
                const lineDir = lineVec.clone();
                if (lineDir.lengthSq() > 0) lineDir.normalize();
                const ptVec = new THREE.Vector3().subVectors(p1, line.start);
                const projLen = ptVec.dot(lineDir);
                const projPt = line.start.clone().add(lineDir.clone().multiplyScalar(projLen));
                numVal = p1.distanceTo(projPt);
              }
            }
          }
        }

        if (numVal === undefined) numVal = 10; // Fallback generic value
      }

      setTimeout(() => {
        const liveSketch = cadViewerRef.current?.getSketch();
        setActiveConfig((prev: SceneNode) => {
          const snapshotParams = {
            ...prev.params,
            ...(liveSketch ? { lines: liveSketch.lines, points: liveSketch.points } : {})
          };
          pushToHistory(snapshotParams);

          return {
            ...prev,
            params: {
              ...snapshotParams,
              constraints: [...((snapshotParams as any).constraints || []), { type: activeTool, elements: [...selectedSketchElements], value: numVal }]
            }
          };
        });
        setSelectedSketchElements([]);
        setGenerateTrigger(prev => prev + 1);
      }, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSketchElements, activeTool]);
  // --------------------------------------------------------

  return (
    <div className="app-container">
      {/* ... */}
      <div className="sidebar">
        <h1>
          <Box className="text-blue-400" size={28} />
          TBM Manager
        </h1>

        <div className="controls">
          <div style={{ display: 'flex', marginBottom: '1rem', borderBottom: '1px solid #334155' }}>
            <button
              style={{ flex: 1, padding: '0.5rem', background: activeTab === 'part' ? '#1e293b' : 'transparent', color: activeTab === 'part' ? '#60a5fa' : '#94a3b8', border: 'none', borderBottom: activeTab === 'part' ? '2px solid #60a5fa' : 'none', cursor: 'pointer' }}
              onClick={() => setActiveTab('part')}
            >Part Design</button>
            <button
              style={{ flex: 1, padding: '0.5rem', background: activeTab === 'sketch' ? '#1e293b' : 'transparent', color: activeTab === 'sketch' ? '#60a5fa' : '#94a3b8', border: 'none', borderBottom: activeTab === 'sketch' ? '2px solid #60a5fa' : 'none', cursor: 'pointer' }}
              onClick={() => setActiveTab('sketch')}
            >Sketcher</button>
          </div>

          <div className="control-group" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', margin: '0.5rem 0' }}>
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
              <span>Show Setup Grid</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', margin: '0.5rem 0' }}>
              <input type="checkbox" checked={showWCS} onChange={e => setShowWCS(e.target.checked)} />
              <span>Show WCS Origin</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', margin: '0.5rem 0' }}>
              <input type="checkbox" checked={showLCS} onChange={e => setShowLCS(e.target.checked)} />
              <span>Show LCS Origin</span>
            </label>
          </div>

          <div className="control-group">
            <input
              type="file"
              accept=".step,.stp,.iges,.igs,.brep,.stl"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <label>Render View</label>
            <div className="shape-selectors">
              <button
                className={`shape-btn ${renderMode === 'mesh' ? 'active' : ''}`}
                onClick={() => setRenderMode('mesh')}
              >
                Faces
              </button>
              <button
                className={`shape-btn ${renderMode === 'brep' ? 'active' : ''}`}
                onClick={() => setRenderMode('brep')}
              >
                Edges
              </button>
            </div>
          </div>

          {activeTab === 'part' && (
            <>
              <div className="control-group">
                <button
                  className="btn primary-btn"
                  style={{ width: '100%', marginBottom: '1rem', background: '#0ea5e9', borderColor: '#0ea5e9' }}
                  onClick={() => {
                    const newPartId = 'part-' + Date.now();
                    const newSketchId = 'sketch-' + Date.now();
                    setNodes(prev => [
                      ...prev,
                      {
                        id: newPartId,
                        name: `Body ${prev.filter(n => n.type === 'part').length + 1}`,
                        type: 'part',
                        params: {},
                        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                        operations: [],
                        visible: true
                      },
                      {
                        id: newSketchId,
                        name: `Sketch 1`,
                        type: 'sketch',
                        parentId: newPartId,
                        params: { lines: [], points: [], constraints: [] },
                        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                        operations: [],
                        visible: true
                      }
                    ]);
                    setActiveNodeId(newSketchId);
                    setActiveTab('sketch');
                    setActiveTool('sketch_plane');
                    cadViewerRef.current?.clearSketch();
                    cadViewerRef.current?.setIsoView();
                  }}
                >
                  <PenTool size={16} style={{ marginRight: '8px', display: 'inline' }} /> Create Body & Sketch
                </button>
                <label>Shape Type</label>
                <div className="shape-selectors">
                  <button
                    className={`shape-btn ${shapeType === 'box' ? 'active' : ''}`}
                    onClick={() => setShapeType('box')}
                  >
                    <Box size={20} /> Box
                  </button>
                  <button
                    className={`shape-btn ${shapeType === 'cylinder' ? 'active' : ''}`}
                    onClick={() => setShapeType('cylinder')}
                  >
                    <CylinderIcon size={20} /> Cylinder
                  </button>
                  <button
                    className={`shape-btn ${shapeType === 'sphere' ? 'active' : ''}`}
                    onClick={() => setShapeType('sphere')}
                  >
                    <Circle size={20} /> Sphere
                  </button>
                  <button
                    className={`shape-btn ${shapeType === 'lcs_plane' ? 'active' : ''}`}
                    onClick={() => setShapeType('lcs_plane')}
                  >
                    <Focus size={20} /> LCS Widget
                  </button>
                </div>
              </div>

              <div className="control-group">
                <label>Transform & Inspect</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <button
                    className={`shape-btn ${activeTool === 'select' ? 'active' : ''}`}
                    onClick={() => setActiveTool('select')}
                  >
                    <MousePointer2 size={16} /> Select
                  </button>
                  <button
                    className={`shape-btn ${activeTool === 'measure' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(activeTool === 'measure' ? 'select' : 'measure');
                      setSelectedFeature(null);
                    }}
                  >
                    <Ruler size={16} /> Measure
                  </button>
                  <button
                    className={`shape-btn ${activeTool === 'transform_translate' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(activeTool === 'transform_translate' ? 'select' : 'transform_translate');
                      setSelectedFeature(null);
                    }}
                  >
                    <Activity size={16} /> Translate
                  </button>
                  <button
                    className={`shape-btn ${activeTool === 'transform_rotate' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(activeTool === 'transform_rotate' ? 'select' : 'transform_rotate');
                      setSelectedFeature(null);
                    }}
                  >
                    <Circle size={16} /> Rotate
                  </button>
                  <button
                    className={`shape-btn ${activeTool === 'transform_scale' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(activeTool === 'transform_scale' ? 'select' : 'transform_scale');
                      setSelectedFeature(null);
                    }}
                  >
                    <Box size={16} /> Scale
                  </button>
                </div>
              </div>

              <div className="control-group">
                <label>Generate Profile from Selected Sketch</label>
                <div className="shape-selectors">
                  <button
                    className={`shape-btn ${activeNode.type === 'extrude' ? 'active' : ''}`}
                    onClick={() => {
                      if (activeNode.type !== 'sketch') {
                        alert("Please select a Sketch in the Project Tree to extrude.");
                        return;
                      }
                      const lines = (activeNode.params as any)?.lines;
                      if (!lines || (lines as any[]).length < 3) {
                        alert("The selected sketch must have at least 3 lines.");
                        return;
                      }
                      const newNodeId = 'extrude-' + Date.now();
                      pushToHistory();
                      setNodes((prev: SceneNode[]) => [
                        ...prev,
                        {
                          id: newNodeId,
                          name: `Extrusion`,
                          type: 'extrude',
                          parentId: activeNode.parentId,
                          params: { lines, plane: activeNode.params.plane || 'xy', depth: 10, constraints: [], sourceSketchId: activeNode.id },
                          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                          operations: [],
                          visible: true
                        }
                      ]);
                      setActiveNodeId(newNodeId);
                      setActiveTool('select');
                      setGenerateTrigger(prev => prev + 1);
                      cadViewerRef.current?.clearSketch();
                      setDraftingPlane(null);
                    }}
                  >
                    <CylinderIcon size={16} /> Extrude
                  </button>
                  <button
                    className={`shape-btn ${activeNode.type === 'revolve' ? 'active' : ''}`}
                    onClick={() => {
                      if (activeNode.type !== 'sketch') {
                        alert("Please select a Sketch in the Project Tree to revolve.");
                        return;
                      }
                      const lines = (activeNode.params as any)?.lines;
                      if (!lines || (lines as any[]).length < 3) {
                        alert("The selected sketch must have at least 3 lines.");
                        return;
                      }
                      const newNodeId = 'revolve-' + Date.now();
                      pushToHistory();
                      setNodes((prev: SceneNode[]) => [
                        ...prev,
                        {
                          id: newNodeId,
                          name: `Revolution`,
                          type: 'revolve',
                          parentId: activeNode.parentId,
                          params: { lines, plane: activeNode.params.plane || 'xy', constraints: [], sourceSketchId: activeNode.id },
                          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                          operations: [],
                          visible: true
                        }
                      ]);
                      setActiveNodeId(newNodeId);
                      setActiveTool('select');
                      setGenerateTrigger(prev => prev + 1);
                      cadViewerRef.current?.clearSketch();
                      setDraftingPlane(null);
                    }}
                  >
                    <Circle size={16} /> Revolve
                  </button>
                </div>
              </div>

              <div className="control-group">
                <label>Boolean Operations</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', color: '#94a3b8' }}>Tool Object (to cut/fuse with)</label>
                    <select
                      className="property-input"
                      style={{ width: '100%' }}
                      id="boolean-tool-selector"
                      defaultValue=""
                    >
                      <option value="" disabled>Select Tool Part...</option>
                      {nodes.filter(n => n.id !== activeNode.id && n.type !== 'sketch' && n.type !== 'none' && n.type !== 'part').map(n => (
                        <option key={`bool-opt-${n.id}`} value={n.id}>{n.name || n.type}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                    <button
                      className="shape-btn"
                      onClick={() => {
                        const toolEl = document.getElementById('boolean-tool-selector') as HTMLSelectElement;
                        const toolId = toolEl?.value;
                        if (!toolId) { alert("Please select a Tool object first."); return; }
                        if (activeNode.type === 'sketch' || activeNode.type === 'none' || activeNode.type === 'part') { alert("Please select a valid 3D Target object."); return; }

                        const newNodeId = `boolean-${Date.now()}`;
                        setNodes((prev: SceneNode[]) => [
                          ...prev.map(n => (n.id === activeNode.id || n.id === toolId) ? { ...n, visible: false } : n),
                          {
                            id: newNodeId,
                            name: `Cut (${activeNode.type} - tool)`,
                            type: 'boolean',
                            parentId: activeNode.parentId,
                            params: { operation: 'cut', targetId: activeNode.id, toolId },
                            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                            operations: [],
                            visible: true
                          }
                        ]);
                        setActiveNodeId(newNodeId);
                        setGenerateTrigger(prev => prev + 1);
                      }}
                    >
                      Cut
                    </button>
                    <button
                      className="shape-btn"
                      onClick={() => {
                        const toolEl = document.getElementById('boolean-tool-selector') as HTMLSelectElement;
                        const toolId = toolEl?.value;
                        if (!toolId) { alert("Please select a Tool object first."); return; }
                        if (activeNode.type === 'sketch' || activeNode.type === 'none' || activeNode.type === 'part') { alert("Please select a valid 3D Target object."); return; }

                        const newNodeId = `boolean-${Date.now()}`;
                        setNodes((prev: SceneNode[]) => [
                          ...prev.map(n => (n.id === activeNode.id || n.id === toolId) ? { ...n, visible: false } : n),
                          {
                            id: newNodeId,
                            name: `Union`,
                            type: 'boolean',
                            parentId: activeNode.parentId,
                            params: { operation: 'fuse', targetId: activeNode.id, toolId },
                            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                            operations: [],
                            visible: true
                          }
                        ]);
                        setActiveNodeId(newNodeId);
                        setGenerateTrigger(prev => prev + 1);
                      }}
                    >
                      Union
                    </button>
                    <button
                      className="shape-btn"
                      onClick={() => {
                        const toolEl = document.getElementById('boolean-tool-selector') as HTMLSelectElement;
                        const toolId = toolEl?.value;
                        if (!toolId) { alert("Please select a Tool object first."); return; }
                        if (activeNode.type === 'sketch' || activeNode.type === 'none' || activeNode.type === 'part') { alert("Please select a valid 3D Target object."); return; }

                        const newNodeId = `boolean-${Date.now()}`;
                        setNodes((prev: SceneNode[]) => [
                          ...prev.map(n => (n.id === activeNode.id || n.id === toolId) ? { ...n, visible: false } : n),
                          {
                            id: newNodeId,
                            name: `Intersect`,
                            type: 'boolean',
                            parentId: activeNode.parentId,
                            params: { operation: 'common', targetId: activeNode.id, toolId },
                            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                            operations: [],
                            visible: true
                          }
                        ]);
                        setActiveNodeId(newNodeId);
                        setGenerateTrigger(prev => prev + 1);
                      }}
                    >
                      Intersect
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'sketch' && (
            <>
              <div className="control-group">
                <label>Draw & Plane Tools</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <button
                    className={`shape-btn ${activeTool === 'select' ? 'active' : ''}`}
                    onClick={() => setActiveTool('select')}
                  >
                    <MousePointer2 size={16} /> Select
                  </button>
                  <button
                    className={`shape-btn ${activeTool === 'sketch_plane' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(activeTool === 'sketch_plane' ? 'select' : 'sketch_plane');
                      setSelectedFeature(null);
                      if (activeTool === 'sketch_plane') setPreDraftingPlane(null);
                    }}
                  >
                    <GridIcon size={16} /> Set Plane
                  </button>
                  {activeTool === 'sketch_plane' && preDraftingPlane && !draftingPlane && (
                    <button
                      className="shape-btn"
                      style={{ background: '#059669', color: 'white', borderColor: '#059669', gridColumn: 'span 2' }}
                      onClick={() => {
                        setDraftingPlane(preDraftingPlane);
                        setActiveTool('sketch_line');
                      }}
                    >
                      Accept Plane
                    </button>
                  )}
                  <button
                    className={`shape-btn ${activeTool === 'sketch_point' ? 'active' : ''}`}
                    onClick={() => setActiveTool('sketch_point')}
                    disabled={!draftingPlane}
                    title={!draftingPlane ? "Select a drafting plane first" : ""}
                  >
                    <Focus size={16} /> Point
                  </button>
                  <button
                    className={`shape-btn ${activeTool === 'sketch_line' ? 'active' : ''}`}
                    onClick={() => setActiveTool('sketch_line')}
                    disabled={!draftingPlane}
                    title={!draftingPlane ? "Select a drafting plane first" : ""}
                  >
                    <Minus size={16} /> Line
                  </button>
                  <button
                    className="shape-btn"
                    style={{ background: 'rgba(15, 23, 42, 0.5)', gridColumn: 'span 2' }}
                    onClick={() => {
                      cadViewerRef.current?.closeSketch();
                      setActiveTool('select');
                    }}
                    disabled={!draftingPlane}
                    title={!draftingPlane ? "Select a drafting plane first" : "Connect the last line to the first point"}
                  >
                    <Activity size={16} /> Close Path
                  </button>
                </div>
                {draftingPlane && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px', textAlign: 'center' }}>
                    Active Plane: {draftingPlane.toUpperCase()}
                  </div>
                )}
              </div>

              <div className="control-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0 }}>Constraints</label>
                  {/* Auto-apply effect replaces the manual apply button */}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.05)' }}>

                  {/* Geometric */}
                  <button className={`shape-btn ${activeTool === 'constrain_coincident' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_coincident')} title="Coincident">
                    <Focus size={16} /> Coinc
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_point_on_object' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_point_on_object')} title="Point On Object">
                    <MousePointer2 size={16} /> PtOnObj
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_horizontal' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_horizontal')} title="Horizontal">
                    <Minus size={16} /> Horiz
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_vertical' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_vertical')} title="Vertical">
                    <AlignVerticalJustifyCenter size={16} /> Vert
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_parallel' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_parallel')} title="Parallel">
                    <Layers size={16} /> Paral
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_perpendicular' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_perpendicular')} title="Perpendicular">
                    <GridIcon size={16} /> Perp
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_tangent' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_tangent')} title="Tangent/Collinear">
                    <Circle size={16} /> Tangnt
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_equal' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_equal')} title="Equal">
                    <AlignHorizontalJustifyCenter size={16} /> Equal
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_symmetric' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_symmetric')} title="Symmetric">
                    <Copy size={16} /> Symm
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_block' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_block')} title="Block / Fix">
                    <Square size={16} /> Block
                  </button>

                  {/* Dimensional */}
                  <button className={`shape-btn ${activeTool === 'constrain_distance' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_distance')} title="Distance">
                    <Maximize2 size={16} /> Dist
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_horizontal_dist' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_horizontal_dist')} title="Horizontal Distance">
                    <AlignHorizontalJustifyCenter size={16} /> HDist
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_vertical_dist' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_vertical_dist')} title="Vertical Distance">
                    <AlignVerticalJustifyCenter size={16} /> VDist
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_radius_diameter' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_radius_diameter')} title="Radius/Diameter">
                    <Circle size={16} /> Rad/Dia
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_angle' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_angle')} title="Angle">
                    <Triangle size={16} /> Angle
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_lock' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_lock')} title="Lock Position">
                    <Link size={16} /> Lock
                  </button>

                  {/* Toggles */}
                  <button className={`shape-btn ${activeTool === 'constrain_toggle_driving' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_toggle_driving')} title="Toggle Reference/Driving" style={{ background: 'rgba(56, 189, 248, 0.05)' }}>
                    <Type size={16} /> Ref
                  </button>
                  <button className={`shape-btn ${activeTool === 'constrain_toggle_active' ? 'active' : ''}`} onClick={() => setActiveTool('constrain_toggle_active')} title="Toggle Active/Deactive" style={{ background: 'rgba(56, 189, 248, 0.05)' }}>
                    <Play size={16} /> Tgl
                  </button>
                </div>
              </div>

              {isEditingSketch && (
                <div className="control-group">
                  <label>Editing Profile</label>
                  <div className="shape-selectors">
                    <button
                      className="shape-btn"
                      style={{ background: '#059669', color: 'white', borderColor: '#059669' }}
                      onClick={() => {
                        const sketch = cadViewerRef.current?.getSketch();
                        if (sketch && sketch.lines.length >= 3) {
                          setActiveConfig((prev: SceneNode) => ({
                            ...prev,
                            params: { ...prev.params, lines: sketch.lines }
                          }));
                          setIsEditingSketch(false);
                          setActiveTab('part');
                          setActiveTool('select');
                          setGenerateTrigger(prev => prev + 1);
                          cadViewerRef.current?.clearSketch();
                          setDraftingPlane(null);
                        } else {
                          alert("Please ensure the sketch has at least 3 lines before applying.");
                        }
                      }}
                    >
                      Accept Details & Finish
                    </button>
                    <button
                      className="shape-btn"
                      onClick={() => {
                        setIsEditingSketch(false);
                        setActiveTab('part');
                        setActiveTool('select');
                        cadViewerRef.current?.clearSketch();
                        setDraftingPlane(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="parameters-container">
            {shapeType === 'box' && (
              <>
                <div className="input-group">
                  <label>Width {paramErrors.width && <span className="error-text">({paramErrors.width})</span>}</label>
                  <input type="text" value={widthExpr} onChange={(e) => { setWidthExpr(e.target.value); setParamErrors(prev => ({ ...prev, width: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50 or sqrt(2500)" />
                </div>
                <div className="input-group">
                  <label>Height {paramErrors.height && <span className="error-text">({paramErrors.height})</span>}</label>
                  <input type="text" value={heightExpr} onChange={(e) => { setHeightExpr(e.target.value); setParamErrors(prev => ({ ...prev, height: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50 or cos(0)*50" />
                </div>
                <div className="input-group">
                  <label>Depth {paramErrors.depth && <span className="error-text">({paramErrors.depth})</span>}</label>
                  <input type="text" value={depthExpr} onChange={(e) => { setDepthExpr(e.target.value); setParamErrors(prev => ({ ...prev, depth: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50" />
                </div>
              </>
            )}
            {shapeType === 'cylinder' && (
              <>
                <div className="input-group">
                  <label>Radius {paramErrors.radius && <span className="error-text">({paramErrors.radius})</span>}</label>
                  <input type="text" value={radiusExpr} onChange={(e) => { setRadiusExpr(e.target.value); setParamErrors(prev => ({ ...prev, radius: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 25" />
                </div>
                <div className="input-group">
                  <label>Height {paramErrors.height && <span className="error-text">({paramErrors.height})</span>}</label>
                  <input type="text" value={heightExpr} onChange={(e) => { setHeightExpr(e.target.value); setParamErrors(prev => ({ ...prev, height: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50" />
                </div>
              </>
            )}
            {shapeType === 'sphere' && (
              <div className="input-group">
                <label>Radius {paramErrors.radius && <span className="error-text">({paramErrors.radius})</span>}</label>
                <input type="text" value={radiusExpr} onChange={(e) => { setRadiusExpr(e.target.value); setParamErrors(prev => ({ ...prev, radius: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 25" />
              </div>
            )}
            {['step', 'iges', 'brep', 'stl'].includes(shapeType) && (
              <div className="input-group" style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem 0' }}>
                Rendering imported {shapeType.toUpperCase()} file data.
              </div>
            )}
            {shapeType === 'extrude' && (
              <div className="input-group">
                <label>Extrusion Depth {paramErrors.depth && <span className="error-text">({paramErrors.depth})</span>}</label>
                <input type="text" value={depthExpr} onChange={(e) => { setDepthExpr(e.target.value); setParamErrors(prev => ({ ...prev, depth: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50" />
              </div>
            )}
          </div>

          <div className="actions">
            <button
              className="btn primary-btn"
              onClick={handleGenerate}
              disabled={!isOcctReady}
            >
              <Play size={18} />
              Generate Base Geometry
            </button>
            <button
              className="btn outline-btn"
              onClick={handleExport}
              disabled={!isOcctReady}
            >
              <Download size={18} />
              Export to STL
            </button>
          </div>

          {selectedFeature && (
            <div className="feature-panel" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature Operations</h3>
              <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ color: '#cbd5e1' }}>Selected Target:</span>
                  <span style={{ color: '#facc15', fontWeight: 'bold', background: '#422006', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                    {selectedFeature.type.toUpperCase()} #{selectedFeature.index}
                  </span>
                </div>
                {selectedFeature.type === 'edge' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                      <label>Fillet Radius</label>
                      <input
                        type="number"
                        value={filletRadius}
                        onChange={(e) => setFilletRadius(e.target.value)}
                        min="0.1"
                        step="0.5"
                      />
                    </div>
                    <button
                      className="btn primary-btn" style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
                      onClick={() => {
                        const radius = parseFloat(filletRadius.toString()); // Ensure it's a number
                        if (!isNaN(radius) && selectedFeature?.type === 'edge') {
                          setOperations((prev: CadOperation[]) => [...prev, { type: 'fillet', edgeIndex: selectedFeature.index, radius }]);
                          setGenerateTrigger(p => p + 1);
                        }
                      }}
                    >
                      Apply Fillet
                    </button>
                  </div>
                )}
                <button
                  className="btn outline-btn" style={{ width: '100%', padding: '0.5rem' }}
                  onClick={() => setSelectedFeature(null)}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}
        </div>
      </div >

      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="tabs-bar" style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #1e293b', zIndex: 10 }}>
          <div
            onClick={() => setActiveViewTab('document')}
            style={{ padding: '0.75rem 1.5rem', background: activeViewTab === 'document' ? '#1e293b' : 'transparent', color: activeViewTab === 'document' ? '#f8fafc' : '#64748b', cursor: 'pointer', borderRight: '1px solid #1e293b', borderTop: activeViewTab === 'document' ? '2px solid #38bdf8' : '2px solid transparent', display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}
          >
            <Box size={16} style={{ marginRight: '0.5rem' }} /> Document 1
          </div>
          <div
            onClick={() => setActiveViewTab('settings')}
            style={{ padding: '0.75rem 1.5rem', background: activeViewTab === 'settings' ? '#1e293b' : 'transparent', color: activeViewTab === 'settings' ? '#f8fafc' : '#64748b', cursor: 'pointer', borderRight: '1px solid #1e293b', borderTop: activeViewTab === 'settings' ? '2px solid #38bdf8' : '2px solid transparent', display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}
          >
            <SettingsIcon size={16} style={{ marginRight: '0.5rem' }} /> Settings
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: activeViewTab === 'document' ? 1 : 0, visibility: activeViewTab === 'document' ? 'visible' : 'hidden' }}>
            <CadViewer
              ref={cadViewerRef}
              onReady={() => setIsOcctReady(true)}
              generateTrigger={generateTrigger}
              shapeType={activeConfig?.type || 'none'}
              shapeParams={activeConfig?.params || {}}
              fileData={activeConfig?.fileData}
              nodes={nodes}
              activeNodeId={activeNodeId}
              renderMode={renderMode}
              showGrid={showGrid}
              showWCS={showWCS}
              selectedFeature={activeTool !== 'select' ? null : selectedFeature}
              onSelectFeature={(type: 'edge' | 'face', index: number) => {
                if (activeTool === 'select') setSelectedFeature({ type, index })
              }}
              onSelectNode={(id: string) => {
                if (activeTool === 'select') {
                  setActiveNodeId(id);
                  setSelectedFeature(null);
                }
              }}
              operations={operations}
              activeTool={activeTool}
              onSelectSweepVector={(vec: [number, number, number], isPreview?: boolean) => {
                setActiveConfig((prev: SceneNode) => ({
                  ...prev,
                  params: { ...prev.params, sweepVector: vec }
                }));
                if (!isPreview) {
                  setActiveTool('select');
                }
                setGenerateTrigger(p => p + 1);
              }}
              draftingPlane={draftingPlane}
              preDraftingPlane={preDraftingPlane}
              onHoverDraftingPlane={setPreDraftingPlane}
              onSelectDraftingPlane={setDraftingPlane}
              // Map origin controls to the parent Part if applicable, otherwise self.
              originTransform={nodes.find(n => n.id === activeConfig.parentId)?.transform || activeConfig.transform}
              onOriginTransformStart={() => pushToHistory()}
              onOriginTransformChange={(t) => {
                const targetId = activeConfig.parentId || activeConfig.id;
                setNodes((prev: SceneNode[]) => {
                  const idx = prev.findIndex(n => n.id === targetId);
                  if (idx === -1) return prev;
                  const newNodes = [...prev];
                  newNodes[idx] = {
                    ...newNodes[idx],
                    transform: {
                      position: t.position,
                      rotation: t.rotation,
                      scale: t.scale || newNodes[idx].transform.scale
                    }
                  };
                  return newNodes;
                });
              }}
              constraints={(activeConfig.params as any).constraints || []}
              onUpdateConstraint={(idx, val) => {
                setActiveConfig((prev: SceneNode) => {
                  pushToHistory(prev.params);
                  const existing = (prev.params as any).constraints || [];
                  const copy = [...existing];
                  copy[idx] = { ...copy[idx], value: val };
                  return {
                    ...prev,
                    params: {
                      ...prev.params,
                      constraints: copy
                    }
                  };
                });
                setGenerateTrigger(prev => prev + 1);
              }}
              onAddConstraint={(constraint) => {
                setActiveConfig((prev: SceneNode) => {
                  pushToHistory(prev.params);
                  const existing = (prev.params as any).constraints || [];
                  return {
                    ...prev,
                    params: {
                      ...prev.params,
                      constraints: [...existing, constraint]
                    }
                  };
                });
                setGenerateTrigger(prev => prev + 1);
              }}
              selectedSketchElements={selectedSketchElements}
              onSelectSketchElement={(type, index, isShift) => {
                setSelectedSketchElements(prev => {
                  const existingIdx = prev.findIndex(e => e.type === type && e.index === index);
                  if (isShift) {
                    if (existingIdx >= 0) {
                      const copy = [...prev];
                      copy.splice(existingIdx, 1);
                      return copy;
                    } else {
                      return [...prev, { type, index }];
                    }
                  } else {
                    return existingIdx >= 0 && prev.length === 1 ? [] : [{ type, index }];
                  }
                });
              }}
              onSketchUpdated={(lines, points) => {
                setActiveConfig((prev: SceneNode) => {
                  pushToHistory(prev.params);
                  return {
                    ...prev,
                    params: { ...prev.params, lines, points }
                  };
                });
              }}
              visibleSketches={
                nodes
                  .filter(n => n.type === 'sketch' && n.visible)
                  .filter(n => !(isEditingSketch && n.id === activeNodeId))
                  .map(n => {
                    const parent = nodes.find(p => p.id === n.parentId);
                    return {
                      id: n.id,
                      lines: (n.params as any)?.lines || [],
                      transform: parent?.transform || n.transform
                    };
                  })
              }
              onUpdateNodeParam={(nodeId, paramName, value) => {
                setNodes((prev: SceneNode[]) => {
                  const idx = prev.findIndex(n => n.id === nodeId);
                  if (idx === -1) return prev;
                  const newNodes = [...prev];
                  newNodes[idx] = {
                    ...newNodes[idx],
                    params: { ...newNodes[idx].params, [paramName]: value }
                  };
                  return newNodes;
                });
                // We specifically don't want to increment generateTrigger on every drag frame
                // for performance reasons, only on blur/mouse up if handled inside Drei 
                // but OCCT generates fast enough sometimes. Let's trigger generate lightly
                setGenerateTrigger(prev => prev + 1);
              }}
            />

            <div className="status-bar">
              <div className={`status-dot ${isOcctReady ? 'ready' : 'loading'}`}></div>
              {isOcctReady ? 'Kernel Ready' : 'Initializing OCCT...'}
            </div>

            <div className="tree-panel">
              <div className="tree-header">
                <Layers size={18} />
                Project Tree
              </div>
              <div className="tree-content">
                {nodes.length > 0 ? (
                  // Only render top-level nodes or parts first
                  nodes.filter(n => !n.parentId || n.type === 'part').map((node, i) => (
                    <React.Fragment key={node.id}>
                      <div
                        className={`tree-node ${activeNodeId === node.id ? 'active' : ''}`}
                        onClick={() => setActiveNodeId(node.id)}
                        style={{ opacity: node.visible ? 1 : 0.5 }}
                      >
                        <span onClick={(e) => { e.stopPropagation(); setNodes(prev => prev.map(n => n.id === node.id ? { ...n, expanded: !n.expanded } : n)); }} style={{ cursor: 'pointer', marginRight: '4px', display: 'flex', alignItems: 'center', color: '#64748b' }}>
                          {node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <div className="tree-icon">
                          {['box', 'extrude', 'part'].includes(node.type) && <Box size={16} />}
                          {['cylinder', 'revolve'].includes(node.type) && <CylinderIcon size={16} />}
                          {node.type === 'sphere' && <Circle size={16} />}
                          {['step', 'iges', 'brep', 'stl', 'none'].includes(node.type) && <Layers size={16} />}
                          {node.type === 'lcs_plane' && <Focus size={16} />}
                          {node.type === 'sketch' && <PenTool size={16} />}
                        </div>
                        <span style={{ textTransform: 'capitalize', fontWeight: node.type === 'part' ? 'bold' : 'normal', flex: 1 }}>
                          {node.name || `${node.type} ${i + 1}`}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          [{node.transform.position.map(p => p.toFixed(0)).join(',')}]
                        </div>
                        <button
                          className="icon-btn"
                          title={node.visible ? "Hide" : "Show"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, visible: !n.visible } : n));
                          }}
                          style={{ padding: '2px', marginLeft: '4px', background: 'transparent', border: 'none', color: node.visible ? '#94a3b8' : '#f43f5e', cursor: 'pointer' }}
                        >
                          {node.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>

                      {node.expanded && (
                        <>
                          {node.type !== 'lcs_plane' && (
                            <div
                              className={`tree-node nested`}
                              style={{ opacity: node.lcsVisible ? 1 : 0.5 }}
                            >
                              <div className="tree-icon" style={{ marginLeft: '14px' }}><Focus size={14} /></div>
                              <span style={{ flex: 1, fontStyle: 'italic', fontSize: '0.85em', color: '#94a3b8' }}>Local Coordinate System</span>
                              <button
                                className="icon-btn"
                                title={node.lcsVisible ? "Hide" : "Show"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNodes(prev => prev.map(n => n.id === node.id ? { ...n, lcsVisible: !n.lcsVisible } : n));
                                }}
                                style={{ padding: '2px', marginLeft: '4px', background: 'transparent', border: 'none', color: node.lcsVisible ? '#94a3b8' : '#f43f5e', cursor: 'pointer' }}
                              >
                                {node.lcsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                              </button>
                            </div>
                          )}

                          {node.operations?.map((op, idx) => (
                            <div
                              key={`${node.id}-op-${idx}`}
                              className={`tree-node nested ${activeTreeNode === `${node.id}-op-${idx}` ? 'active' : ''}`}
                              onClick={() => setActiveTreeNode(`${node.id}-op-${idx}`)}
                            >
                              <div className="tree-icon"><Activity size={14} /></div>
                              <span style={{ textTransform: 'capitalize' }}>{op.type} (R: {op.radius})</span>
                            </div>
                          ))}

                          {/* Render children of this part */}
                          {nodes.filter(child => child.parentId === node.id).map((child) => (
                            <React.Fragment key={child.id}>
                              <div
                                className={`tree-node nested ${activeNodeId === child.id ? 'active' : ''}`}
                                onClick={() => setActiveNodeId(child.id)}
                                style={{ opacity: child.visible ? 1 : 0.5, borderLeft: '2px solid #334155' }}
                              >
                                <span onClick={(e) => { e.stopPropagation(); setNodes(prev => prev.map(n => n.id === child.id ? { ...n, expanded: !n.expanded } : n)); }} style={{ cursor: 'pointer', marginRight: '4px', display: 'flex', alignItems: 'center', color: '#64748b' }}>
                                  {child.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                                <div className="tree-icon">
                                  {['box', 'extrude'].includes(child.type) && <Box size={16} />}
                                  {['cylinder', 'revolve'].includes(child.type) && <CylinderIcon size={16} />}
                                  {child.type === 'sphere' && <Circle size={16} />}
                                  {child.type === 'lcs_plane' && <Focus size={16} />}
                                  {child.type === 'sketch' && <PenTool size={16} />}
                                </div>
                                <span style={{ textTransform: 'capitalize', flex: 1 }}>
                                  {child.name || child.type}
                                </span>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  [{child.transform.position.map(p => p.toFixed(0)).join(',')}]
                                </div>
                                <button
                                  className="icon-btn"
                                  title={child.visible ? "Hide" : "Show"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNodes(prev => prev.map(n => n.id === child.id ? { ...n, visible: !n.visible } : n));
                                  }}
                                  style={{ padding: '2px', marginLeft: '4px', background: 'transparent', border: 'none', color: child.visible ? '#94a3b8' : '#f43f5e', cursor: 'pointer' }}
                                >
                                  {child.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                              </div>

                              {child.expanded && (
                                <>
                                  {child.type !== 'lcs_plane' && (
                                    <div
                                      className={`tree-node nested`}
                                      style={{ opacity: child.lcsVisible ? 1 : 0.5, paddingLeft: '3rem', borderLeft: '2px solid #334155' }}
                                    >
                                      <div className="tree-icon" style={{ marginLeft: '14px' }}><Focus size={14} /></div>
                                      <span style={{ flex: 1, fontStyle: 'italic', fontSize: '0.85em', color: '#94a3b8' }}>Local Coordinate System</span>
                                      <button
                                        className="icon-btn"
                                        title={child.lcsVisible ? "Hide" : "Show"}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setNodes(prev => prev.map(n => n.id === child.id ? { ...n, lcsVisible: !n.lcsVisible } : n));
                                        }}
                                        style={{ padding: '2px', marginLeft: '4px', background: 'transparent', border: 'none', color: child.lcsVisible ? '#94a3b8' : '#f43f5e', cursor: 'pointer' }}
                                      >
                                        {child.lcsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                                      </button>
                                    </div>
                                  )}

                                  {child.operations?.map((op, idx) => (
                                    <div
                                      key={`${child.id}-op-${idx}`}
                                      className={`tree-node nested ${activeTreeNode === `${child.id}-op-${idx}` ? 'active' : ''}`}
                                      onClick={() => setActiveTreeNode(`${child.id}-op-${idx}`)}
                                      style={{ paddingLeft: '3rem' }}
                                    >
                                      <div className="tree-icon"><Activity size={14} /></div>
                                      <span style={{ textTransform: 'capitalize' }}>{op.type} (R: {op.radius})</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </React.Fragment>
                          ))}
                        </>
                      )}

                    </React.Fragment>
                  ))
                ) : (
                  <div style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b', textAlign: 'center', fontStyle: 'italic' }}>
                    No base geometry active
                  </div>
                )}
              </div>
            </div>

            <div className="properties-panel">
              <div className="tree-header">
                <Focus size={18} />
                Properties
              </div>
              <div className="properties-content">
                {!activeNode ? (
                  <div style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b', textAlign: 'center', fontStyle: 'italic' }}>
                    Select a node in the Project Tree to edit its properties.
                  </div>
                ) : activeTreeNode.includes('-op-') ? (
                  <div style={{ padding: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                      FILLET Parameters
                    </div>
                    <div className="input-group">
                      <label>Radius</label>
                      <input
                        type="number"
                        step="0.1"
                        value={(() => {
                          const parts = activeTreeNode.split('-op-');
                          const nodeId = parts[0];
                          const opIdx = parseInt(parts[1]);
                          const node = nodes.find(n => n.id === nodeId);
                          return node?.operations[opIdx]?.radius || 0;
                        })()}
                        onChange={(e) => {
                          const parts = activeTreeNode.split('-op-');
                          const nodeId = parts[0];
                          const opIdx = parseInt(parts[1]);
                          const newRadius = parseFloat(e.target.value);
                          if (!isNaN(newRadius)) {
                            setNodes(prev => {
                              const idx = prev.findIndex(n => n.id === nodeId);
                              if (idx === -1) return prev;
                              const newNodes = [...prev];
                              const newOps = [...newNodes[idx].operations];
                              newOps[opIdx].radius = newRadius;
                              newNodes[idx] = { ...newNodes[idx], operations: newOps };
                              return newNodes;
                            });
                          }
                        }}
                        onBlur={() => setGenerateTrigger(prev => prev + 1)}
                        onKeyDown={(e) => e.key === 'Enter' && setGenerateTrigger(prev => prev + 1)}
                      />
                    </div>
                  </div>
                ) : activeNode.type === 'sketch' ? (
                  <div style={{ padding: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                      Base Sketch
                    </div>
                    <button
                      className="btn outline-btn"
                      style={{ width: '100%', padding: '0.4rem', marginTop: '0.5rem', borderColor: '#38bdf8', color: '#38bdf8' }}
                      onClick={() => {
                        if ((activeNode.params as any)?.lines && cadViewerRef.current) {
                          cadViewerRef.current.loadSketch((activeNode.params as any).lines, ((activeNode.params as any).plane || 'xy') as 'xy' | 'xz' | 'yz');
                          setIsEditingSketch(true);
                          setActiveTab('sketch');
                          setActiveTool('sketch_line');
                        }
                      }}
                    >
                      <GridIcon size={16} /> Edit Sketch Points
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                      {activeNode.type.toUpperCase()} Parameters
                    </div>
                    {activeNode.type === 'extrude' && (
                      <>
                        <div className="input-group">
                          <label>Extrusion Depth</label>
                          <input
                            type="number"
                            value={(activeNode.params as any).depth || 50}
                            onChange={(e) => {
                              const newDepth = parseFloat(e.target.value);
                              if (!isNaN(newDepth)) {
                                setActiveConfig((prev: SceneNode) => ({
                                  ...prev,
                                  params: { ...prev.params, depth: newDepth }
                                }));
                              }
                            }}
                            onBlur={() => setGenerateTrigger(prev => prev + 1)}
                            onKeyDown={(e) => e.key === 'Enter' && setGenerateTrigger(prev => prev + 1)}
                          />
                        </div>
                        <div className="input-group" style={{ marginTop: '0.5rem' }}>
                          <label>Sweep Direction</label>
                          <button
                            className={`btn outline-btn ${activeTool === 'select_sweep_path' ? 'active' : ''}`}
                            style={{ width: '100%', padding: '0.4rem', borderColor: activeTool === 'select_sweep_path' ? '#f59e0b' : '#38bdf8', color: activeTool === 'select_sweep_path' ? '#f59e0b' : '#38bdf8' }}
                            onClick={() => setActiveTool(activeTool === 'select_sweep_path' ? 'select' : 'select_sweep_path')}
                          >
                            {activeTool === 'select_sweep_path' ? 'Select 3D Edge...' : ((activeNode.params as any).sweepVector ? 'Change Custom Vector' : 'Set Custom Vector')}
                          </button>
                          {(activeNode.params as any).sweepVector && (
                            <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '4px' }}>
                              Custom Vector Applied: [{(activeNode.params as any).sweepVector.map((v: number) => v.toFixed(2)).join(', ')}]
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {activeNode.type === 'revolve' && (
                      <>
                        <div className="input-group">
                          <label>Revolution Angle</label>
                          <input
                            type="number"
                            value={(activeNode.params as any).angle || 360}
                            onChange={(e) => {
                              const newAngle = parseFloat(e.target.value);
                              if (!isNaN(newAngle)) {
                                setActiveConfig((prev: SceneNode) => ({
                                  ...prev,
                                  params: { ...prev.params, angle: newAngle }
                                }));
                              }
                            }}
                            onBlur={() => setGenerateTrigger(prev => prev + 1)}
                            onKeyDown={(e) => e.key === 'Enter' && setGenerateTrigger(prev => prev + 1)}
                          />
                        </div>
                        <div className="input-group" style={{ marginTop: '0.5rem' }}>
                          <label>Axis of Revolution</label>
                          <button
                            className={`btn outline-btn ${activeTool === 'select_sweep_path' ? 'active' : ''}`}
                            style={{ width: '100%', padding: '0.4rem', borderColor: activeTool === 'select_sweep_path' ? '#f59e0b' : '#38bdf8', color: activeTool === 'select_sweep_path' ? '#f59e0b' : '#38bdf8' }}
                            onClick={() => setActiveTool(activeTool === 'select_sweep_path' ? 'select' : 'select_sweep_path')}
                          >
                            {activeTool === 'select_sweep_path' ? 'Select 3D Edge/Line...' : ((activeNode.params as any).sweepVector ? 'Change Custom Axis' : 'Set Custom Axis')}
                          </button>
                          {(activeNode.params as any).sweepVector && (
                            <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '4px' }}>
                              Custom Axis Applied: [{(activeNode.params as any).sweepVector.map((v: number) => v.toFixed(2)).join(', ')}]
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {activeNode.type !== 'extrude' && activeNode.type !== 'revolve' && (
                      <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No interactive properties for this shape type yet.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', inset: 0, zIndex: activeViewTab === 'settings' ? 1 : 0, visibility: activeViewTab === 'settings' ? 'visible' : 'hidden', background: '#0f172a', overflowY: 'auto' }}>
            <SettingsPanel />
          </div>
        </div>
      </div>
    </div >
  );
}

export default App;
