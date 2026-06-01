"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
exports.runCommandQuiet = runCommandQuiet;
const child_process_1 = require("child_process");
function runCommand(command) {
    try {
        (0, child_process_1.execSync)(command, { stdio: 'inherit' });
    }
    catch (error) {
        throw new Error(`Command failed: ${command}`);
    }
}
function runCommandQuiet(command) {
    try {
        return (0, child_process_1.execSync)(command, { encoding: 'utf-8' }).trim();
    }
    catch (error) {
        throw new Error(`Command failed: ${command}`);
    }
}
//# sourceMappingURL=system.js.map