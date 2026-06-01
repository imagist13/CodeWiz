import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import log from 'electron-log/main'
import { is } from '@electron-toolkit/utils'

log.initialize()
log.transports.file.level = 'info'
log.info('Hermes starting...')

process.on('uncaughtException', (err) => log.error('Uncaught Exception:', err))
process.on('unhandledRejection', (err) => log.error('Unhandled Rejection:', err))

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let backendProcess: ReturnType<typeof spawn> | null = null
let isQuitting = false
// Tracks the active SSE HTTP request for the current BrowserWindow.
// Key: webContentsId, Value: the active http.ClientRequest
const _activeSSE: Map<number, import('http').ClientRequest> = new Map()

const BACKEND_PORT = 1478
const BACKEND_HOST = '127.0.0.1'

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function getRendererURL(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL']
  }
  return `file://${join(__dirname, '../renderer/index.html')}`
}

function createWindow(): void {
  log.info('Creating main window')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Hermes',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.loadURL(getRendererURL())

  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Hermes',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Hermes')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

async function checkBackendRunning(): Promise<boolean> {
  try {
    const http = await import('http')
    return new Promise((resolve) => {
      const req = http.get(`http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(1000, () => {
        req.destroy()
        resolve(false)
      })
    })
  } catch {
    return false
  }
}

function startBackend(): void {
  const rootDir = is.dev
    ? join(__dirname, '../../')
    : join(app.getAppPath(), '../')

  const pythonExec = process.platform === 'win32' ? 'python' : 'python3'
  const scriptPath = join(rootDir, 'backend', 'run.py')

  log.info(`Starting backend: ${pythonExec} ${scriptPath}`)

  backendProcess = spawn(pythonExec, [scriptPath], {
    cwd: join(rootDir, 'backend'),
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  backendProcess.stdout?.on('data', (data) => {
    log.info(`[Backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr?.on('data', (data) => {
    log.error(`[Backend Error] ${data.toString().trim()}`)
  })

  backendProcess.on('exit', (code) => {
    if (!isQuitting) {
      log.warn(`Backend exited with code ${code}, restarting in 3s...`)
      setTimeout(startBackend, 3000)
    }
  })
}

function setupIPC(): void {
  ipcMain.handle('backend:fetch', async (_event, url: string, options?: RequestInit) => {
    try {
      const http = await import('http')
      const base = `http://${BACKEND_HOST}:${BACKEND_PORT}`

      let targetPath: string
      if (url.startsWith('http')) {
        const parsed = new URL(url)
        targetPath = parsed.pathname + parsed.search
      } else {
        targetPath = url.startsWith('/') ? url : `/${url}`
      }

      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: targetPath,
          method: options?.method || 'GET',
          headers: options?.headers as Record<string, string>
        }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString()
            })
          })
        })
        req.on('error', reject)
        req.setTimeout(5000, () => {
          req.destroy()
          reject(new Error('Request timeout'))
        })
        if (options?.body) {
          req.write(options.body)
        }
        req.end()
      })
    } catch (err) {
      log.error('Backend fetch error:', err)
      throw err
    }
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    return shell.openExternal(url)
  })

  // Abort the active SSE request for a BrowserWindow — destroys the connection immediately.
  ipcMain.on('backend:sse:abort', (event) => {
    const req = _activeSSE.get(event.sender.id)
    if (req) {
      req.destroy()
      _activeSSE.delete(event.sender.id)
      log.info('SSE request aborted by renderer')
    }
  })

  // Streaming SSE chat through main process (bypasses renderer sandbox)
  ipcMain.handle('backend:sse', async (event, body: { message: string; conversation_id?: string; username: string; new_engine?: boolean }) => {
    const http = await import('http')
    const baseUrl = `http://${BACKEND_HOST}:${BACKEND_PORT}`

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        message: body.message,
        conversation_id: body.conversation_id,
        username: body.username || 'default',
        new_engine: body.new_engine !== false,
      })

      const req = http.request({
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        res.on('data', (chunk: Buffer) => {
          event.sender.send('backend:sse:chunk', chunk.toString())
        })
        res.on('end', () => {
          _activeSSE.delete(event.sender.id)
          event.sender.send('backend:sse:end')
          resolve(null)
        })
        res.on('error', (err) => {
          _activeSSE.delete(event.sender.id)
          event.sender.send('backend:sse:error', err.message)
          reject(err)
        })
      })

      req.on('error', (err) => {
        _activeSSE.delete(event.sender.id)
        event.sender.send('backend:sse:error', err.message)
        reject(err)
      })

      req.setTimeout(120000, () => {
        req.destroy()
        _activeSSE.delete(event.sender.id)
        event.sender.send('backend:sse:error', 'Request timeout')
        reject(new Error('Request timeout'))
      })

      // Track this request so abortSSE can destroy it.
      _activeSSE.set(event.sender.id, req)

      req.write(postData)
      req.end()
    })
  })

  ipcMain.handle('dialog:openFile', async (_event, options?: Electron.OpenDialogOptions) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, options || {})
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('dialog:saveFile', async (_event, options?: Electron.SaveDialogOptions) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, options || {})
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('app:getPath', (_event, name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => {
    return app.getPath(name)
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())
}

app.whenReady().then(async () => {
  log.info('App ready')

  const running = await checkBackendRunning()
  if (!running) {
    if (is.dev) {
      log.warn('Backend not running in dev mode — make sure `pnpm run dev` started the backend concurrently')
    } else {
      startBackend()
      // Wait for backend to become ready (max 15s)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500))
        if (await checkBackendRunning()) break
      }
    }
  } else {
    log.info('Backend already running')
  }

  setupIPC()
  createWindow()
  createTray()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    mainWindow.show()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  backendProcess?.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
