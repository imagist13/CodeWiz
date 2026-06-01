"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.infoCommand = infoCommand;
const config_1 = require("../utils/config");
const system_1 = require("../utils/system");
const chalk_1 = __importDefault(require("chalk"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs-extra"));
async function infoCommand(options = {}) {
    try {
        // 0. Get CLI Version
        let cliVersion = 'Unknown';
        try {
            const cliPackagePath = path.join(__dirname, '../../package.json');
            if (await fs.pathExists(cliPackagePath)) {
                const pkg = await fs.readJSON(cliPackagePath);
                cliVersion = pkg.version;
            }
        }
        catch (e) {
            // ignore
        }
        console.log(chalk_1.default.bold('feishu-plugin-onboard: ') + chalk_1.default.green(cliVersion));
        // 1. Get OpenClaw Version
        let openClawVersion = 'Not Installed';
        try {
            openClawVersion = (0, system_1.runCommandQuiet)('openclaw --version');
        }
        catch (e) {
            // openclaw not installed or error
        }
        console.log(chalk_1.default.bold('openclaw: ') + (openClawVersion !== 'Not Installed' ? chalk_1.default.green(openClawVersion) : chalk_1.default.red(openClawVersion)));
        // 2. Get Plugin Version
        const EXTENSIONS_DIR = path.join(os.homedir(), '.openclaw', 'extensions');
        const PLUGIN_NAME = 'feishu-openclaw-plugin';
        const PLUGIN_PATH = path.join(EXTENSIONS_DIR, PLUGIN_NAME);
        const PACKAGE_JSON_PATH = path.join(PLUGIN_PATH, 'package.json');
        let pluginVersion = 'Not Installed';
        if (await fs.pathExists(PACKAGE_JSON_PATH)) {
            try {
                const pkg = await fs.readJSON(PACKAGE_JSON_PATH);
                if (pkg.version) {
                    pluginVersion = pkg.version;
                }
            }
            catch (e) {
                // Failed to read package.json
            }
        }
        console.log(chalk_1.default.bold('feishu-openclaw-plugin: ') + (pluginVersion !== 'Not Installed' ? chalk_1.default.green(pluginVersion) : chalk_1.default.red(pluginVersion)));
        // 3. Print Config if --all
        if (options.all) {
            console.log(''); // Empty line
            const config = await (0, config_1.readConfig)();
            console.log(chalk_1.default.bold('Configuration Info:'));
            console.log(JSON.stringify(config, null, 2));
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('Failed to retrieve information.'));
    }
}
//# sourceMappingURL=info.js.map