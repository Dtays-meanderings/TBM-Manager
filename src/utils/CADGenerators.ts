import * as THREE from 'three';

export const resolvePrimitives = (ocAny: any, type: string, params: any) => {
    let currentShape = null;
    if (type === 'box') {
        const makeBox = new ocAny.BRepPrimAPI_MakeBox_1(params.width, params.height, params.depth);
        currentShape = makeBox.Shape();
        makeBox.delete();
    } else if (type === 'cylinder') {
        const makeCyl = new ocAny.BRepPrimAPI_MakeCylinder_1(params.radius, params.height);
        currentShape = makeCyl.Shape();
        makeCyl.delete();
    } else if (type === 'sphere') {
        const makeSph = new ocAny.BRepPrimAPI_MakeSphere_1(params.radius);
        currentShape = makeSph.Shape();
        makeSph.delete();
    }
    return currentShape;
};

export const resolveImport = (ocAny: any, type: string, nodeFileData: Uint8Array, nodeId: string) => {
    let currentShape = null;
    const filename = `uploaded_node_${nodeId}.${type} `;
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
    return currentShape;
};

export const resolveExtrude = (ocAny: any, nodes: any[], params: any) => {
    let currentShape = null;
    if (!params.sourceSketchId) return null;
    const sourceSketch = nodes.find(n => n.id === params.sourceSketchId);
    const pLines = sourceSketch?.params?.lines;

    if (!sourceSketch) {
        console.error(`Error: Source sketch ${params.sourceSketchId} not found in nodes array.`);
        return null;
    }
    if (!pLines || pLines.length === 0) {
        console.warn(`Extrude: pLines is empty for sourceSketchId: ${params.sourceSketchId} `);
        return null;
    }
    const plane = sourceSketch?.params?.plane || 'xy';
    let depth = params.depth;
    depth = (typeof depth === 'number' && !isNaN(depth)) ? depth : 50;
    if (Math.abs(depth) < 0.001) depth = 0.001;
    const sortedLines = [];
    const remaining = [...pLines];
    sortedLines.push(remaining.shift());
    const dist = (p1: any, p2: any) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    while (remaining.length > 0) {
        const lastPt = sortedLines[sortedLines.length - 1].end;
        const nextIdx = remaining.findIndex((l: any) => dist(l.start, lastPt) < 1e-4 || dist(l.end, lastPt) < 1e-4);
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
        vertices.forEach((v: any) => {
            const p = new ocAny.gp_Pnt_1();
            p.SetCoord_2(v.x, v.y, v.z);
            makePoly.Add_1(p);
            p.delete();
        });
        makePoly.Close();

        if (!makePoly.IsDone()) {
            console.error("Extrude: MakePolygon failed");
            return null;
        }

        const wire = makePoly.Wire();
        const faceB = new ocAny.BRepBuilderAPI_MakeFace_15(wire, false);

        if (!faceB.IsDone()) {
            console.error("Extrude: MakeFace failed");
            faceB.delete(); wire.delete(); makePoly.delete();
            return null;
        }

        const face = faceB.Face();
        let mx = 0, my = 0, mz = depth;
        if (params.sweepVector) {
            const sv = params.sweepVector;
            const len = Math.sqrt(sv[0] * sv[0] + sv[1] * sv[1] + sv[2] * sv[2]);
            if (len > 0) {
                mx = (sv[0] / len) * depth;
                my = (sv[1] / len) * depth;
                mz = (sv[2] / len) * depth;
            }
        } else {
            if (plane === 'xz') { mx = 0; my = depth; mz = 0; }
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
        faceB.delete(); wire.delete(); makePoly.delete();
    } catch (err: unknown) {
        console.error(`Extrude WASM CRASH: ${err instanceof Error ? err.message : String(err)} `);
    }
    return currentShape;
};

export const resolveRevolve = (ocAny: any, nodes: any[], params: any) => {
    let currentShape = null;
    if (!params.sourceSketchId) return null;
    const sourceSketch = nodes.find(n => n.id === params.sourceSketchId);
    const pLines = sourceSketch?.params?.lines;
    if (!pLines || pLines.length === 0) return null;

    const plane = params.plane || 'xy';
    const sortedLines = [];
    const remaining = [...pLines];
    sortedLines.push(remaining.shift());
    const dist = (p1: any, p2: any) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    while (remaining.length > 0) {
        const lastPt = sortedLines[sortedLines.length - 1].end;
        const nextIdx = remaining.findIndex((l: any) => dist(l.start, lastPt) < 1e-4 || dist(l.end, lastPt) < 1e-4);
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
        vertices.forEach((v: any) => {
            const p = new ocAny.gp_Pnt_1();
            p.SetCoord_2(v.x, v.y, v.z);
            makePoly.Add_1(p);
            p.delete();
        });
        makePoly.Close();

        if (!makePoly.IsDone()) {
            console.error("Revolve: MakePolygon failed");
            return null;
        }

        const wire = makePoly.Wire();
        const faceB = new ocAny.BRepBuilderAPI_MakeFace_15(wire, false);

        if (!faceB.IsDone()) {
            console.error("Revolve: MakeFace failed.");
            return null;
        }
        const face = faceB.Face();
        let minX = Infinity, minY = Infinity;
        vertices.forEach((v: any) => {
            if (v.x < minX) minX = v.x;
            if (v.y < minY) minY = v.y;
        });

        const pnt = new ocAny.gp_Pnt_1();
        pnt.SetCoord_2(0, minY - 1, 0);
        let dir = new ocAny.gp_Dir_4(1, 0, 0);

        if (params.axis) {
            const pv = params.axis.pivot || [0, minY - 1, 0];
            const dv = params.axis.dir || [1, 0, 0];
            pnt.SetCoord_2(pv[0], pv[1], pv[2]);
            const len = Math.sqrt(dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]);
            if (len > 0) dir = new ocAny.gp_Dir_4(dv[0] / len, dv[1] / len, dv[2] / len);
        } else if (params.sweepVector) {
            const sv = params.sweepVector;
            const len = Math.sqrt(sv[0] * sv[0] + sv[1] * sv[1] + sv[2] * sv[2]);
            if (len > 0) dir = new ocAny.gp_Dir_4(sv[0] / len, sv[1] / len, sv[2] / len);
        } else if (plane === 'xy' || plane === 'xz') {
            pnt.SetCoord_2(0, minY - 1, 0);
            dir = new ocAny.gp_Dir_4(1, 0, 0);
        } else if (plane === 'yz') {
            pnt.SetCoord_2(0, 0, minY - 1);
            dir = new ocAny.gp_Dir_4(0, 0, 1);
        }
        const ax1 = new ocAny.gp_Ax1_2(pnt, dir);
        const angleDef = (params.angle !== undefined ? params.angle : 360) * (Math.PI / 180);
        const revol = new ocAny.BRepPrimAPI_MakeRevol_1(face, ax1, angleDef, false);

        if (!revol.IsDone()) {
            console.error("Revolve: MakeRevol failed. Angle: " + angleDef);
        } else {
            currentShape = revol.Shape();
        }
        face.delete(); pnt.delete(); dir.delete(); ax1.delete(); revol.delete();
        makePoly.delete(); faceB.delete(); wire.delete();
    } catch (err: unknown) {
        console.error(`Revolve WASM CRASH: ${err instanceof Error ? err.message : String(err)} `);
    }
    return currentShape;
};

export const resolveBoolean = (ocAny: any, params: any, buildShapeCache: (id: string) => any) => {
    let currentShape = null;
    const targetShape = buildShapeCache(params.targetId);
    const toolShape = buildShapeCache(params.toolId);
    if (targetShape && toolShape) {
        let boolOp;
        if (params.operation === 'cut') boolOp = new ocAny.BRepAlgoAPI_Cut_3(targetShape, toolShape);
        else if (params.operation === 'fuse') boolOp = new ocAny.BRepAlgoAPI_Fuse_3(targetShape, toolShape);
        else if (params.operation === 'common') boolOp = new ocAny.BRepAlgoAPI_Common_3(targetShape, toolShape);

        if (boolOp) {
            boolOp.Build();
            if (boolOp.IsDone()) {
                currentShape = boolOp.Shape();
            } else {
                console.warn(`Boolean ${params.operation} failed between ${params.targetId} and ${params.toolId} `);
                currentShape = new ocAny.TopoDS_Shape_2(targetShape);
            }
            boolOp.delete();
        }
    } else if (targetShape) {
        currentShape = targetShape;
    }
    if (targetShape) targetShape.delete();
    if (toolShape) toolShape.delete();
    return currentShape;
};

export const resolveOperations = (ocAny: any, currentShape: any, node: any) => {
    const nodeOperations = node.operations || [];
    if (nodeOperations && nodeOperations.length > 0) {
        for (const op of nodeOperations) {
            if (op.type === 'fillet') {
                const mkFillet: any = new ocAny.BRepFilletAPI_MakeFillet_1(currentShape, 0);
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
    return currentShape;
}

export const resolveTransform = (ocAny: any, currentShape: any, node: any, nodes?: any[]) => {
    const applySingleTransform = (shape: any, transformDef: any) => {
        const trsf = new ocAny.gp_Trsf_1();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transformDef.rotation));
        const ocQ = new ocAny.gp_Quaternion_2(q.x, q.y, q.z, q.w);
        trsf.SetRotation_2(ocQ);
        const vT = new ocAny.gp_Vec_4(transformDef.position[0], transformDef.position[1], transformDef.position[2]);
        trsf.SetTranslationPart(vT);

        const gTrsf = new ocAny.gp_GTrsf_2(trsf);
        gTrsf.SetValue(1, 1, gTrsf.Value(1, 1) * transformDef.scale[0]);
        gTrsf.SetValue(2, 2, gTrsf.Value(2, 2) * transformDef.scale[1]);
        gTrsf.SetValue(3, 3, gTrsf.Value(3, 3) * transformDef.scale[2]);

        const transformSys = new ocAny.BRepBuilderAPI_GTransform_2(shape, gTrsf, true);
        const transformedShape = transformSys.Shape();

        transformSys.delete(); vT.delete(); ocQ.delete(); trsf.delete(); gTrsf.delete();
        return transformedShape;
    };

    const nodeTransform = node.transform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

    // Apply local coordinates
    let nextShape = applySingleTransform(currentShape, nodeTransform);
    currentShape.delete();

    // Bubble up to parent coordinates (Standard World Tree hierarchy)
    if (node.parentId && nodes) {
        const parent = nodes.find(n => n.id === node.parentId);
        if (parent && parent.transform) {
            const upShape = applySingleTransform(nextShape, parent.transform);
            nextShape.delete();
            nextShape = upShape;
        }
    }

    return nextShape;
}
