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
  version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), {encoding: 'utf8'})).version;
}
catch (e) {
  version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), {encoding: 'utf8'})).version;
}
program.version(version, '-v, --version');

function loadCogFile(file: string): Cog {
  let cog;
  try {
    cog = JSON.parse(fs.readFileSync(file, {encoding: 'utf8'}));
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
      const ip_address = getIP();
      cog.host = (ip_address) ? 'http://' + ip_address : 'http://localhost';
    }
  }

  // Make sure host starts with http protocol
  const pattern = /^https?:\/\//;
  if (cog.host && !pattern.test(cog.host)) {
    cog.host = 'http://' + cog.host;
  }

  // Set default watcher URL
  cog.watcher = cog.watcher || 'http://localhost:7777';

  if (!cog.run) {
    if (fs.existsSync(path.resolve(cog.cwd, 'package.json'))) {
      const package_json = JSON.parse(
        fs.readFileSync(path.resolve(cog.cwd, 'package.json'), {encoding: 'utf-8'})
      );
      if (package_json.main) {
        cog.run = 'node';
        cog.args = [package_json.main];
      }
    }
  }
  return cog;
}

async function getFiles(file: string, cmd: program.Command): Promise<string[]> {
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
          const cog_file = path.join(current, 'cog.json');
          if (fs.existsSync(cog_file)) {
            files.push(path.resolve(cog_file));
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

async function getCogIds(cog_id: string, cmd: program.Command): Promise<string[]> {
  const cog_ids = [];
  if (fs.existsSync(cog_id)) {
    cmd.file = true;
  }
  if (cmd.file || cmd.recursive) {
    const files = await getFiles(cog_id, cmd);
    for (const file of files) {
      try {
        cog_ids.push(loadCogFile(file).id);
      }
      catch (err) {
        console.error(err);
      }
    }
  }
  else {
    cog_ids.push(cog_id);
  }
  return cog_ids;
}

for (const arg of process.argv) {
  if (arg.endsWith('crun')) {
    console.warn('WARNING: crun command is deprecated, please use cog instead.\n');
  }
}

program.command('launch')
  .description('Launches daemon.')
  .action(bridge.launch);

async function runFileFunction(func: Function, file: string, cmd: program.Command): Promise<void> {
  bridge.ping(async (connected) => {
    if (!connected) {
      return;
    }
    if (!file) {
      file = 'cog.json';
    }
    try {
      const files = await getFiles(file, cmd);
      if (files.length === 0) {
        return console.error('No cogs found');
      }

      for (let i = 0; i < files.length; i++) {
        try {
          func(loadCogFile(file));
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

async function runCogFunction(func: Function, cogId: string, cmd: program.Command): Promise<void> {
  bridge.ping(async (connected) => {
    if (!connected) {
      return;
    }
    try {
      const cogIds = await getCogIds(cogId, cmd);
      if (cogIds.length === 0) {
        return console.error('No cogs specified');
      }
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
    catch (err) {
      console.error(err);
    }
  });
}

program.command('start <cog_id|path>')
  .description(`Start a stopped cog.`)
  .option('-r, --recursive', 'Recursively scan path if directory for cog.json files')
  .action((cog_id: string, cmd: program.Command) => {
    runCogFunction(bridge.start, cog_id, cmd);
  });

program.command('stop <cog_id|pathh>')
  .description('Stop a running cog.')
  .option('-r, --recursive', 'Recursively scan path if directory for cog.json files')
  .action((cog_id: string, cmd: program.Command) => {
    runCogFunction(bridge.stop, cog_id, cmd);
  });

program.command('unload <cog_id|path>')
  .option('-r, --recursive', 'Recursively scan path if directory for cog.json files')
  .alias('remove')
  .description(`Unload a stopped cog.`)
  .action((cog_id: string, cmd: program.Command) => {
    runCogFunction(bridge.unload, cog_id, cmd);
  });

program
  .command('status [cog_id]')
  .description(`Show status of all cogs, or details of specified cog.`)
  .action(bridge.status);

program.command('output [cog_id]')
  .description(`Listen to stdout/stderr output from all cogs or a specified cog.`)
  .action(bridge.output);

program.command('ip')
  .description(`Print out the default IP address cog-cli will use.`)
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
  .description(`Exit daemon, and terminates all of its cogs.`)
  .action(bridge.quit);

program.command('config [variable] [value]')
  .description(`Show or set config variable.`)
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
        console.log(`${variable.padEnd(8)} | ${cfg[variable]}`);
        return;
      }
      else {
        return console.error(`Invalid config variable: ${variable}`);
      }
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
