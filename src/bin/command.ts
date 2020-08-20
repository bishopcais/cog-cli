#!/usr/bin/env node
import fs = require('fs');
import path = require('path');
import { sleep, getIP } from '../util';

import program from 'commander';
import bridge = require('./bridge');
import config = require('../config');
import Cog from '../cog';
import { ConfigJson } from '../types';

let version;
try {
  version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), {encoding: 'utf8'})) as {version: string}).version;
}
catch (e) {
  version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), {encoding: 'utf8'})) as {version: string}).version;
}
program.version(version, '-v, --version');

function loadCogFile(file: string): Cog {
  let cog: Cog;
  try {
    cog = (JSON.parse(fs.readFileSync(file, {encoding: 'utf8'})) as Cog);
  }
  catch (err) {
    throw new Error(`Error loading and parsing ${file}`);
  }

  cog.cwd = cog.cwd || path.dirname(path.resolve(file));

  // Legacy allowed port to be defined as string, make sure it is an integer
  if (cog.port) {
    if (typeof cog.port === 'string') {
      cog.port = parseInt(cog.port);
    }
  }

  // Resolve host if not set
  if (cog.port && !cog.host) {
    const host = config.getCfg()['host'];
    if (host) {
      cog.host = host;
    }
    else {
      // In case there are no public IP addresses, just default to localhost
      const ipAddress = getIP();
      cog.host = (ipAddress) ? `http://${ipAddress}` : 'http://localhost';
    }
  }

  // Make sure host starts with http protocol
  const pattern = /^https?:\/\//;
  if (cog.host && !pattern.test(cog.host)) {
    cog.host = `http://${cog.host}`;
  }

  // Set default watcher URL
  cog.watcher = cog.watcher || 'http://localhost:7777';

  if (!cog.run) {
    if (fs.existsSync(path.resolve(cog.cwd, 'package.json'))) {
      const packageJson = JSON.parse(fs.readFileSync(
        path.resolve(cog.cwd, 'package.json'),
        {encoding: 'utf-8'},
      )) as {main?: string};

      if (packageJson.main) {
        cog.run = 'node';
        cog.args = [packageJson.main];
      }
    }
  }
  return cog;
}

function getFiles(file: string, cmd: program.Command): string[] {
  const files = [];
  if (!fs.existsSync(file)) {
    throw new Error(`${file} - file not found`);
  }
  file = fs.realpathSync(file);
  if (fs.lstatSync(file).isDirectory()) {
    if (fs.existsSync(path.join(file, 'cog.json'))) {
      files.push(path.join(file, 'cog.json'));
    }
    else if (cmd.recursive) {
      const dirs = [file];
      while (dirs.length > 0) {
        const dir = dirs.pop();
        if (!dir) {
          break;
        }
        for (const entry of fs.readdirSync(dir)) {
          const current = fs.realpathSync(path.join(dir, entry));
          if (!fs.lstatSync(current).isDirectory()) {
            continue;
          }
          const cogFile = path.join(current, 'cog.json');
          if (fs.existsSync(cogFile)) {
            files.push(path.resolve(cogFile));
          }
          else {
            dirs.push(current);
          }
        }
      }
    }
  }
  else {
    files.push(file);
  }
  return files;
}

function getCogIds(cogId: string, cmd: program.Command): string[] {
  const cogIds = [];
  if (fs.existsSync(cogId)) {
    cmd.file = true;
  }
  if (cmd.file || cmd.recursive) {
    const files = getFiles(cogId, cmd);
    for (const file of files) {
      try {
        cogIds.push(loadCogFile(file).id);
      }
      catch (err) {
        console.error(err);
      }
    }
  }
  else {
    cogIds.push(cogId);
  }
  return cogIds;
}

for (const arg of process.argv) {
  if (arg.endsWith('crun')) {
    console.warn('WARNING: crun command is deprecated, please use cog instead.\n');
  }
}

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

function runFileFunction(func: (cog: Cog) => void, file: string, cmd: program.Command): void {
  bridge.ping((connected: boolean) => {
    if (!connected) {
      return;
    }
    if (!file) {
      file = 'cog.json';
    }
    try {
      const files = getFiles(file, cmd);
      if (files.length === 0) {
        console.error('No cogs found');
        return;
      }

      new Promise((resolve) => {
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
  .option('-r, --recursive', 'Recursively scan directories for cog.json')
  .action((file: string, cmd: program.Command) => {
    runFileFunction(bridge.load, file, cmd);
  });

program.command('reload [file]')
  .description('Stop, unload and load cog again.')
  .option('-r, --recursive', 'Recursively scan directories for cog.json')
  .action((file: string, cmd: program.Command) => {
    runFileFunction(bridge.reload, file, cmd);
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

function runCogFunction(func: (cogId: string) => void, cogId: string, cmd: program.Command): void {
  bridge.ping((connected) => {
    if (!connected) {
      return;
    }
    try {
      const cogIds = getCogIds(cogId, cmd);
      if (cogIds.length === 0) {
        return console.error('No cogs specified');
      }
      new Promise((resolve) => {
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
  .option('-r, --recursive', 'Recursively scan path if directory for cog.json files')
  .action((cogId: string, cmd: program.Command) => {
    runCogFunction(bridge.start, cogId, cmd);
  });

program.command('stop <cog_id|pathh>')
  .description('Stop a running cog.')
  .option('-r, --recursive', 'Recursively scan path if directory for cog.json files')
  .action((cogId: string, cmd: program.Command) => {
    runCogFunction(bridge.stop, cogId, cmd);
  });

program.command('unload <cog_id|path>')
  .option('-r, --recursive', 'Recursively scan path if directory for cog.json files')
  .alias('remove')
  .description('Unload a stopped cog.')
  .action((cogId: string, cmd: program.Command) => {
    runCogFunction(bridge.unload, cogId, cmd);
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

program.action(() => {
  console.log('Invalid option.');
});

program.parse(process.argv);
