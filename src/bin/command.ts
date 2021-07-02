#!/usr/bin/env node
import fs = require('fs');
import path = require('path');
import { sleep, getIP } from '../util';

import program from 'commander';
import bridge = require('./bridge');
import config = require('../config');
import { Cog, loadCogFile, getCogFiles, getCogIds } from '../cog';
import { ConfigJson } from '../types';

for (const arg of process.argv) {
  if (arg.endsWith('crun')) {
    console.warn('WARNING: crun command is deprecated, please use cog instead.\n');
  }
}

let version;
try {
  version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), {encoding: 'utf8'})) as {version: string}).version;
}
catch (e) {
  version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), {encoding: 'utf8'})) as {version: string}).version;
}
program.version(version, '-v, --version');

program.command('config [variable] [value]')
  .description('Show or set config variable.')
  .option('-d, --delete', 'Unset the value for config variable')
  .action((variable: keyof ConfigJson | null, value: string | null, cmd: program.Command) => {
    const cfg = config.getCfg();

    const header = `${'Key'.padEnd(8)} | Value\n${'-'.repeat(16)}`;

    if (cmd.delete === true && !variable) {
      console.error('must pass variable to delete');
      return;
    }
    else if (cmd.delete === true && variable) {
      delete cfg[variable];
    }
    else if (!variable) {
      console.log(header);
      for (const option of config.allowedOptions) {
        console.log(`${option.padEnd(8)} | ${cfg[option] || ''}`);
      }
      return;
    }
    else if (variable && !value) {
      console.log(header);
      if (config.allowedOptions.includes(variable)) {
        console.log(`${variable.padEnd(8)} | ${cfg[variable] || ''}`);
        return;
      }

      return console.error(`Invalid config variable: ${variable}`);
    }
    else if (value) {
      if (config.allowedOptions.includes(variable)) {
        cfg[variable] = value;
      }
      else {
        console.error(`Invalid config variable: ${variable}`);
        return;
      }
    }
    config.saveCfg(cfg, (err) => {
      if (err) {
        console.error('Error saving config');
      }
      else {
        console.log('Config updated.');
      }
    });
  });

program.command('launch')
  .description('Launches daemon.')
  .action(bridge.launch);

async function internalRunFileFunction(files: string[], func: (cog: Cog) => void): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    try {
      func(loadCogFile(files[i]));
      if (i < (files.length - 1)) {
        // Brief sleep to let previous cog finish loading
        // before moving onto the next one
        await sleep();
      }
    }
    catch (err) {
      console.error(err);
    }
  }
}

function runFileFunction(func: (cog: Cog) => void, file: string): void {
  bridge.ping((connected: boolean) => {
    if (!connected) {
      return;
    }
    if (!file) {
      file = 'cog.json';
    }
    try {
      const files = getCogFiles(file);
      if (files.length === 0) {
        console.error('No cogs found');
        return;
      }

      new Promise<void>((resolve) => {
        internalRunFileFunction(files, func).then(() => resolve()).catch((err) => console.error(err));
      }).catch((err) => console.error(err));

    }
    catch (err) {
      console.error(err);
    }
  });
}

program.command('load [file]')
  .description('Load and run a cog application.')
  .action((file: string) => {
    runFileFunction(bridge.load, file);
  });

program.command('reload [file]')
  .description('Stop, unload and load cog again.')
  .action((file: string) => {
    runFileFunction(bridge.reload, file);
  });

async function runFunc(cogIds: string[], func: (cogId: string) => void): Promise<void> {
  for (let i = 0; i < cogIds.length; i++) {
    try {
      func(cogIds[i]);
      if (i < (cogIds.length - 1)) {
        await sleep();
      }
    }
    catch (err) {
      console.error(err);
    }
  }
}

function runCogFunction(func: (cogId: string) => void, cogId: string): void {
  bridge.ping((connected) => {
    if (!connected) {
      return;
    }
    try {
      const cogIds = getCogIds(cogId);
      if (cogIds.length === 0) {
        return console.error('No cogs specified');
      }
      new Promise<void>((resolve) => {
        runFunc(cogIds, func).then(() => resolve()).catch((err) => console.error(err));
      }).catch((err) => console.error(err));
    }
    catch (err) {
      console.error(err);
    }
  });
}

program.command('start <cog_id|path>')
  .description('Start a stopped cog.')
  .action((cogId: string) => {
    runCogFunction(bridge.start, cogId);
  });

program.command('stop <cog_id|path>')
  .description('Stop a running cog.')
  .action((cogId: string) => {
    runCogFunction(bridge.stop, cogId);
  });

program.command('unload <cog_id|path>')
  .alias('remove')
  .description('Unload a stopped cog.')
  .action((cogId: string) => {
    runCogFunction(bridge.unload, cogId);
  });

program
  .command('status [cog_id]')
  .description('Show status of all cogs, or details of specified cog.')
  .action(bridge.status);

program.command('output [cog_id]')
  .description('Listen to stdout/stderr output from all cogs or a specified cog.')
  .action(bridge.output);

program.command('ip')
  .description('Print out the default IP address cog-cli will use.')
  .action(() => {
    const ip = getIP();
    if (ip) {
      console.log(ip);
    }
    else {
      console.error('Could not find default IP address.');
    }
  });

program.command('quit')
  .description('Exit daemon, and terminates all of its cogs.')
  .action(bridge.quit);

program.action(() => {
  console.log('Invalid option.');
});

program.parse(process.argv);
