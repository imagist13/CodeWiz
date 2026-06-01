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
exports.updateCommand = updateCommand;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../utils/config");
const system_1 = require("../utils/system");
const doctor_1 = require("./doctor");
const EXTENSIONS_DIR = path.join(os.homedir(), '.openclaw', 'extensions');
const PLUGIN_NAME = 'feishu-openclaw-plugin';
const PLUGIN_PATH = path.join(EXTENSIONS_DIR, PLUGIN_NAME);
const PACKAGE_NAME = '@larksuiteoapi/feishu-openclaw-plugin';
async function updateCommand(options, silent = false) {
    console.log(chalk_1.default.blue('Starting update process...'));
    // 1. Remove from configuration
    console.log(chalk_1.default.blue('Cleaning up configuration...'));
    const config = await (0, config_1.readConfig)();
    // Remove plugins.entries.feishu-openclaw-plugin
    if (config.plugins?.entries?.[PLUGIN_NAME]) {
        delete config.plugins.entries[PLUGIN_NAME];
    }
    // Remove from plugins.allow
    if (config.plugins?.allow) {
        config.plugins.allow = config.plugins.allow.filter(name => name !== PLUGIN_NAME);
    }
    await (0, config_1.writeConfig)(config);
    // 2. Remove files
    console.log(chalk_1.default.blue('Removing old plugin files...'));
    if (await fs.pathExists(PLUGIN_PATH)) {
        await fs.remove(PLUGIN_PATH);
    }
    // 3. Install new version
    console.log(chalk_1.default.blue('Installing new version...'));
    try {
        const packageIdentifier = options.version ? `${PACKAGE_NAME}@${options.version}` : PACKAGE_NAME;
        console.log(chalk_1.default.blue(`Installing plugin ${packageIdentifier}...`));
        (0, system_1.runCommand)(`openclaw plugins install ${packageIdentifier}`);
    }
    catch (error) {
        console.error(chalk_1.default.red('Failed to install plugin from npm.'));
        console.error(error);
        process.exit(1);
    }
    // 4. Update configuration again
    console.log(chalk_1.default.blue('Updating configuration...'));
    const newConfig = await (0, config_1.readConfig)();
    if (!newConfig.plugins)
        newConfig.plugins = {};
    if (!newConfig.plugins.allow)
        newConfig.plugins.allow = [];
    if (!newConfig.plugins.allow.includes(PLUGIN_NAME)) {
        newConfig.plugins.allow.push(PLUGIN_NAME);
    }
    await (0, config_1.writeConfig)(newConfig);
    // 5. Run Doctor Check
    await (0, doctor_1.doctorCommand)();
    // 6. Report Success and Version
    let version;
    try {
        const packageJsonPath = path.join(PLUGIN_PATH, 'package.json');
        if (await fs.pathExists(packageJsonPath)) {
            const pkg = await fs.readJSON(packageJsonPath);
            version = pkg.version;
            if (!silent) {
                console.log(chalk_1.default.green(`Update complete! New version: ${version}`));
            }
        }
        else {
            if (!silent) {
                console.warn(chalk_1.default.yellow('Update complete, but could not determine new version (package.json missing).'));
            }
        }
    }
    catch (error) {
        if (!silent) {
            console.warn(chalk_1.default.yellow('Update complete, but failed to read version info.'));
        }
    }
    return version;
}
//# sourceMappingURL=update.js.map