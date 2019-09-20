import path = require('path');
import fs = require('fs');

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

export = {
  port: port,

  paths: {
    home: home,
    logFile: path.resolve(home, 'cog.log'),
    authFile: path.resolve(home, 'auth.json')
  },

  allowedOptions: ['username', 'key', 'host'],

  getCfg: function() {
    if (!fs.existsSync(this.paths.authFile)) {
      return {};
    }
    return JSON.parse(
      fs.readFileSync(this.paths.authFile, 'utf8')
    );
  },

  saveCfg: function(json: object, callback: (err: NodeJS.ErrnoException | null) => void) {
    fs.writeFile(this.paths.authFile, JSON.stringify(json), callback);
  }
};
