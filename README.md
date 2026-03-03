# Electron OCCT CAD

An interactive 3D Computer-Aided Design (CAD) application built with React, Three.js, Electron, OpenCascade.js, and a 2D Constraint Solver.

## Features

* **Real-time 3D Rendering**: Powered by `@react-three/fiber` and `@react-three/drei`.
* **CAD Kernel**: True Boundary Representation (BRep) solid modeling using WebAssembly compiled OpenCascade (`opencascade.js`).
* **Parametric Sketching**: Robust 2D geometric constraint solving utilizing `@salusoft89/planegcs` for fully parametric CAD drafting.
* **Desktop Native**: Packaged as a fast, offline-capable Electron application.
* **Interactive Tooling**: Parameter-driven geometry generation, interactive sketching, sweeping, filleting, and chamfering.
* **Transform Gizmos**: Custom Local Coordinate System manipulation.

## Development

```bash
# Install dependencies
npm install

# Run the Electron dev environment
npm run dev

# Build the application
npm run build
```
