var path = require('path');
var fs = require('fs');
var home;

if (process.env.CRUN_HOME) {
  home = process.env.CRUN_HOME;
} else if (process.env.HOME) {
  home = path.resolve(process.env.HOME, '.crun');
} else {
  console.warn('Home environment variables not found.')
  home = path.resolve('/etc', '.pm2');
}

if (!fs.existsSync(home))
  fs.mkdirSync(home);

var port = path.resolve(home, 'port');

var config = module.exports = {
  port: port,

  paths: {
    home: home,
    logFile: path.resolve(home, 'crun.log'),
    authFile: path.resolve(home, 'auth.json')
  },

  getCfg: function() {
    if (!fs.existsSync(this.paths.authFile))
      return {}
    return JSON.parse(
      fs.readFileSync(this.paths.authFile, 'utf8')
    );
  },

  saveCfg: function(j, next) {
    fs.writeFile(this.paths.authFile, JSON.stringify(j) , next);
  }
}