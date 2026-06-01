#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const install_1 = require("./commands/install");
const info_1 = require("./commands/info");
const doctor_1 = require("./commands/doctor");
const update_1 = require("./commands/update");
const program = new commander_1.Command();
program
    .name('feishu-plugin-onboard')
    .description('CLI for managing Feishu official plugin for OpenClaw')
    .version('1.0.0', '-V, --cli-version');
program
    .command('install')
    .description('Install and configure Feishu official plugin')
    .option('--version <version>', 'Install a specific version of the plugin')
    .action((options) => (0, install_1.installCommand)(options));
program
    .command('info')
    .description('Show configuration information')
    .option('--all', 'Show all information including configuration content')
    .action((options) => (0, info_1.infoCommand)(options));
program
    .command('doctor')
    .description('Diagnose installation issues')
    .option('--fix', 'Attempt to automatically fix issues')
    .action((options) => (0, doctor_1.doctorCommand)(options));
program
    .command('update')
    .description('Update Feishu official plugin')
    .option('--version <version>', 'Update to a specific version of the plugin')
    .action(async (options) => { await (0, update_1.updateCommand)(options); });
program.parse(process.argv);
//# sourceMappingURL=index.js.map