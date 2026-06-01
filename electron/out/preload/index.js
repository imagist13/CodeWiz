"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  backendFetch: (url, options) => electron.ipcRenderer.invoke("backend:fetch", url, options),
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url),
  openFile: (options) => electron.ipcRenderer.invoke("dialog:openFile", options),
  saveFile: (options) => electron.ipcRenderer.invoke("dialog:saveFile", options),
  getAppPath: (name) => electron.ipcRenderer.invoke("app:getPath", name),
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
  windowMinimize: () => electron.ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => electron.ipcRenderer.invoke("window:maximize"),
  windowClose: () => electron.ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => electron.ipcRenderer.invoke("window:isMaximized")
});
