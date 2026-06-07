// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
  },
  // Resolve a dropped/selected File's real filesystem path. Electron 32+ removed
  // the renderer-side `File.path`, so consumers must ask via webUtils.
  fs: {
    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file) || '';
      } catch {
        return '';
      }
    },
  },
  shell: {
    openPath: (folderPath: string) => ipcRenderer.invoke('shell:open-path', folderPath),
  },
  dialog: {
    openFolder: (options?: { defaultPath?: string; title?: string }) =>
      ipcRenderer.invoke('dialog:open-folder', options),
  },
  install: {
    checkPrerequisites: () => ipcRenderer.invoke('install:check-prerequisites'),
    start: () => ipcRenderer.invoke('install:start'),
    cancel: () => ipcRenderer.invoke('install:cancel'),
    getLogs: () => ipcRenderer.invoke('install:get-logs'),
    installGit: () => ipcRenderer.invoke('install:git'),
    onProgress: (callback: (data: unknown) => void) => {
      const listener = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('install:progress', listener);
      return () => { ipcRenderer.removeListener('install:progress', listener); };
    },
  },
  bridge: {
    isActive: () => ipcRenderer.invoke('bridge:is-active'),
  },
  proxy: {
    resolve: (url: string) => ipcRenderer.invoke('proxy:resolve', url),
  },
  widget: {
    exportPng: (html: string, width: number, isDark: boolean) =>
      ipcRenderer.invoke('widget:export-png', { html, width, isDark }),
  },
  artifact: {
    // Phase 3 long-shot export: render HTML in a hidden BrowserWindow and
    // capture a full-page PNG via CDP captureBeyondViewport. Returns a
    // discriminated result — callers pattern-match on `.error` vs `.base64`.
    exportLongShot: (params: {
      html: string;
      width: number;
      pixelRatio?: number;
      outPath?: string;
      maxHeightPx?: number;
      timeoutMs?: number;
    }) => ipcRenderer.invoke('artifact:export-long-shot', params),
  },
  terminal: {
    create: (opts: { id: string; cwd: string; cols: number; rows: number }) =>
      ipcRenderer.invoke('terminal:create', opts),
    write: (id: string, data: string) =>
      ipcRenderer.send('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    kill: (id: string) =>
      ipcRenderer.invoke('terminal:kill', id),
    onData: (callback: (data: { id: string; data: string }) => void) => {
      const listener = (_event: unknown, data: { id: string; data: string }) => callback(data);
      ipcRenderer.on('terminal:data', listener);
      return () => { ipcRenderer.removeListener('terminal:data', listener); };
    },
    onExit: (callback: (data: { id: string; code: number }) => void) => {
      const listener = (_event: unknown, data: { id: string; code: number }) => callback(data);
      ipcRenderer.on('terminal:exit', listener);
      return () => { ipcRenderer.removeListener('terminal:exit', listener); };
    },
  },
  notification: {
    show: (options: { title: string; body: string; onClick?: unknown }) =>
      ipcRenderer.invoke('notification:show', options),
    onClick: (callback: (action: { type: string; payload: string }) => void) => {
      const listener = (_event: unknown, action: { type: string; payload: string }) => callback(action);
      ipcRenderer.on('notification:click', listener);
      return () => { ipcRenderer.removeListener('notification:click', listener); };
    },
  },
});
