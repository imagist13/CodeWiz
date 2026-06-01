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
exports.installCommand = installCommand;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const chalk_1 = __importDefault(require("chalk"));
const system_1 = require("../utils/system");
const config_1 = require("../utils/config");
const prompts_1 = require("../utils/prompts");
const update_1 = require("./update");
const EXTENSIONS_DIR = path.join(os.homedir(), '.openclaw', 'extensions');
const PLUGIN_NAME = 'feishu-openclaw-plugin';
const PLUGIN_PATH = path.join(EXTENSIONS_DIR, PLUGIN_NAME);
const CONFLICT_PLUGIN_PATH = path.join(EXTENSIONS_DIR, 'feishu');
const PACKAGE_NAME = '@larksuiteoapi/feishu-openclaw-plugin';
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2)
            return 1;
        if (p1 < p2)
            return -1;
    }
    return 0;
}
async function ensureChannelConfig() {
    console.log(chalk_1.default.blue('Configuring channels...'));
    const newConfig = await (0, config_1.readConfig)(); // Re-read in case openclaw modified it
    if (!newConfig.channels)
        newConfig.channels = {};
    if (!newConfig.channels.feishu) {
        newConfig.channels.feishu = {
            enabled: true,
            appId: "",
            appSecret: "",
            domain: "feishu",
            connectionMode: "websocket",
            requireMention: true,
            dmPolicy: "pairing",
            groupPolicy: "open",
            allowFrom: [],
            groupAllowFrom: []
        };
    }
    // Handle appId
    if (newConfig.channels.feishu.appId) {
        const confirm = await (0, prompts_1.promptConfirmAppId)(newConfig.channels.feishu.appId);
        if (!confirm) {
            newConfig.channels.feishu.appId = await (0, prompts_1.promptAppId)();
            // Requirement: delete old appSecret if appId is changed
            delete newConfig.channels.feishu.appSecret;
        }
    }
    else {
        newConfig.channels.feishu.appId = await (0, prompts_1.promptAppId)();
    }
    // Handle appSecret
    if (!newConfig.channels.feishu.appSecret) {
        newConfig.channels.feishu.appSecret = await (0, prompts_1.promptAppSecret)();
    }
    // Ensure dmPolicy is set to "pairing" and groupPolicy is set to "open" if missing
    if (!newConfig.channels.feishu.dmPolicy) {
        newConfig.channels.feishu.dmPolicy = "pairing";
    }
    if (!newConfig.channels.feishu.groupPolicy) {
        newConfig.channels.feishu.groupPolicy = "open";
    }
    // Update plugins.allow
    if (!newConfig.plugins)
        newConfig.plugins = {};
    if (!newConfig.plugins.allow)
        newConfig.plugins.allow = [];
    if (!newConfig.plugins.allow.includes(PLUGIN_NAME)) {
        newConfig.plugins.allow.push(PLUGIN_NAME);
    }
    await (0, config_1.writeConfig)(newConfig);
}
async function installCommand(options) {
    console.log(chalk_1.default.blue('Starting installation...'));
    // 1. Check existing installation
    if (await fs.pathExists(PLUGIN_PATH)) {
        console.log(chalk_1.default.yellow('Plugin is already installed. Starting update process...'));
        const newVersion = await (0, update_1.updateCommand)(options, true);
        // Validate config after update
        await ensureChannelConfig();
        if (newVersion) {
            console.log(chalk_1.default.green(`Update complete! New version: ${newVersion}`));
        }
        else {
            console.log(chalk_1.default.green('Update complete!'));
        }
        return;
    }
    // 2. Check openclaw version
    try {
        const version = (0, system_1.runCommandQuiet)('openclaw --version');
        // Ensure version is >= 2026.2.26
        if (compareVersions(version, '2026.2.26') < 0) {
            console.error(chalk_1.default.red(`Error: OpenClaw version mismatch. Expected >= 2026.2.26, found ${version}. Please upgrade.`));
            process.exit(1);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('Error: OpenClaw is not installed or not in PATH.'));
        process.exit(1);
    }
    // 3. Set npm registry
    console.log(chalk_1.default.blue('Setting npm registry...'));
    try {
        (0, system_1.runCommand)('npm config set registry https://registry.npmjs.org/');
    }
    catch (e) {
        console.error(chalk_1.default.red('Failed to set npm registry.'));
    }
    // 4. Prompt uninstall lark-office MCP
    const shouldUninstall = await (0, prompts_1.promptUninstallMcp)();
    if (shouldUninstall) {
        console.log(chalk_1.default.yellow('Please manually uninstall "lark-office" MCP if installed via OpenClaw conversation.'));
    }
    // 5. Disable built-in plugin
    console.log(chalk_1.default.blue('Disabling built-in Feishu plugin...'));
    const config = await (0, config_1.readConfig)();
    if (!config.plugins)
        config.plugins = {};
    if (!config.plugins.entries)
        config.plugins.entries = {};
    if (!config.plugins.entries.feishu)
        config.plugins.entries.feishu = { enabled: false };
    config.plugins.entries.feishu.enabled = false;
    await (0, config_1.writeConfig)(config);
    // 6. Remove conflicting directory
    if (await fs.pathExists(CONFLICT_PLUGIN_PATH)) {
        console.log(chalk_1.default.blue('Removing conflicting plugin directory...'));
        await fs.remove(CONFLICT_PLUGIN_PATH);
    }
    // 7. Install official plugin
    console.log(chalk_1.default.blue('Installing official Feishu plugin...'));
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
    // 8. Configure channels
    await ensureChannelConfig();
    // 10. Final Verification
    console.log(chalk_1.default.blue('Verifying installation...'));
    const finalConfig = await (0, config_1.readConfig)();
    const checks = [
        !finalConfig.plugins?.entries?.feishu?.enabled,
        finalConfig.plugins?.entries?.[PLUGIN_NAME]?.enabled,
        await fs.pathExists(path.join(PLUGIN_PATH, 'node_modules'))
    ];
    if (checks.every(Boolean)) {
        console.log(chalk_1.default.green('Installation complete! You can now run "openclaw gateway run".'));
    }
    else {
        console.warn(chalk_1.default.yellow('Installation finished but some checks failed. Please run "doctor" command to diagnose.'));
    }
}
//# sourceMappingURL=install.js.map