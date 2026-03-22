import React from 'react';
import { Box, Play, Download, Cylinder as CylinderIcon, Circle, Ruler, MousePointer2, Grid as GridIcon, Focus, Minus, Layers, PenTool, Activity, Link, Type, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter, Maximize2, Copy, Square, Triangle } from 'lucide-react';
import { SceneNode } from '../types';

export interface LeftSidebarProps {
  activeNode: any;
  handleExport: any;
  isEditingSketch: any;
  isOcctReady: any;
  preDraftingPlane: any;
  selectedFeature: any;
  setActiveConfig: any;
  setIsEditingSketch: any;
  setParamErrors: any;
  setPreDraftingPlane: any;
  setSelectedFeature: any;
  activeTab: any;
  setActiveTab: any;
  showGrid: any;
  setShowGrid: any;
  showWCS: any;
  setShowWCS: any;
  showLCS: any;
  setShowLCS: any;
  fileInputRef: any;
  handleFileUpload: any;
  renderMode: any;
  setRenderMode: any;
  activeNodeId: any;
  setActiveNodeId: any;
  activeTool: any;
  setActiveTool: any;
  setDraftingPlane: any;
  cadViewerRef: any;
  nodes: any;
  setNodes: any;
  pushToHistory: any;
  generateTrigger: any;
  setGenerateTrigger: any;
  setOperations: any;
  shapeType: any;
  setShapeType: any;
  widthExpr: any;
  setWidthExpr: any;
  heightExpr: any;
  setHeightExpr: any;
  depthExpr: any;
  setDepthExpr: any;
  radiusExpr: any;
  setRadiusExpr: any;
  paramErrors: any;
  handleGenerate: any;
  selectedSketchElements: any;
  filletRadius: any;
  setFilletRadius: any;
  draftingPlane: any;
  activeViewTab: any;
  setActiveViewTab: any;
}


export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const { activeTab, setActiveTab, showGrid, setShowGrid, showWCS, setShowWCS, showLCS, setShowLCS, fileInputRef, handleFileUpload, renderMode, setRenderMode, setActiveNodeId, activeTool, setActiveTool, setDraftingPlane, cadViewerRef, nodes, setNodes, pushToHistory, setGenerateTrigger, setOperations, activeNode, handleExport, isEditingSketch, isOcctReady, preDraftingPlane, selectedFeature, setActiveConfig, setIsEditingSketch, setParamErrors, setPreDraftingPlane, setSelectedFeature, shapeType, setShapeType, widthExpr, setWidthExpr, heightExpr, setHeightExpr, depthExpr, setDepthExpr, radiusExpr, setRadiusExpr, paramErrors, handleGenerate, filletRadius, setFilletRadius, draftingPlane, } = props;

  // Derive aliases safely


  return (
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
                  setNodes((prev: any) => [
                    ...prev,
                    {
                      id: newPartId,
                      name: `Body ${prev.filter((n: any) => n.type === 'part').length + 1}`,
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
                  setDraftingPlane(null); // Clear active plane explicitly
                  cadViewerRef.current?.clearSketch();
                  cadViewerRef.current?.setIsoView(); // Show grid in 3D initially so they can pick a plane face
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
                    setGenerateTrigger((prev: any) => prev + 1);
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
                    setGenerateTrigger((prev: any) => prev + 1);
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
                    {nodes.filter((n: any) => n.id !== activeNode.id && n.type !== 'sketch' && n.type !== 'none' && n.type !== 'part').map((n: any) => (
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
                        ...prev.map((n: any) => (n.id === activeNode.id || n.id === toolId) ? { ...n, visible: false } : n),
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
                      setGenerateTrigger((prev: any) => prev + 1);
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
                        ...prev.map((n: any) => (n.id === activeNode.id || n.id === toolId) ? { ...n, visible: false } : n),
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
                      setGenerateTrigger((prev: any) => prev + 1);
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
                        ...prev.map((n: any) => (n.id === activeNode.id || n.id === toolId) ? { ...n, visible: false } : n),
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
                      setGenerateTrigger((prev: any) => prev + 1);
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
                {activeTool === 'sketch_plane' && (
                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '5px', marginTop: '5px', marginBottom: '5px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '0.75rem', alignSelf: 'center' }}>Plane:</label>
                    {['XY', 'XZ', 'YZ'].map(plane => (
                      <button
                        key={plane}
                        onClick={() => {
                          setDraftingPlane(plane);
                          if (activeTool !== 'sketch_plane') setActiveTool('sketch_plane');
                        }}
                        style={{
                          flex: 1, padding: '4px', background: draftingPlane === plane ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                          color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem'
                        }}
                      >
                        {plane}
                      </button>
                    ))}
                  </div>
                )}
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
                        setGenerateTrigger((prev: any) => prev + 1);
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
                <input type="text" value={widthExpr} onChange={(e) => { setWidthExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, width: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50 or sqrt(2500)" />
              </div>
              <div className="input-group">
                <label>Height {paramErrors.height && <span className="error-text">({paramErrors.height})</span>}</label>
                <input type="text" value={heightExpr} onChange={(e) => { setHeightExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, height: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50 or cos(0)*50" />
              </div>
              <div className="input-group">
                <label>Depth {paramErrors.depth && <span className="error-text">({paramErrors.depth})</span>}</label>
                <input type="text" value={depthExpr} onChange={(e) => { setDepthExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, depth: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50" />
              </div>
            </>
          )}
          {shapeType === 'cylinder' && (
            <>
              <div className="input-group">
                <label>Radius {paramErrors.radius && <span className="error-text">({paramErrors.radius})</span>}</label>
                <input type="text" value={radiusExpr} onChange={(e) => { setRadiusExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, radius: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 25" />
              </div>
              <div className="input-group">
                <label>Height {paramErrors.height && <span className="error-text">({paramErrors.height})</span>}</label>
                <input type="text" value={heightExpr} onChange={(e) => { setHeightExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, height: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50" />
              </div>
            </>
          )}
          {shapeType === 'sphere' && (
            <div className="input-group">
              <label>Radius {paramErrors.radius && <span className="error-text">({paramErrors.radius})</span>}</label>
              <input type="text" value={radiusExpr} onChange={(e) => { setRadiusExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, radius: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 25" />
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
              <input type="text" value={depthExpr} onChange={(e) => { setDepthExpr(e.target.value); setParamErrors((prev: any) => ({ ...prev, depth: '' })) }} onBlur={handleGenerate} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} placeholder="e.g. 50" />
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
                        setOperations((prev: any) => [...prev, { type: 'fillet', edgeIndex: selectedFeature.index, radius }]);
                        setGenerateTrigger((p: any) => p + 1);
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

  );
};
