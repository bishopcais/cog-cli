#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('../util');

let program = require('commander');
let bridge = require('./bridge');
const config = require('../config');
const package_json = require('../package');

program.version(package_json.version);

function getIP() {
  let network_interfaces = os.networkInterfaces();
  for (let name of Object.keys(network_interfaces)) {
    for (let network_interface of network_interfaces[name]) {
      if (network_interface.family === 'IPv6' || network_interface.internal) {
        continue;
      }

      let parts = network_interface.address.split('.');
      if (parts[0] === '10' || parts[0] === '192' || (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31)) {
        continue;
      }
      return network_interface.address;
    }
  }
  return null;
}

function loadCogFile(file) {
  let cog;
  try {
    cog = JSON.parse(fs.readFileSync(file));
  }
  catch (err) {
    throw new Error(`Error loading and parsing ${file}`);
  }

  cog.cwd = cog.cwd || path.dirname(path.resolve(file));

  // Resolve host if not set
  if (cog.port && !cog.host) {
    let host = config.getCfg()['host'];
    if (host) {
      cog.host = host;
    }
    else {
      // In case there are no public IP addresses, just default to localhost
      let ip_address = getIP();
      cog.host = (ip_address) ? 'http://' + ip_address : 'http://localhost';
    }
  }

  // Make sure host starts with http protocol
  let pattern = /^https?:\/\//;
  if (cog.host && !pattern.test(cog.host)) {
    cog.host = 'http://' + cog.host;
  }

  // Set default watcher URL
  cog.watcher = cog.watcher || 'http://localhost:7777';

  return cog;
}

async function getFiles(file, cmd) {
  let files = [];
  if (!fs.existsSync(file)) {
    throw new Error(`${file} - file not found`);
  }
  if (fs.lstatSync(file).isDirectory()) {
    if (fs.existsSync(path.join(file, 'cog.json'))) {
      files.push(path.join(file, 'cog.json'));
    }
    else if (cmd.recursive) {
      let dirs = [file];
      while (dirs.length > 0) {
        let dir = dirs.pop();
        for (let entry of fs.readdirSync(dir, {withFileTypes: true})) {
          if (!entry.isDirectory()) {
            continue;
          }
          let current = path.join(dir, entry.name);
          let cog_file = path.join(current, 'cog.json');
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

async function getCogIds(cog_id, cmd) {
  let cog_ids = [];
  if (cmd.file) {
    let files;
    try {
      files = await getFiles(cog_id, cmd);
    }
    catch (err) {
      throw err;
    }
    for (let file of files) {
      try {
        let cog = loadCogFile(file);
        cog_ids.push(cog.id);
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

program.command('launch')
  .description('Launches daemon.')
  .action(bridge.launch);

async function runFileFunction(func, file, cmd) {
  if (!file) {
    file = 'cog.json';
  }
  try {
    let files = await getFiles(file, cmd);
    if (files.length === 0) {
      return console.error('No cogs found');
    }
    for (let file of files) {
      try {
        let cog = loadCogFile(file);
        func(cog);
        // Brief sleep to let previous cog finish loading
        // before moving onto the next one
        await util.sleep(util.cog_sleep);
      }
      catch (err) {
        console.error(err);
      }
    }
  }
  catch (err) {
    console.error(err);
  }
}

program.command('load [file]')
  .description('Load and run a cog application.')
  .option('-r, --recursive', 'Recursively scan directories for cog.json')
  .action((file, cmd) => {
    runFileFunction(bridge.load, file, cmd);
  });

program.command('reload [file]')
  .description('Stop, Unload and load cog again.')
  .option('-r, --recursive', 'Recursively scan directories for cog.json')
  .action((file, cmd) => {
    runFileFunction(bridge.reload, file, cmd);
  });

async function runCogFunction(func, cog_id, cmd) {
  try {
    let cog_ids = await getCogIds(cog_id, cmd);
    if (cog_ids.length === 0) {
      return console.error('No cogs specified');
    }
    for (let cog_id of cog_ids) {
      try {
        func(cog_id);
        await util.sleep(util.cog_sleep);
      }
      catch (err) {
        console.error(err);
      }
    }
  }
  catch (err) {
    console.error(err);
  }
}

program.command('start <cog_id>')
  .description(`Start a stopped cog.`)
  .option('-f, --file', 'Load cog_id out of passed in file')
  .option('-r, --recursive', 'Recursively scan directories for cog.json files')
  .action((cog_id, cmd) => {
    runCogFunction(bridge.start, cog_id, cmd);
  });

program.command('stop <cog_id>')
  .description('Stop a running cog.')
  .option('-f, --file', 'Load cog_id out of passed in file')
  .option('-r, --recursive', 'Recursively scan directories for cog.json files')
  .action((cog_id, cmd) => {
    runCogFunction(bridge.stop, cog_id, cmd);
  });

program.command('unload <cog_id>')
  .option('-f, --file', 'Load cog_id out of passed in file')
  .option('-r, --recursive', 'Recursively scan directories for cog.json files')
  .alias('remove')
  .description(`Unload a stopped cog.`)
  .action((cog_id, cmd) => {
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
  .description(`Print out the default IP address crun will use.`)
  .action(() => {
    let ip = getIP();
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

program.command('config')
  .description(`Show configuration. 'crun config --h' to learn more`)
  .option('-u, --username [username]', 'Set or get current username')
  .option('-k, --key [key]', 'Set or get current API key')
  .option('-h, --host [host]', 'Set a default host to use, otherwise will attempt to determine it')
  .action((options) => {
    let cfg = config.getCfg();

    if (options.username === true) {
      return console.log(cfg.username || 'username is not set yet.');
    }

    if (options.key === true) {
      return console.log(cfg.key || 'key is not set yet.');
    }

    if (options.host === true) {
      return console.log(cfg.host || 'host is not set yet');
    }

    if (!options.key && !options.username && !options.host) {
      for (let k in cfg) {
        if (cfg.hasOwnProperty(k)) {
          console.log(`${k}: ${cfg[k]}`);
        }
      }
      return;
    }

    if (options.key) {
      cfg.key = options.key;
    }

    if (options.username) {
      cfg.username = options.username;
    }

    if (options.host) {
      cfg.host = options.host;
    }

    config.saveCfg(cfg, (err) => {
      if (err) {
        console.log('Error saving config.');
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
