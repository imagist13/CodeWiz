"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptAppIdSecret = promptAppIdSecret;
exports.promptConfirmAppId = promptConfirmAppId;
exports.promptAppId = promptAppId;
exports.promptAppSecret = promptAppSecret;
exports.promptUninstallMcp = promptUninstallMcp;
const inquirer_1 = __importDefault(require("inquirer"));
async function promptAppIdSecret() {
    return inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'appId',
            message: 'Enter Feishu App ID:',
            validate: (input) => input ? true : 'App ID is required',
        },
        {
            type: 'input',
            name: 'appSecret',
            message: 'Enter Feishu App Secret:',
            validate: (input) => input ? true : 'App Secret is required',
        },
    ]);
}
async function promptConfirmAppId(currentAppId) {
    const answer = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Current Feishu App ID is ${currentAppId}. Do you want to use it?`,
            default: true,
        },
    ]);
    return answer.confirm;
}
async function promptAppId() {
    const answer = await inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'appId',
            message: 'Enter Feishu App ID:',
            validate: (input) => input ? true : 'App ID is required',
        },
    ]);
    return answer.appId;
}
async function promptAppSecret() {
    const answer = await inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'appSecret',
            message: 'Enter Feishu App Secret:',
            validate: (input) => input ? true : 'App Secret is required',
        },
    ]);
    return answer.appSecret;
}
async function promptUninstallMcp() {
    const answer = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'uninstall',
            message: 'It is recommended to uninstall the "lark-office" MCP if it is installed. Do you want to proceed?',
            default: true,
        },
    ]);
    return answer.uninstall;
}
//# sourceMappingURL=prompts.js.map