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
exports.doctorCommand = doctorCommand;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../utils/config");
const prompts_1 = require("../utils/prompts");
const system_1 = require("../utils/system");
const EXTENSIONS_DIR = path.join(os.homedir(), '.openclaw', 'extensions');
const PLUGIN_NAME = 'feishu-openclaw-plugin';
const PLUGIN_PATH = path.join(EXTENSIONS_DIR, PLUGIN_NAME);
async function doctorCommand(options = {}) {
    console.log(chalk_1.default.blue('Running diagnostic checks...'));
    let checksPassed = true;
    // 1. Check plugin directory
    if (!(await fs.pathExists(PLUGIN_PATH))) {
        console.error(chalk_1.default.red(`[FAIL] Plugin directory missing at ${PLUGIN_PATH}`));
        console.warn(chalk_1.default.yellow('Suggestion: Plugin is not installed. Use "feishu-plugin-onboard install" command to install it.'));
        process.exit(1);
    }
    // 2. Check node_modules
    if (await fs.pathExists(PLUGIN_PATH)) {
        if (!(await fs.pathExists(path.join(PLUGIN_PATH, 'node_modules')))) {
            console.error(chalk_1.default.red(`[FAIL] node_modules missing in plugin directory`));
            if (options.fix) {
                console.log(chalk_1.default.blue('Attempting to fix: Running npm install...'));
                try {
                    // Change directory and run npm install
                    // We can't easily change process.cwd() for one command safely in parallel, but here it's linear.
                    // Better to use cwd option in execSync if possible, but runCommand uses execSync simply.
                    // Let's modify runCommand to accept cwd or just use child_process directly here for flexibility
                    // Or use `cd path && command`
                    (0, system_1.runCommand)(`cd "${PLUGIN_PATH}" && npm install`);
                    console.log(chalk_1.default.green('[FIXED] npm install completed.'));
                }
                catch (e) {
                    console.error(chalk_1.default.red('[FIX FAIL] Failed to run npm install. Please try manually.'));
                }
            }
            else {
                console.warn(chalk_1.default.yellow(`Suggestion: Plugin dependencies not installed. Run "npm install" in ${PLUGIN_PATH} or run "feishu-plugin-onboard doctor --fix".`));
            }
            checksPassed = false;
        }
    }
    // 3. Check configuration (plugins.allow)
    const config = await (0, config_1.readConfig)();
    if (!config.plugins?.allow?.includes(PLUGIN_NAME)) {
        console.error(chalk_1.default.red(`[FAIL] Plugin not found in plugins.allow`));
        if (options.fix) {
            console.log(chalk_1.default.blue('Attempting to fix: Adding plugin to allow list...'));
            try {
                if (!config.plugins)
                    config.plugins = {};
                if (!config.plugins.allow)
                    config.plugins.allow = [];
                config.plugins.allow.push(PLUGIN_NAME);
                await (0, config_1.writeConfig)(config);
                console.log(chalk_1.default.green('[FIXED] Plugin added to allow list.'));
            }
            catch (e) {
                console.error(chalk_1.default.red('[FIX FAIL] Failed to update configuration.'));
            }
        }
        else {
            console.warn(chalk_1.default.yellow('Suggestion: Plugin is not allowed in configuration. Run "feishu-plugin-onboard doctor --fix" to automatically add it.'));
        }
        checksPassed = false;
    }
    // 4. Check channel configuration
    const feishuChannel = config.channels?.feishu;
    let channelConfigValid = false;
    if (feishuChannel && feishuChannel.appId && feishuChannel.appSecret) {
        if (typeof feishuChannel.appId === 'string' && typeof feishuChannel.appSecret === 'string') {
            channelConfigValid = true;
        }
    }
    if (!channelConfigValid) {
        console.error(chalk_1.default.red(`[FAIL] Feishu channel configuration missing or incomplete`));
        if (options.fix) {
            console.log(chalk_1.default.blue('Attempting to fix: Configuring App ID and Secret...'));
            try {
                if (!config.channels)
                    config.channels = {};
                if (!config.channels.feishu) {
                    // Init defaults if missing, similar to install logic
                    config.channels.feishu = {
                        enabled: true,
                        appId: "",
                        appSecret: "",
                        domain: "feishu",
                        connectionMode: "websocket",
                        requireMention: true,
                        dmPolicy: "pairing",
                        groupPolicy: "allowlist",
                        allowFrom: [],
                        groupAllowFrom: []
                    };
                }
                const { appId, appSecret } = await (0, prompts_1.promptAppIdSecret)();
                config.channels.feishu.appId = appId;
                config.channels.feishu.appSecret = appSecret;
                await (0, config_1.writeConfig)(config);
                console.log(chalk_1.default.green('[FIXED] Channel configuration updated.'));
            }
            catch (e) {
                console.error(chalk_1.default.red('[FIX FAIL] Failed to update channel configuration.'));
            }
        }
        else {
            console.warn(chalk_1.default.yellow('Suggestion: App ID or Secret missing. Run "feishu-plugin-onboard doctor --fix" to configure them.'));
        }
        checksPassed = false;
    }
    if (checksPassed) {
        console.log(chalk_1.default.green('All checks passed!'));
    }
    else {
        // If we tried to fix things, maybe checks are passed now?
        // The previous logic marked checksPassed = false immediately upon finding an error.
        // If fix was successful, strictly speaking the "check" passed *after* fix.
        // But for simplicity, let's keep it as "some checks failed initially".
        // Or we could re-run checks? That might be recursive.
        // Let's just say "Done".
        if (options.fix) {
            console.log(chalk_1.default.blue('Fix attempts finished. Please run doctor again to verify.'));
        }
        else {
            console.log(chalk_1.default.yellow('Some checks failed. Use "feishu-plugin-onboard doctor --fix" to attempt automatic repair.'));
            process.exit(1);
        }
    }
}
//# sourceMappingURL=doctor.js.map