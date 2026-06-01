"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const require$$0$5 = require("electron");
const require$$2 = require("path");
const require$$0$1 = require("child_process");
const require$$1 = require("os");
const require$$0 = require("fs");
const require$$0$2 = require("util");
const require$$0$3 = require("events");
const require$$0$4 = require("http");
const require$$1$1 = require("https");
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
const fs$4 = require$$0;
const path$5 = require$$2;
var packageJson$1 = {
  findAndReadPackageJson,
  tryReadJsonAt
};
function findAndReadPackageJson() {
  return tryReadJsonAt(getMainModulePath()) || tryReadJsonAt(extractPathFromArgs()) || tryReadJsonAt(process.resourcesPath, "app.asar") || tryReadJsonAt(process.resourcesPath, "app") || tryReadJsonAt(process.cwd()) || { name: void 0, version: void 0 };
}
function tryReadJsonAt(...searchPaths) {
  if (!searchPaths[0]) {
    return void 0;
  }
  try {
    const searchPath = path$5.join(...searchPaths);
    const fileName = findUp("package.json", searchPath);
    if (!fileName) {
      return void 0;
    }
    const json = JSON.parse(fs$4.readFileSync(fileName, "utf8"));
    const name = json?.productName || json?.name;
    if (!name || name.toLowerCase() === "electron") {
      return void 0;
    }
    if (name) {
      return { name, version: json?.version };
    }
    return void 0;
  } catch (e) {
    return void 0;
  }
}
function findUp(fileName, cwd) {
  let currentPath = cwd;
  while (true) {
    const parsedPath = path$5.parse(currentPath);
    const root = parsedPath.root;
    const dir = parsedPath.dir;
    if (fs$4.existsSync(path$5.join(currentPath, fileName))) {
      return path$5.resolve(path$5.join(currentPath, fileName));
    }
    if (currentPath === root) {
      return null;
    }
    currentPath = dir;
  }
}
function extractPathFromArgs() {
  const matchedArgs = process.argv.filter((arg) => {
    return arg.indexOf("--user-data-dir=") === 0;
  });
  if (matchedArgs.length === 0 || typeof matchedArgs[0] !== "string") {
    return null;
  }
  const userDataDir = matchedArgs[0];
  return userDataDir.replace("--user-data-dir=", "");
}
function getMainModulePath() {
  try {
    return require.main?.filename;
  } catch {
    return void 0;
  }
}
const childProcess = require$$0$1;
const os$3 = require$$1;
const path$4 = require$$2;
const packageJson = packageJson$1;
let NodeExternalApi$1 = class NodeExternalApi {
  appName = void 0;
  appPackageJson = void 0;
  platform = process.platform;
  getAppLogPath(appName = this.getAppName()) {
    if (this.platform === "darwin") {
      return path$4.join(this.getSystemPathHome(), "Library/Logs", appName);
    }
    return path$4.join(this.getAppUserDataPath(appName), "logs");
  }
  getAppName() {
    const appName = this.appName || this.getAppPackageJson()?.name;
    if (!appName) {
      throw new Error(
        "electron-log can't determine the app name. It tried these methods:\n1. Use `electron.app.name`\n2. Use productName or name from the nearest package.json`\nYou can also set it through log.transports.file.setAppName()"
      );
    }
    return appName;
  }
  /**
   * @private
   * @returns {undefined}
   */
  getAppPackageJson() {
    if (typeof this.appPackageJson !== "object") {
      this.appPackageJson = packageJson.findAndReadPackageJson();
    }
    return this.appPackageJson;
  }
  getAppUserDataPath(appName = this.getAppName()) {
    return appName ? path$4.join(this.getSystemPathAppData(), appName) : void 0;
  }
  getAppVersion() {
    return this.getAppPackageJson()?.version;
  }
  getElectronLogPath() {
    return this.getAppLogPath();
  }
  getMacOsVersion() {
    const release = Number(os$3.release().split(".")[0]);
    if (release <= 19) {
      return `10.${release - 4}`;
    }
    return release - 9;
  }
  /**
   * @protected
   * @returns {string}
   */
  getOsVersion() {
    let osName = os$3.type().replace("_", " ");
    let osVersion = os$3.release();
    if (osName === "Darwin") {
      osName = "macOS";
      osVersion = this.getMacOsVersion();
    }
    return `${osName} ${osVersion}`;
  }
  /**
   * @return {PathVariables}
   */
  getPathVariables() {
    const appName = this.getAppName();
    const appVersion = this.getAppVersion();
    const self = this;
    return {
      appData: this.getSystemPathAppData(),
      appName,
      appVersion,
      get electronDefaultDir() {
        return self.getElectronLogPath();
      },
      home: this.getSystemPathHome(),
      libraryDefaultDir: this.getAppLogPath(appName),
      libraryTemplate: this.getAppLogPath("{appName}"),
      temp: this.getSystemPathTemp(),
      userData: this.getAppUserDataPath(appName)
    };
  }
  getSystemPathAppData() {
    const home = this.getSystemPathHome();
    switch (this.platform) {
      case "darwin": {
        return path$4.join(home, "Library/Application Support");
      }
      case "win32": {
        return process.env.APPDATA || path$4.join(home, "AppData/Roaming");
      }
      default: {
        return process.env.XDG_CONFIG_HOME || path$4.join(home, ".config");
      }
    }
  }
  getSystemPathHome() {
    return os$3.homedir?.() || process.env.HOME;
  }
  getSystemPathTemp() {
    return os$3.tmpdir();
  }
  getVersions() {
    return {
      app: `${this.getAppName()} ${this.getAppVersion()}`,
      electron: void 0,
      os: this.getOsVersion()
    };
  }
  isDev() {
    return process.env.NODE_ENV === "development" || process.env.ELECTRON_IS_DEV === "1";
  }
  isElectron() {
    return Boolean(process.versions.electron);
  }
  onAppEvent(_eventName, _handler) {
  }
  onAppReady(handler) {
    handler();
  }
  onEveryWebContentsEvent(eventName, handler) {
  }
  /**
   * Listen to async messages sent from opposite process
   * @param {string} channel
   * @param {function} listener
   */
  onIpc(channel, listener) {
  }
  onIpcInvoke(channel, listener) {
  }
  /**
   * @param {string} url
   * @param {Function} [logFunction]
   */
  openUrl(url, logFunction = console.error) {
    const startMap = { darwin: "open", win32: "start", linux: "xdg-open" };
    const start = startMap[process.platform] || "xdg-open";
    childProcess.exec(`${start} ${url}`, {}, (err) => {
      if (err) {
        logFunction(err);
      }
    });
  }
  setAppName(appName) {
    this.appName = appName;
  }
  setPlatform(platform) {
    this.platform = platform;
  }
  setPreloadFileForSessions({
    filePath,
    // eslint-disable-line no-unused-vars
    includeFutureSession = true,
    // eslint-disable-line no-unused-vars
    getSessions = () => []
    // eslint-disable-line no-unused-vars
  }) {
  }
  /**
   * Sent a message to opposite process
   * @param {string} channel
   * @param {any} message
   */
  sendIpc(channel, message) {
  }
  showErrorBox(title, message) {
  }
};
var NodeExternalApi_1 = NodeExternalApi$1;
const path$3 = require$$2;
const NodeExternalApi2 = NodeExternalApi_1;
let ElectronExternalApi$1 = class ElectronExternalApi extends NodeExternalApi2 {
  /**
   * @type {typeof Electron}
   */
  electron = void 0;
  /**
   * @param {object} options
   * @param {typeof Electron} [options.electron]
   */
  constructor({ electron: electron2 } = {}) {
    super();
    this.electron = electron2;
  }
  getAppName() {
    let appName;
    try {
      appName = this.appName || this.electron.app?.name || this.electron.app?.getName();
    } catch {
    }
    return appName || super.getAppName();
  }
  getAppUserDataPath(appName) {
    return this.getPath("userData") || super.getAppUserDataPath(appName);
  }
  getAppVersion() {
    let appVersion;
    try {
      appVersion = this.electron.app?.getVersion();
    } catch {
    }
    return appVersion || super.getAppVersion();
  }
  getElectronLogPath() {
    return this.getPath("logs") || super.getElectronLogPath();
  }
  /**
   * @private
   * @param {any} name
   * @returns {string|undefined}
   */
  getPath(name) {
    try {
      return this.electron.app?.getPath(name);
    } catch {
      return void 0;
    }
  }
  getVersions() {
    return {
      app: `${this.getAppName()} ${this.getAppVersion()}`,
      electron: `Electron ${process.versions.electron}`,
      os: this.getOsVersion()
    };
  }
  getSystemPathAppData() {
    return this.getPath("appData") || super.getSystemPathAppData();
  }
  isDev() {
    if (this.electron.app?.isPackaged !== void 0) {
      return !this.electron.app.isPackaged;
    }
    if (typeof process.execPath === "string") {
      const execFileName = path$3.basename(process.execPath).toLowerCase();
      return execFileName.startsWith("electron");
    }
    return super.isDev();
  }
  onAppEvent(eventName, handler) {
    this.electron.app?.on(eventName, handler);
    return () => {
      this.electron.app?.off(eventName, handler);
    };
  }
  onAppReady(handler) {
    if (this.electron.app?.isReady()) {
      handler();
    } else if (this.electron.app?.once) {
      this.electron.app?.once("ready", handler);
    } else {
      handler();
    }
  }
  onEveryWebContentsEvent(eventName, handler) {
    this.electron.webContents?.getAllWebContents()?.forEach((webContents) => {
      webContents.on(eventName, handler);
    });
    this.electron.app?.on("web-contents-created", onWebContentsCreated);
    return () => {
      this.electron.webContents?.getAllWebContents().forEach((webContents) => {
        webContents.off(eventName, handler);
      });
      this.electron.app?.off("web-contents-created", onWebContentsCreated);
    };
    function onWebContentsCreated(_, webContents) {
      webContents.on(eventName, handler);
    }
  }
  /**
   * Listen to async messages sent from opposite process
   * @param {string} channel
   * @param {function} listener
   */
  onIpc(channel, listener) {
    this.electron.ipcMain?.on(channel, listener);
  }
  onIpcInvoke(channel, listener) {
    this.electron.ipcMain?.handle?.(channel, listener);
  }
  /**
   * @param {string} url
   * @param {Function} [logFunction]
   */
  openUrl(url, logFunction = console.error) {
    this.electron.shell?.openExternal(url).catch(logFunction);
  }
  setPreloadFileForSessions({
    filePath,
    includeFutureSession = true,
    getSessions = () => [this.electron.session?.defaultSession]
  }) {
    for (const session of getSessions().filter(Boolean)) {
      setPreload(session);
    }
    if (includeFutureSession) {
      this.onAppEvent("session-created", (session) => {
        setPreload(session);
      });
    }
    function setPreload(session) {
      if (typeof session.registerPreloadScript === "function") {
        session.registerPreloadScript({
          filePath,
          id: "electron-log-preload",
          type: "frame"
        });
      } else {
        session.setPreloads([...session.getPreloads(), filePath]);
      }
    }
  }
  /**
   * Sent a message to opposite process
   * @param {string} channel
   * @param {any} message
   */
  sendIpc(channel, message) {
    this.electron.BrowserWindow?.getAllWindows()?.forEach((wnd) => {
      if (wnd.webContents?.isDestroyed() === false && wnd.webContents?.isCrashed() === false) {
        wnd.webContents.send(channel, message);
      }
    });
  }
  showErrorBox(title, message) {
    this.electron.dialog?.showErrorBox(title, message);
  }
};
var ElectronExternalApi_1 = ElectronExternalApi$1;
var electronLogPreload = { exports: {} };
(function(module2) {
  let electron2 = {};
  try {
    electron2 = require("electron");
  } catch (e) {
  }
  if (electron2.ipcRenderer) {
    initialize2(electron2);
  }
  {
    module2.exports = initialize2;
  }
  function initialize2({ contextBridge, ipcRenderer }) {
    if (!ipcRenderer) {
      return;
    }
    ipcRenderer.on("__ELECTRON_LOG_IPC__", (_, message) => {
      window.postMessage({ cmd: "message", ...message });
    });
    ipcRenderer.invoke("__ELECTRON_LOG__", { cmd: "getOptions" }).catch((e) => console.error(new Error(
      `electron-log isn't initialized in the main process. Please call log.initialize() before. ${e.message}`
    )));
    const electronLog = {
      sendToMain(message) {
        try {
          ipcRenderer.send("__ELECTRON_LOG__", message);
        } catch (e) {
          console.error("electronLog.sendToMain ", e, "data:", message);
          ipcRenderer.send("__ELECTRON_LOG__", {
            cmd: "errorHandler",
            error: { message: e?.message, stack: e?.stack },
            errorName: "sendToMain"
          });
        }
      },
      log(...data) {
        electronLog.sendToMain({ data, level: "info" });
      }
    };
    for (const level of ["error", "warn", "info", "verbose", "debug", "silly"]) {
      electronLog[level] = (...data) => electronLog.sendToMain({
        data,
        level
      });
    }
    if (contextBridge && process.contextIsolated) {
      try {
        contextBridge.exposeInMainWorld("__electronLog", electronLog);
      } catch {
      }
    }
    if (typeof window === "object") {
      window.__electronLog = electronLog;
    } else {
      __electronLog = electronLog;
    }
  }
})(electronLogPreload);
var electronLogPreloadExports = electronLogPreload.exports;
const fs$3 = require$$0;
const os$2 = require$$1;
const path$2 = require$$2;
const preloadInitializeFn = electronLogPreloadExports;
let preloadInitialized = false;
let spyConsoleInitialized = false;
var initialize$1 = {
  initialize({
    externalApi: externalApi2,
    getSessions,
    includeFutureSession,
    logger,
    preload = true,
    spyRendererConsole = false
  }) {
    externalApi2.onAppReady(() => {
      try {
        if (preload) {
          initializePreload({
            externalApi: externalApi2,
            getSessions,
            includeFutureSession,
            logger,
            preloadOption: preload
          });
        }
        if (spyRendererConsole) {
          initializeSpyRendererConsole({ externalApi: externalApi2, logger });
        }
      } catch (err) {
        logger.warn(err);
      }
    });
  }
};
function initializePreload({
  externalApi: externalApi2,
  getSessions,
  includeFutureSession,
  logger,
  preloadOption
}) {
  let preloadPath = typeof preloadOption === "string" ? preloadOption : void 0;
  if (preloadInitialized) {
    logger.warn(new Error("log.initialize({ preload }) already called").stack);
    return;
  }
  preloadInitialized = true;
  try {
    preloadPath = path$2.resolve(
      __dirname,
      "../renderer/electron-log-preload.js"
    );
  } catch {
  }
  if (!preloadPath || !fs$3.existsSync(preloadPath)) {
    preloadPath = path$2.join(
      externalApi2.getAppUserDataPath() || os$2.tmpdir(),
      "electron-log-preload.js"
    );
    const preloadCode = `
      try {
        (${preloadInitializeFn.toString()})(require('electron'));
      } catch(e) {
        console.error(e);
      }
    `;
    fs$3.writeFileSync(preloadPath, preloadCode, "utf8");
  }
  externalApi2.setPreloadFileForSessions({
    filePath: preloadPath,
    includeFutureSession,
    getSessions
  });
}
function initializeSpyRendererConsole({ externalApi: externalApi2, logger }) {
  if (spyConsoleInitialized) {
    logger.warn(
      new Error("log.initialize({ spyRendererConsole }) already called").stack
    );
    return;
  }
  spyConsoleInitialized = true;
  const levels = ["debug", "info", "warn", "error"];
  externalApi2.onEveryWebContentsEvent(
    "console-message",
    (event, level, message) => {
      logger.processMessage({
        data: [message],
        level: levels[level],
        variables: { processType: "renderer" }
      });
    }
  );
}
var scope = scopeFactory$1;
function scopeFactory$1(logger) {
  return Object.defineProperties(scope2, {
    defaultLabel: { value: "", writable: true },
    labelPadding: { value: true, writable: true },
    maxLabelLength: { value: 0, writable: true },
    labelLength: {
      get() {
        switch (typeof scope2.labelPadding) {
          case "boolean":
            return scope2.labelPadding ? scope2.maxLabelLength : 0;
          case "number":
            return scope2.labelPadding;
          default:
            return 0;
        }
      }
    }
  });
  function scope2(label) {
    scope2.maxLabelLength = Math.max(scope2.maxLabelLength, label.length);
    const newScope = {};
    for (const level of logger.levels) {
      newScope[level] = (...d) => logger.logData(d, { level, scope: label });
    }
    newScope.log = newScope.info;
    return newScope;
  }
}
let Buffering$1 = class Buffering {
  constructor({ processMessage: processMessage2 }) {
    this.processMessage = processMessage2;
    this.buffer = [];
    this.enabled = false;
    this.begin = this.begin.bind(this);
    this.commit = this.commit.bind(this);
    this.reject = this.reject.bind(this);
  }
  addMessage(message) {
    this.buffer.push(message);
  }
  begin() {
    this.enabled = [];
  }
  commit() {
    this.enabled = false;
    this.buffer.forEach((item) => this.processMessage(item));
    this.buffer = [];
  }
  reject() {
    this.enabled = false;
    this.buffer = [];
  }
};
var Buffering_1 = Buffering$1;
const scopeFactory = scope;
const Buffering2 = Buffering_1;
let Logger$1 = class Logger {
  static instances = {};
  dependencies = {};
  errorHandler = null;
  eventLogger = null;
  functions = {};
  hooks = [];
  isDev = false;
  levels = null;
  logId = null;
  scope = null;
  transports = {};
  variables = {};
  constructor({
    allowUnknownLevel = false,
    dependencies = {},
    errorHandler,
    eventLogger,
    initializeFn,
    isDev = false,
    levels = ["error", "warn", "info", "verbose", "debug", "silly"],
    logId,
    transportFactories = {},
    variables
  } = {}) {
    this.addLevel = this.addLevel.bind(this);
    this.create = this.create.bind(this);
    this.initialize = this.initialize.bind(this);
    this.logData = this.logData.bind(this);
    this.processMessage = this.processMessage.bind(this);
    this.allowUnknownLevel = allowUnknownLevel;
    this.buffering = new Buffering2(this);
    this.dependencies = dependencies;
    this.initializeFn = initializeFn;
    this.isDev = isDev;
    this.levels = levels;
    this.logId = logId;
    this.scope = scopeFactory(this);
    this.transportFactories = transportFactories;
    this.variables = variables || {};
    for (const name of this.levels) {
      this.addLevel(name, false);
    }
    this.log = this.info;
    this.functions.log = this.log;
    this.errorHandler = errorHandler;
    errorHandler?.setOptions({ ...dependencies, logFn: this.error });
    this.eventLogger = eventLogger;
    eventLogger?.setOptions({ ...dependencies, logger: this });
    for (const [name, factory] of Object.entries(transportFactories)) {
      this.transports[name] = factory(this, dependencies);
    }
    Logger.instances[logId] = this;
  }
  static getInstance({ logId }) {
    return this.instances[logId] || this.instances.default;
  }
  addLevel(level, index = this.levels.length) {
    if (index !== false) {
      this.levels.splice(index, 0, level);
    }
    this[level] = (...args) => this.logData(args, { level });
    this.functions[level] = this[level];
  }
  catchErrors(options) {
    this.processMessage(
      {
        data: ["log.catchErrors is deprecated. Use log.errorHandler instead"],
        level: "warn"
      },
      { transports: ["console"] }
    );
    return this.errorHandler.startCatching(options);
  }
  create(options) {
    if (typeof options === "string") {
      options = { logId: options };
    }
    return new Logger({
      dependencies: this.dependencies,
      errorHandler: this.errorHandler,
      initializeFn: this.initializeFn,
      isDev: this.isDev,
      transportFactories: this.transportFactories,
      variables: { ...this.variables },
      ...options
    });
  }
  compareLevels(passLevel, checkLevel, levels = this.levels) {
    const pass = levels.indexOf(passLevel);
    const check = levels.indexOf(checkLevel);
    if (check === -1 || pass === -1) {
      return true;
    }
    return check <= pass;
  }
  initialize(options = {}) {
    this.initializeFn({ logger: this, ...this.dependencies, ...options });
  }
  logData(data, options = {}) {
    if (this.buffering.enabled) {
      this.buffering.addMessage({ data, date: /* @__PURE__ */ new Date(), ...options });
    } else {
      this.processMessage({ data, ...options });
    }
  }
  processMessage(message, { transports = this.transports } = {}) {
    if (message.cmd === "errorHandler") {
      this.errorHandler.handle(message.error, {
        errorName: message.errorName,
        processType: "renderer",
        showDialog: Boolean(message.showDialog)
      });
      return;
    }
    let level = message.level;
    if (!this.allowUnknownLevel) {
      level = this.levels.includes(message.level) ? message.level : "info";
    }
    const normalizedMessage = {
      date: /* @__PURE__ */ new Date(),
      logId: this.logId,
      ...message,
      level,
      variables: {
        ...this.variables,
        ...message.variables
      }
    };
    for (const [transName, transFn] of this.transportEntries(transports)) {
      if (typeof transFn !== "function" || transFn.level === false) {
        continue;
      }
      if (!this.compareLevels(transFn.level, message.level)) {
        continue;
      }
      try {
        const transformedMsg = this.hooks.reduce((msg, hook) => {
          return msg ? hook(msg, transFn, transName) : msg;
        }, normalizedMessage);
        if (transformedMsg) {
          transFn({ ...transformedMsg, data: [...transformedMsg.data] });
        }
      } catch (e) {
        this.processInternalErrorFn(e);
      }
    }
  }
  processInternalErrorFn(_e) {
  }
  transportEntries(transports = this.transports) {
    const transportArray = Array.isArray(transports) ? transports : Object.entries(transports);
    return transportArray.map((item) => {
      switch (typeof item) {
        case "string":
          return this.transports[item] ? [item, this.transports[item]] : null;
        case "function":
          return [item.name, item];
        default:
          return Array.isArray(item) ? item : null;
      }
    }).filter(Boolean);
  }
};
var Logger_1 = Logger$1;
let ErrorHandler$1 = class ErrorHandler {
  externalApi = void 0;
  isActive = false;
  logFn = void 0;
  onError = void 0;
  showDialog = true;
  constructor({
    externalApi: externalApi2,
    logFn = void 0,
    onError = void 0,
    showDialog = void 0
  } = {}) {
    this.createIssue = this.createIssue.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleRejection = this.handleRejection.bind(this);
    this.setOptions({ externalApi: externalApi2, logFn, onError, showDialog });
    this.startCatching = this.startCatching.bind(this);
    this.stopCatching = this.stopCatching.bind(this);
  }
  handle(error, {
    logFn = this.logFn,
    onError = this.onError,
    processType = "browser",
    showDialog = this.showDialog,
    errorName = ""
  } = {}) {
    error = normalizeError(error);
    try {
      if (typeof onError === "function") {
        const versions = this.externalApi?.getVersions() || {};
        const createIssue = this.createIssue;
        const result = onError({
          createIssue,
          error,
          errorName,
          processType,
          versions
        });
        if (result === false) {
          return;
        }
      }
      errorName ? logFn(errorName, error) : logFn(error);
      if (showDialog && !errorName.includes("rejection") && this.externalApi) {
        this.externalApi.showErrorBox(
          `A JavaScript error occurred in the ${processType} process`,
          error.stack
        );
      }
    } catch {
      console.error(error);
    }
  }
  setOptions({ externalApi: externalApi2, logFn, onError, showDialog }) {
    if (typeof externalApi2 === "object") {
      this.externalApi = externalApi2;
    }
    if (typeof logFn === "function") {
      this.logFn = logFn;
    }
    if (typeof onError === "function") {
      this.onError = onError;
    }
    if (typeof showDialog === "boolean") {
      this.showDialog = showDialog;
    }
  }
  startCatching({ onError, showDialog } = {}) {
    if (this.isActive) {
      return;
    }
    this.isActive = true;
    this.setOptions({ onError, showDialog });
    process.on("uncaughtException", this.handleError);
    process.on("unhandledRejection", this.handleRejection);
  }
  stopCatching() {
    this.isActive = false;
    process.removeListener("uncaughtException", this.handleError);
    process.removeListener("unhandledRejection", this.handleRejection);
  }
  createIssue(pageUrl, queryParams) {
    this.externalApi?.openUrl(
      `${pageUrl}?${new URLSearchParams(queryParams).toString()}`
    );
  }
  handleError(error) {
    this.handle(error, { errorName: "Unhandled" });
  }
  handleRejection(reason) {
    const error = reason instanceof Error ? reason : new Error(JSON.stringify(reason));
    this.handle(error, { errorName: "Unhandled rejection" });
  }
};
function normalizeError(e) {
  if (e instanceof Error) {
    return e;
  }
  if (e && typeof e === "object") {
    if (e.message) {
      return Object.assign(new Error(e.message), e);
    }
    try {
      return new Error(JSON.stringify(e));
    } catch (serErr) {
      return new Error(`Couldn't normalize error ${String(e)}: ${serErr}`);
    }
  }
  return new Error(`Can't normalize error ${String(e)}`);
}
var ErrorHandler_1 = ErrorHandler$1;
let EventLogger$1 = class EventLogger {
  disposers = [];
  format = "{eventSource}#{eventName}:";
  formatters = {
    app: {
      "certificate-error": ({ args }) => {
        return this.arrayToObject(args.slice(1, 4), [
          "url",
          "error",
          "certificate"
        ]);
      },
      "child-process-gone": ({ args }) => {
        return args.length === 1 ? args[0] : args;
      },
      "render-process-gone": ({ args: [webContents, details] }) => {
        return details && typeof details === "object" ? { ...details, ...this.getWebContentsDetails(webContents) } : [];
      }
    },
    webContents: {
      "console-message": ({ args: [level, message, line, sourceId] }) => {
        if (level < 3) {
          return void 0;
        }
        return { message, source: `${sourceId}:${line}` };
      },
      "did-fail-load": ({ args }) => {
        return this.arrayToObject(args, [
          "errorCode",
          "errorDescription",
          "validatedURL",
          "isMainFrame",
          "frameProcessId",
          "frameRoutingId"
        ]);
      },
      "did-fail-provisional-load": ({ args }) => {
        return this.arrayToObject(args, [
          "errorCode",
          "errorDescription",
          "validatedURL",
          "isMainFrame",
          "frameProcessId",
          "frameRoutingId"
        ]);
      },
      "plugin-crashed": ({ args }) => {
        return this.arrayToObject(args, ["name", "version"]);
      },
      "preload-error": ({ args }) => {
        return this.arrayToObject(args, ["preloadPath", "error"]);
      }
    }
  };
  events = {
    app: {
      "certificate-error": true,
      "child-process-gone": true,
      "render-process-gone": true
    },
    webContents: {
      // 'console-message': true,
      "did-fail-load": true,
      "did-fail-provisional-load": true,
      "plugin-crashed": true,
      "preload-error": true,
      "unresponsive": true
    }
  };
  externalApi = void 0;
  level = "error";
  scope = "";
  constructor(options = {}) {
    this.setOptions(options);
  }
  setOptions({
    events,
    externalApi: externalApi2,
    level,
    logger,
    format: format2,
    formatters,
    scope: scope2
  }) {
    if (typeof events === "object") {
      this.events = events;
    }
    if (typeof externalApi2 === "object") {
      this.externalApi = externalApi2;
    }
    if (typeof level === "string") {
      this.level = level;
    }
    if (typeof logger === "object") {
      this.logger = logger;
    }
    if (typeof format2 === "string" || typeof format2 === "function") {
      this.format = format2;
    }
    if (typeof formatters === "object") {
      this.formatters = formatters;
    }
    if (typeof scope2 === "string") {
      this.scope = scope2;
    }
  }
  startLogging(options = {}) {
    this.setOptions(options);
    this.disposeListeners();
    for (const eventName of this.getEventNames(this.events.app)) {
      this.disposers.push(
        this.externalApi.onAppEvent(eventName, (...handlerArgs) => {
          this.handleEvent({ eventSource: "app", eventName, handlerArgs });
        })
      );
    }
    for (const eventName of this.getEventNames(this.events.webContents)) {
      this.disposers.push(
        this.externalApi.onEveryWebContentsEvent(
          eventName,
          (...handlerArgs) => {
            this.handleEvent(
              { eventSource: "webContents", eventName, handlerArgs }
            );
          }
        )
      );
    }
  }
  stopLogging() {
    this.disposeListeners();
  }
  arrayToObject(array, fieldNames) {
    const obj = {};
    fieldNames.forEach((fieldName, index) => {
      obj[fieldName] = array[index];
    });
    if (array.length > fieldNames.length) {
      obj.unknownArgs = array.slice(fieldNames.length);
    }
    return obj;
  }
  disposeListeners() {
    this.disposers.forEach((disposer) => disposer());
    this.disposers = [];
  }
  formatEventLog({ eventName, eventSource, handlerArgs }) {
    const [event, ...args] = handlerArgs;
    if (typeof this.format === "function") {
      return this.format({ args, event, eventName, eventSource });
    }
    const formatter = this.formatters[eventSource]?.[eventName];
    let formattedArgs = args;
    if (typeof formatter === "function") {
      formattedArgs = formatter({ args, event, eventName, eventSource });
    }
    if (!formattedArgs) {
      return void 0;
    }
    const eventData = {};
    if (Array.isArray(formattedArgs)) {
      eventData.args = formattedArgs;
    } else if (typeof formattedArgs === "object") {
      Object.assign(eventData, formattedArgs);
    }
    if (eventSource === "webContents") {
      Object.assign(eventData, this.getWebContentsDetails(event?.sender));
    }
    const title = this.format.replace("{eventSource}", eventSource === "app" ? "App" : "WebContents").replace("{eventName}", eventName);
    return [title, eventData];
  }
  getEventNames(eventMap) {
    if (!eventMap || typeof eventMap !== "object") {
      return [];
    }
    return Object.entries(eventMap).filter(([_, listen]) => listen).map(([eventName]) => eventName);
  }
  getWebContentsDetails(webContents) {
    if (!webContents?.loadURL) {
      return {};
    }
    try {
      return {
        webContents: {
          id: webContents.id,
          url: webContents.getURL()
        }
      };
    } catch {
      return {};
    }
  }
  handleEvent({ eventName, eventSource, handlerArgs }) {
    const log2 = this.formatEventLog({ eventName, eventSource, handlerArgs });
    if (log2) {
      const logFns = this.scope ? this.logger.scope(this.scope) : this.logger;
      logFns?.[this.level]?.(...log2);
    }
  }
};
var EventLogger_1 = EventLogger$1;
var transform_1 = { transform: transform$5 };
function transform$5({
  logger,
  message,
  transport,
  initialData = message?.data || [],
  transforms = transport?.transforms
}) {
  return transforms.reduce((data, trans) => {
    if (typeof trans === "function") {
      return trans({ data, logger, message, transport });
    }
    return data;
  }, initialData);
}
const { transform: transform$4 } = transform_1;
var format$2 = {
  concatFirstStringElements: concatFirstStringElements$2,
  format({ message, logger, transport, data = message?.data }) {
    switch (typeof transport.format) {
      case "string": {
        return transform$4({
          message,
          logger,
          transforms: [formatVariables, formatScope, formatText],
          transport,
          initialData: [transport.format, ...data]
        });
      }
      case "function": {
        return transport.format({
          data,
          level: message?.level || "info",
          logger,
          message,
          transport
        });
      }
      default: {
        return data;
      }
    }
  }
};
function concatFirstStringElements$2({ data }) {
  if (typeof data[0] !== "string" || typeof data[1] !== "string") {
    return data;
  }
  if (data[0].match(/%[1cdfiOos]/)) {
    return data;
  }
  return [`${data[0]} ${data[1]}`, ...data.slice(2)];
}
function timeZoneFromOffset(minutesOffset) {
  const minutesPositive = Math.abs(minutesOffset);
  const sign = minutesOffset > 0 ? "-" : "+";
  const hours = Math.floor(minutesPositive / 60).toString().padStart(2, "0");
  const minutes = (minutesPositive % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}
function formatScope({ data, logger, message }) {
  const { defaultLabel, labelLength } = logger?.scope || {};
  const template = data[0];
  let label = message.scope;
  if (!label) {
    label = defaultLabel;
  }
  let scopeText;
  if (label === "") {
    scopeText = labelLength > 0 ? "".padEnd(labelLength + 3) : "";
  } else if (typeof label === "string") {
    scopeText = ` (${label})`.padEnd(labelLength + 3);
  } else {
    scopeText = "";
  }
  data[0] = template.replace("{scope}", scopeText);
  return data;
}
function formatVariables({ data, message }) {
  let template = data[0];
  if (typeof template !== "string") {
    return data;
  }
  template = template.replace("{level}]", `${message.level}]`.padEnd(6, " "));
  const date = message.date || /* @__PURE__ */ new Date();
  data[0] = template.replace(/\{(\w+)}/g, (substring, name) => {
    switch (name) {
      case "level":
        return message.level || "info";
      case "logId":
        return message.logId;
      case "y":
        return date.getFullYear().toString(10);
      case "m":
        return (date.getMonth() + 1).toString(10).padStart(2, "0");
      case "d":
        return date.getDate().toString(10).padStart(2, "0");
      case "h":
        return date.getHours().toString(10).padStart(2, "0");
      case "i":
        return date.getMinutes().toString(10).padStart(2, "0");
      case "s":
        return date.getSeconds().toString(10).padStart(2, "0");
      case "ms":
        return date.getMilliseconds().toString(10).padStart(3, "0");
      case "z":
        return timeZoneFromOffset(date.getTimezoneOffset());
      case "iso":
        return date.toISOString();
      default: {
        return message.variables?.[name] || substring;
      }
    }
  }).trim();
  return data;
}
function formatText({ data }) {
  const template = data[0];
  if (typeof template !== "string") {
    return data;
  }
  const textTplPosition = template.lastIndexOf("{text}");
  if (textTplPosition === template.length - 6) {
    data[0] = template.replace(/\s?{text}/, "");
    if (data[0] === "") {
      data.shift();
    }
    return data;
  }
  const templatePieces = template.split("{text}");
  let result = [];
  if (templatePieces[0] !== "") {
    result.push(templatePieces[0]);
  }
  result = result.concat(data.slice(1));
  if (templatePieces[1] !== "") {
    result.push(templatePieces[1]);
  }
  return result;
}
var object = { exports: {} };
(function(module2) {
  const util = require$$0$2;
  module2.exports = {
    serialize,
    maxDepth({ data, transport, depth = transport?.depth ?? 6 }) {
      if (!data) {
        return data;
      }
      if (depth < 1) {
        if (Array.isArray(data)) return "[array]";
        if (typeof data === "object" && data) return "[object]";
        return data;
      }
      if (Array.isArray(data)) {
        return data.map((child) => module2.exports.maxDepth({
          data: child,
          depth: depth - 1
        }));
      }
      if (typeof data !== "object") {
        return data;
      }
      if (data && typeof data.toISOString === "function") {
        return data;
      }
      if (data === null) {
        return null;
      }
      if (data instanceof Error) {
        return data;
      }
      const newJson = {};
      for (const i in data) {
        if (!Object.prototype.hasOwnProperty.call(data, i)) continue;
        newJson[i] = module2.exports.maxDepth({
          data: data[i],
          depth: depth - 1
        });
      }
      return newJson;
    },
    toJSON({ data }) {
      return JSON.parse(JSON.stringify(data, createSerializer()));
    },
    toString({ data, transport }) {
      const inspectOptions = transport?.inspectOptions || {};
      const simplifiedData = data.map((item) => {
        if (item === void 0) {
          return void 0;
        }
        try {
          const str = JSON.stringify(item, createSerializer(), "  ");
          return str === void 0 ? void 0 : JSON.parse(str);
        } catch (e) {
          return item;
        }
      });
      return util.formatWithOptions(inspectOptions, ...simplifiedData);
    }
  };
  function createSerializer(options = {}) {
    const seen = /* @__PURE__ */ new WeakSet();
    return function(key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return void 0;
        }
        seen.add(value);
      }
      return serialize(key, value, options);
    };
  }
  function serialize(key, value, options = {}) {
    const serializeMapAndSet = options?.serializeMapAndSet !== false;
    if (value instanceof Error) {
      return value.stack;
    }
    if (!value) {
      return value;
    }
    if (typeof value === "function") {
      return `[function] ${value.toString()}`;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (serializeMapAndSet && value instanceof Map && Object.fromEntries) {
      return Object.fromEntries(value);
    }
    if (serializeMapAndSet && value instanceof Set && Array.from) {
      return Array.from(value);
    }
    return value;
  }
})(object);
var objectExports = object.exports;
var style = {
  applyAnsiStyles({ data }) {
    return transformStyles(data, styleToAnsi, resetAnsiStyle);
  },
  removeStyles({ data }) {
    return transformStyles(data, () => "");
  }
};
const ANSI_COLORS = {
  unset: "\x1B[0m",
  black: "\x1B[30m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  magenta: "\x1B[35m",
  cyan: "\x1B[36m",
  white: "\x1B[37m",
  gray: "\x1B[90m"
};
function styleToAnsi(style2) {
  const color = style2.replace(/color:\s*(\w+).*/, "$1").toLowerCase();
  return ANSI_COLORS[color] || "";
}
function resetAnsiStyle(string) {
  return string + ANSI_COLORS.unset;
}
function transformStyles(data, onStyleFound, onStyleApplied) {
  const foundStyles = {};
  return data.reduce((result, item, index, array) => {
    if (foundStyles[index]) {
      return result;
    }
    if (typeof item === "string") {
      let valueIndex = index;
      let styleApplied = false;
      item = item.replace(/%[1cdfiOos]/g, (match) => {
        valueIndex += 1;
        if (match !== "%c") {
          return match;
        }
        const style2 = array[valueIndex];
        if (typeof style2 === "string") {
          foundStyles[valueIndex] = true;
          styleApplied = true;
          return onStyleFound(style2, item);
        }
        return match;
      });
      if (styleApplied && onStyleApplied) {
        item = onStyleApplied(item);
      }
    }
    result.push(item);
    return result;
  }, []);
}
const {
  concatFirstStringElements: concatFirstStringElements$1,
  format: format$1
} = format$2;
const { maxDepth: maxDepth$2, toJSON: toJSON$2 } = objectExports;
const {
  applyAnsiStyles,
  removeStyles: removeStyles$2
} = style;
const { transform: transform$3 } = transform_1;
const consoleMethods = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  verbose: console.info,
  debug: console.debug,
  silly: console.debug,
  log: console.log
};
var console_1 = consoleTransportFactory;
const separator = process.platform === "win32" ? ">" : "›";
const DEFAULT_FORMAT = `%c{h}:{i}:{s}.{ms}{scope}%c ${separator} {text}`;
Object.assign(consoleTransportFactory, {
  DEFAULT_FORMAT
});
function consoleTransportFactory(logger) {
  return Object.assign(transport, {
    colorMap: {
      error: "red",
      warn: "yellow",
      info: "cyan",
      verbose: "unset",
      debug: "gray",
      silly: "gray",
      default: "unset"
    },
    format: DEFAULT_FORMAT,
    level: "silly",
    transforms: [
      addTemplateColors,
      format$1,
      formatStyles,
      concatFirstStringElements$1,
      maxDepth$2,
      toJSON$2
    ],
    useStyles: process.env.FORCE_STYLES,
    writeFn({ message }) {
      const consoleLogFn = consoleMethods[message.level] || consoleMethods.info;
      consoleLogFn(...message.data);
    }
  });
  function transport(message) {
    const data = transform$3({ logger, message, transport });
    transport.writeFn({
      message: { ...message, data }
    });
  }
}
function addTemplateColors({ data, message, transport }) {
  if (typeof transport.format !== "string" || !transport.format.includes("%c")) {
    return data;
  }
  return [
    `color:${levelToStyle(message.level, transport)}`,
    "color:unset",
    ...data
  ];
}
function canUseStyles(useStyleValue, level) {
  if (typeof useStyleValue === "boolean") {
    return useStyleValue;
  }
  const useStderr = level === "error" || level === "warn";
  const stream = useStderr ? process.stderr : process.stdout;
  return stream && stream.isTTY;
}
function formatStyles(args) {
  const { message, transport } = args;
  const useStyles = canUseStyles(transport.useStyles, message.level);
  const nextTransform = useStyles ? applyAnsiStyles : removeStyles$2;
  return nextTransform(args);
}
function levelToStyle(level, transport) {
  return transport.colorMap[level] || transport.colorMap.default;
}
const EventEmitter$1 = require$$0$3;
const fs$2 = require$$0;
const os$1 = require$$1;
let File$2 = class File extends EventEmitter$1 {
  asyncWriteQueue = [];
  bytesWritten = 0;
  hasActiveAsyncWriting = false;
  path = null;
  initialSize = void 0;
  writeOptions = null;
  writeAsync = false;
  constructor({
    path: path2,
    writeOptions = { encoding: "utf8", flag: "a", mode: 438 },
    writeAsync = false
  }) {
    super();
    this.path = path2;
    this.writeOptions = writeOptions;
    this.writeAsync = writeAsync;
  }
  get size() {
    return this.getSize();
  }
  clear() {
    try {
      fs$2.writeFileSync(this.path, "", {
        mode: this.writeOptions.mode,
        flag: "w"
      });
      this.reset();
      return true;
    } catch (e) {
      if (e.code === "ENOENT") {
        return true;
      }
      this.emit("error", e, this);
      return false;
    }
  }
  crop(bytesAfter) {
    try {
      const content = readFileSyncFromEnd(this.path, bytesAfter || 4096);
      this.clear();
      this.writeLine(`[log cropped]${os$1.EOL}${content}`);
    } catch (e) {
      this.emit(
        "error",
        new Error(`Couldn't crop file ${this.path}. ${e.message}`),
        this
      );
    }
  }
  getSize() {
    if (this.initialSize === void 0) {
      try {
        const stats = fs$2.statSync(this.path);
        this.initialSize = stats.size;
      } catch (e) {
        this.initialSize = 0;
      }
    }
    return this.initialSize + this.bytesWritten;
  }
  increaseBytesWrittenCounter(text) {
    this.bytesWritten += Buffer.byteLength(text, this.writeOptions.encoding);
  }
  isNull() {
    return false;
  }
  nextAsyncWrite() {
    const file2 = this;
    if (this.hasActiveAsyncWriting || this.asyncWriteQueue.length === 0) {
      return;
    }
    const text = this.asyncWriteQueue.join("");
    this.asyncWriteQueue = [];
    this.hasActiveAsyncWriting = true;
    fs$2.writeFile(this.path, text, this.writeOptions, (e) => {
      file2.hasActiveAsyncWriting = false;
      if (e) {
        file2.emit(
          "error",
          new Error(`Couldn't write to ${file2.path}. ${e.message}`),
          this
        );
      } else {
        file2.increaseBytesWrittenCounter(text);
      }
      file2.nextAsyncWrite();
    });
  }
  reset() {
    this.initialSize = void 0;
    this.bytesWritten = 0;
  }
  toString() {
    return this.path;
  }
  writeLine(text) {
    text += os$1.EOL;
    if (this.writeAsync) {
      this.asyncWriteQueue.push(text);
      this.nextAsyncWrite();
      return;
    }
    try {
      fs$2.writeFileSync(this.path, text, this.writeOptions);
      this.increaseBytesWrittenCounter(text);
    } catch (e) {
      this.emit(
        "error",
        new Error(`Couldn't write to ${this.path}. ${e.message}`),
        this
      );
    }
  }
};
var File_1 = File$2;
function readFileSyncFromEnd(filePath, bytesCount) {
  const buffer = Buffer.alloc(bytesCount);
  const stats = fs$2.statSync(filePath);
  const readLength = Math.min(stats.size, bytesCount);
  const offset = Math.max(0, stats.size - bytesCount);
  const fd = fs$2.openSync(filePath, "r");
  const totalBytes = fs$2.readSync(fd, buffer, 0, readLength, offset);
  fs$2.closeSync(fd);
  return buffer.toString("utf8", 0, totalBytes);
}
const File$1 = File_1;
let NullFile$1 = class NullFile extends File$1 {
  clear() {
  }
  crop() {
  }
  getSize() {
    return 0;
  }
  isNull() {
    return true;
  }
  writeLine() {
  }
};
var NullFile_1 = NullFile$1;
const EventEmitter = require$$0$3;
const fs$1 = require$$0;
const path$1 = require$$2;
const File2 = File_1;
const NullFile2 = NullFile_1;
let FileRegistry$1 = class FileRegistry extends EventEmitter {
  store = {};
  constructor() {
    super();
    this.emitError = this.emitError.bind(this);
  }
  /**
   * Provide a File object corresponding to the filePath
   * @param {string} filePath
   * @param {WriteOptions} [writeOptions]
   * @param {boolean} [writeAsync]
   * @return {File}
   */
  provide({ filePath, writeOptions = {}, writeAsync = false }) {
    let file2;
    try {
      filePath = path$1.resolve(filePath);
      if (this.store[filePath]) {
        return this.store[filePath];
      }
      file2 = this.createFile({ filePath, writeOptions, writeAsync });
    } catch (e) {
      file2 = new NullFile2({ path: filePath });
      this.emitError(e, file2);
    }
    file2.on("error", this.emitError);
    this.store[filePath] = file2;
    return file2;
  }
  /**
   * @param {string} filePath
   * @param {WriteOptions} writeOptions
   * @param {boolean} async
   * @return {File}
   * @private
   */
  createFile({ filePath, writeOptions, writeAsync }) {
    this.testFileWriting({ filePath, writeOptions });
    return new File2({ path: filePath, writeOptions, writeAsync });
  }
  /**
   * @param {Error} error
   * @param {File} file
   * @private
   */
  emitError(error, file2) {
    this.emit("error", error, file2);
  }
  /**
   * @param {string} filePath
   * @param {WriteOptions} writeOptions
   * @private
   */
  testFileWriting({ filePath, writeOptions }) {
    fs$1.mkdirSync(path$1.dirname(filePath), { recursive: true });
    fs$1.writeFileSync(filePath, "", { flag: "a", mode: writeOptions.mode });
  }
};
var FileRegistry_1 = FileRegistry$1;
const fs = require$$0;
const os = require$$1;
const path = require$$2;
const FileRegistry2 = FileRegistry_1;
const { transform: transform$2 } = transform_1;
const { removeStyles: removeStyles$1 } = style;
const {
  format,
  concatFirstStringElements
} = format$2;
const { toString } = objectExports;
var file = fileTransportFactory;
const globalRegistry = new FileRegistry2();
function fileTransportFactory(logger, { registry = globalRegistry, externalApi: externalApi2 } = {}) {
  let pathVariables;
  if (registry.listenerCount("error") < 1) {
    registry.on("error", (e, file2) => {
      logConsole(`Can't write to ${file2}`, e);
    });
  }
  return Object.assign(transport, {
    fileName: getDefaultFileName(logger.variables.processType),
    format: "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}",
    getFile,
    inspectOptions: { depth: 5 },
    level: "silly",
    maxSize: 1024 ** 2,
    readAllLogs,
    sync: true,
    transforms: [removeStyles$1, format, concatFirstStringElements, toString],
    writeOptions: { flag: "a", mode: 438, encoding: "utf8" },
    archiveLogFn(file2) {
      const oldPath = file2.toString();
      const inf = path.parse(oldPath);
      try {
        fs.renameSync(oldPath, path.join(inf.dir, `${inf.name}.old${inf.ext}`));
      } catch (e) {
        logConsole("Could not rotate log", e);
        const quarterOfMaxSize = Math.round(transport.maxSize / 4);
        file2.crop(Math.min(quarterOfMaxSize, 256 * 1024));
      }
    },
    resolvePathFn(vars) {
      return path.join(vars.libraryDefaultDir, vars.fileName);
    },
    setAppName(name) {
      logger.dependencies.externalApi.setAppName(name);
    }
  });
  function transport(message) {
    const file2 = getFile(message);
    const needLogRotation = transport.maxSize > 0 && file2.size > transport.maxSize;
    if (needLogRotation) {
      transport.archiveLogFn(file2);
      file2.reset();
    }
    const content = transform$2({ logger, message, transport });
    file2.writeLine(content);
  }
  function initializeOnFirstAccess() {
    if (pathVariables) {
      return;
    }
    pathVariables = Object.create(
      Object.prototype,
      {
        ...Object.getOwnPropertyDescriptors(
          externalApi2.getPathVariables()
        ),
        fileName: {
          get() {
            return transport.fileName;
          },
          enumerable: true
        }
      }
    );
    if (typeof transport.archiveLog === "function") {
      transport.archiveLogFn = transport.archiveLog;
      logConsole("archiveLog is deprecated. Use archiveLogFn instead");
    }
    if (typeof transport.resolvePath === "function") {
      transport.resolvePathFn = transport.resolvePath;
      logConsole("resolvePath is deprecated. Use resolvePathFn instead");
    }
  }
  function logConsole(message, error = null, level = "error") {
    const data = [`electron-log.transports.file: ${message}`];
    if (error) {
      data.push(error);
    }
    logger.transports.console({ data, date: /* @__PURE__ */ new Date(), level });
  }
  function getFile(msg) {
    initializeOnFirstAccess();
    const filePath = transport.resolvePathFn(pathVariables, msg);
    return registry.provide({
      filePath,
      writeAsync: !transport.sync,
      writeOptions: transport.writeOptions
    });
  }
  function readAllLogs({ fileFilter = (f) => f.endsWith(".log") } = {}) {
    initializeOnFirstAccess();
    const logsPath = path.dirname(transport.resolvePathFn(pathVariables));
    if (!fs.existsSync(logsPath)) {
      return [];
    }
    return fs.readdirSync(logsPath).map((fileName) => path.join(logsPath, fileName)).filter(fileFilter).map((logPath) => {
      try {
        return {
          path: logPath,
          lines: fs.readFileSync(logPath, "utf8").split(os.EOL)
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
}
function getDefaultFileName(processType = process.type) {
  switch (processType) {
    case "renderer":
      return "renderer.log";
    case "worker":
      return "worker.log";
    default:
      return "main.log";
  }
}
const { maxDepth: maxDepth$1, toJSON: toJSON$1 } = objectExports;
const { transform: transform$1 } = transform_1;
var ipc = ipcTransportFactory;
function ipcTransportFactory(logger, { externalApi: externalApi2 }) {
  Object.assign(transport, {
    depth: 3,
    eventId: "__ELECTRON_LOG_IPC__",
    level: logger.isDev ? "silly" : false,
    transforms: [toJSON$1, maxDepth$1]
  });
  return externalApi2?.isElectron() ? transport : void 0;
  function transport(message) {
    if (message?.variables?.processType === "renderer") {
      return;
    }
    externalApi2?.sendIpc(transport.eventId, {
      ...message,
      data: transform$1({ logger, message, transport })
    });
  }
}
const http = require$$0$4;
const https = require$$1$1;
const { transform } = transform_1;
const { removeStyles } = style;
const { toJSON, maxDepth } = objectExports;
var remote = remoteTransportFactory;
function remoteTransportFactory(logger) {
  return Object.assign(transport, {
    client: { name: "electron-application" },
    depth: 6,
    level: false,
    requestOptions: {},
    transforms: [removeStyles, toJSON, maxDepth],
    makeBodyFn({ message }) {
      return JSON.stringify({
        client: transport.client,
        data: message.data,
        date: message.date.getTime(),
        level: message.level,
        scope: message.scope,
        variables: message.variables
      });
    },
    processErrorFn({ error }) {
      logger.processMessage(
        {
          data: [`electron-log: can't POST ${transport.url}`, error],
          level: "warn"
        },
        { transports: ["console", "file"] }
      );
    },
    sendRequestFn({ serverUrl, requestOptions, body }) {
      const httpTransport = serverUrl.startsWith("https:") ? https : http;
      const request = httpTransport.request(serverUrl, {
        method: "POST",
        ...requestOptions,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          ...requestOptions.headers
        }
      });
      request.write(body);
      request.end();
      return request;
    }
  });
  function transport(message) {
    if (!transport.url) {
      return;
    }
    const body = transport.makeBodyFn({
      logger,
      message: { ...message, data: transform({ logger, message, transport }) },
      transport
    });
    const request = transport.sendRequestFn({
      serverUrl: transport.url,
      requestOptions: transport.requestOptions,
      body: Buffer.from(body, "utf8")
    });
    request.on("error", (error) => transport.processErrorFn({
      error,
      logger,
      message,
      request,
      transport
    }));
  }
}
const Logger2 = Logger_1;
const ErrorHandler2 = ErrorHandler_1;
const EventLogger2 = EventLogger_1;
const transportConsole = console_1;
const transportFile = file;
const transportIpc = ipc;
const transportRemote = remote;
var createDefaultLogger_1 = createDefaultLogger$1;
function createDefaultLogger$1({ dependencies, initializeFn }) {
  const defaultLogger2 = new Logger2({
    dependencies,
    errorHandler: new ErrorHandler2(),
    eventLogger: new EventLogger2(),
    initializeFn,
    isDev: dependencies.externalApi?.isDev(),
    logId: "default",
    transportFactories: {
      console: transportConsole,
      file: transportFile,
      ipc: transportIpc,
      remote: transportRemote
    },
    variables: {
      processType: "main"
    }
  });
  defaultLogger2.default = defaultLogger2;
  defaultLogger2.Logger = Logger2;
  defaultLogger2.processInternalErrorFn = (e) => {
    defaultLogger2.transports.console.writeFn({
      message: {
        data: ["Unhandled electron-log error", e],
        level: "error"
      }
    });
  };
  return defaultLogger2;
}
const electron = require$$0$5;
const ElectronExternalApi2 = ElectronExternalApi_1;
const { initialize } = initialize$1;
const createDefaultLogger = createDefaultLogger_1;
const externalApi = new ElectronExternalApi2({ electron });
const defaultLogger = createDefaultLogger({
  dependencies: { externalApi },
  initializeFn: initialize
});
var main$1 = defaultLogger;
externalApi.onIpc("__ELECTRON_LOG__", (_, message) => {
  if (message.scope) {
    defaultLogger.Logger.getInstance(message).scope(message.scope);
  }
  const date = new Date(message.date);
  processMessage({
    ...message,
    date: date.getTime() ? date : /* @__PURE__ */ new Date()
  });
});
externalApi.onIpcInvoke("__ELECTRON_LOG__", (_, { cmd = "", logId }) => {
  switch (cmd) {
    case "getOptions": {
      const logger = defaultLogger.Logger.getInstance({ logId });
      return {
        levels: logger.levels,
        logId
      };
    }
    default: {
      processMessage({ data: [`Unknown cmd '${cmd}'`], level: "error" });
      return {};
    }
  }
});
function processMessage(message) {
  defaultLogger.Logger.getInstance(message)?.processMessage(message);
}
const main = main$1;
var main_1 = main;
const log = /* @__PURE__ */ getDefaultExportFromCjs(main_1);
const is = {
  dev: !require$$0$5.app.isPackaged
};
({
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
});
log.initialize();
log.transports.file.level = "info";
log.info("Hermes starting...");
process.on("uncaughtException", (err) => log.error("Uncaught Exception:", err));
process.on("unhandledRejection", (err) => log.error("Unhandled Rejection:", err));
let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;
const BACKEND_PORT = 1478;
const BACKEND_HOST = "127.0.0.1";
function getPreloadPath() {
  return require$$2.join(__dirname, "../preload/index.js");
}
function getRendererURL() {
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    return process.env["ELECTRON_RENDERER_URL"];
  }
  return `file://${require$$2.join(__dirname, "../renderer/index.html")}`;
}
function createWindow() {
  log.info("Creating main window");
  mainWindow = new require$$0$5.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Hermes",
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  mainWindow.loadURL(getRendererURL());
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function createTray() {
  const icon = require$$0$5.nativeImage.createEmpty();
  tray = new require$$0$5.Tray(icon);
  const contextMenu = require$$0$5.Menu.buildFromTemplate([
    {
      label: "Open Hermes",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        require$$0$5.app.quit();
      }
    }
  ]);
  tray.setToolTip("Hermes");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}
async function checkBackendRunning() {
  try {
    const http2 = await import("http");
    return new Promise((resolve) => {
      const req = http2.get(`http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1e3, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}
function startBackend() {
  const rootDir = is.dev ? require$$2.join(__dirname, "../../") : require$$2.join(require$$0$5.app.getAppPath(), "../");
  const pythonExec = process.platform === "win32" ? "python" : "python3";
  const scriptPath = require$$2.join(rootDir, "backend", "run.py");
  log.info(`Starting backend: ${pythonExec} ${scriptPath}`);
  backendProcess = require$$0$1.spawn(pythonExec, [scriptPath], {
    cwd: require$$2.join(rootDir, "backend"),
    detached: false,
    stdio: ["pipe", "pipe", "pipe"]
  });
  backendProcess.stdout?.on("data", (data) => {
    log.info(`[Backend] ${data.toString().trim()}`);
  });
  backendProcess.stderr?.on("data", (data) => {
    log.error(`[Backend Error] ${data.toString().trim()}`);
  });
  backendProcess.on("exit", (code) => {
    if (!isQuitting) {
      log.warn(`Backend exited with code ${code}, restarting in 3s...`);
      setTimeout(startBackend, 3e3);
    }
  });
}
function setupIPC() {
  require$$0$5.ipcMain.handle("backend:fetch", async (_event, url, options) => {
    try {
      const base = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
      const fullUrl = url.startsWith("http") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3e4);
      try {
        const res = await fetch(fullUrl, {
          method: options?.method || "GET",
          headers: options?.headers,
          body: options?.body,
          signal: controller.signal
        });
        const body = await res.text();
        clearTimeout(timeout);
        return {
          status: res.status,
          headers: res.headers,
          body
        };
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timeout");
        }
        throw err;
      }
    } catch (err) {
      log.error("Backend fetch error:", err);
      throw err;
    }
  });
  require$$0$5.ipcMain.handle("shell:openExternal", async (_event, url) => {
    return require$$0$5.shell.openExternal(url);
  });
  require$$0$5.ipcMain.handle("dialog:openFile", async (_event, options) => {
    if (!mainWindow) return null;
    const result = await require$$0$5.dialog.showOpenDialog(mainWindow, options || {});
    return result.canceled ? null : result.filePaths;
  });
  require$$0$5.ipcMain.handle("dialog:saveFile", async (_event, options) => {
    if (!mainWindow) return null;
    const result = await require$$0$5.dialog.showSaveDialog(mainWindow, options || {});
    return result.canceled ? null : result.filePath;
  });
  require$$0$5.ipcMain.handle("app:getPath", (_event, name) => {
    return require$$0$5.app.getPath(name);
  });
  require$$0$5.ipcMain.handle("app:getVersion", () => require$$0$5.app.getVersion());
  require$$0$5.ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  require$$0$5.ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  require$$0$5.ipcMain.handle("window:close", () => mainWindow?.close());
  require$$0$5.ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized());
}
require$$0$5.app.whenReady().then(async () => {
  log.info("App ready");
  const running = await checkBackendRunning();
  if (!running) {
    if (is.dev) {
      log.warn("Backend not running in dev mode — make sure `pnpm run dev` started the backend concurrently");
    } else {
      startBackend();
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await checkBackendRunning()) break;
      }
    }
  } else {
    log.info("Backend already running");
  }
  setupIPC();
  createWindow();
  createTray();
});
require$$0$5.app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
require$$0$5.app.on("before-quit", () => {
  isQuitting = true;
  backendProcess?.kill();
});
require$$0$5.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    require$$0$5.app.quit();
  }
});
