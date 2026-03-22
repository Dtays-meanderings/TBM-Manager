import { CadOperation } from './components/CadViewer';

export type ShapeType = 'box' | 'cylinder' | 'sphere' | 'step' | 'iges' | 'brep' | 'stl' | 'extrude' | 'revolve' | 'lcs_plane' | 'none' | 'sketch' | 'part' | 'boolean';

export type ActiveTool = 'select' | 'measure' | 'sketch_plane' | 'sketch_point' | 'sketch_line' | 'transform_translate' | 'transform_rotate' | 'constrain_dimension' | 'constrain_horizontal_dist' | 'constrain_vertical_dist' | 'constrain_distance' | 'constrain_radius_diameter' | 'constrain_radius' | 'constrain_diameter' | 'constrain_angle' | 'constrain_lock' | 'constrain_coincident' | 'constrain_point_on_object' | 'constrain_horizontal' | 'constrain_vertical' | 'constrain_parallel' | 'constrain_perpendicular' | 'constrain_tangent' | 'constrain_equal' | 'constrain_symmetric' | 'constrain_block' | 'constrain_refraction' | 'constrain_toggle_driving' | 'constrain_toggle_active' | 'select_sweep_path' | 'edit_revolve_axis';

export type SceneNode = {
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

