import path = require('path');
import fs = require('fs');
import { ConfigJson } from './types';

let home;
if (process.env.COG_HOME) {
  home = process.env.COG_HOME;
}
else if (process.env.HOME) {
  home = path.resolve(process.env.HOME, '.cog');
}
else if (process.env.USERPROFILE) {
  home = path.resolve(process.env.USERPROFILE, '.cog');
}
else {
  console.warn('Home environment variables not found.');
  home = path.resolve('/etc', '.pm2');
}

if (!fs.existsSync(home)) {
  fs.mkdirSync(home);
}

let port = path.resolve(home, 'port');
if (process.platform === 'win32') {
  port = path.join('\\\\?\\pipe', port);
}

const paths = {
  home: home,
  logFile: path.resolve(home, 'cog.log'),
  configFile: path.resolve(home, 'config.json'),
};

const allowedOptions: (keyof ConfigJson)[] = ['username', 'key', 'host'];

export = {
  port,
  paths,

  allowedOptions,

  getCfg: (): ConfigJson => {
    if (!fs.existsSync(paths.configFile)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(paths.configFile, 'utf8')) as ConfigJson;
  },

  saveCfg: (json: ConfigJson, callback: (err: NodeJS.ErrnoException | null) => void): void => {
    fs.writeFile(paths.configFile, JSON.stringify(json), callback);
  },
};
