import { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu, MenuItemConstructorOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    show: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: false,
    },
  })

  win.maximize()
  win.show()

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL('app://-/index.html')
  }

  // Auto-open dev tools for debugging
  win.webContents.openDevTools()

  // Pipe frontend console logs to the backend terminal
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[Frontend]: ${message}`);
  });

  // Setup Application Menu
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import File...',
          click: () => {
            win?.webContents.send('import-file')
          }
        },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            {
              label: 'Export as .STEP',
              click: () => win?.webContents.send('export-shape', 'step')
            },
            {
              label: 'Export as .IGES',
              click: () => win?.webContents.send('export-shape', 'iges')
            },
            {
              label: 'Export as .BREP',
              click: () => win?.webContents.send('export-shape', 'brep')
            },
            {
              label: 'Export as .STL',
              click: () => win?.webContents.send('export-shape', 'stl')
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Exit',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            win?.webContents.send('undo-action')
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          click: () => {
            win?.webContents.send('redo-action')
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    // request.url is "app://-/index.html"
    const url = request.url.slice('app://-'.length)
    const decodedUrl = decodeURI(url)
    const filePath = path.join(RENDERER_DIST, decodedUrl.replace(/^\//, ''))
    console.log(`[Protocol app://] Intercepted: url=${request.url}, routing to file://${filePath}`)
    return net.fetch('file://' + filePath)
  })

  createWindow()

  ipcMain.handle('export-stl', async (_event, stlData: string, defaultName: string) => {
    if (!win) return { success: false, error: 'No window available' }

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export STL',
      defaultPath: defaultName || 'shape.stl',
      filters: [
        { name: 'STL Files', extensions: ['stl'] }
      ]
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    try {
      fs.writeFileSync(filePath, stlData)
      return { success: true, filePath }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('export-file-buffer', async (_event, fileData: Uint8Array, extension: string) => {
    if (!win) return { success: false, error: 'No window available' }

    const defaultName = `export.${extension}`

    let filters: { name: string, extensions: string[] }[] = []
    if (extension === 'step') filters = [{ name: 'STEP Files', extensions: ['step', 'stp'] }]
    else if (extension === 'iges') filters = [{ name: 'IGES Files', extensions: ['iges', 'igs'] }]
    else if (extension === 'brep') filters = [{ name: 'BRep Files', extensions: ['brep'] }]
    else if (extension === 'stl') filters = [{ name: 'STL Files', extensions: ['stl'] }]

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: `Export ${extension.toUpperCase()}`,
      defaultPath: defaultName,
      filters: filters
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    try {
      fs.writeFileSync(filePath, Buffer.from(fileData))
      return { success: true, filePath }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('get-wasm-buffer', async () => {
    try {
      let wasmPath = path.join(RENDERER_DIST, 'opencascade.wasm.wasm')
      // If the path is inside app.asar, we mapped it to app.asar.unpacked in electron-builder config
      if (wasmPath.includes('app.asar')) {
        wasmPath = wasmPath.replace('app.asar', 'app.asar.unpacked')
      }

      const buffer = fs.readFileSync(wasmPath)
      // Convert Node Buffer to standard ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    } catch (e) {
      console.error('Failed to read WASM:', e)
      return null
    }
  })

  ipcMain.handle('get-settings', async () => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    try {
      if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      }
    } catch (e) {
      console.error('Failed to read settings:', e)
    }
    return {}
  })

  ipcMain.handle('save-settings', async (_event, settings: Record<string, unknown>) => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      return { success: true }
    } catch (e) {
      console.error('Failed to save settings:', e)
      return { success: false, error: String(e) }
    }
  })
})
