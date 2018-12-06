"use strict";
let
  fs = require('fs'),
  path = require('path'),
  spawn = require('child_process').spawn,
  pidusage = require('pidusage'),
  Emitter = require('events').EventEmitter,
  _ = require('lodash');

let CACHE_LIMIT = 20;
let STAT_REFRESH_RATE = 2000; // Refresh stat every 5 seconds

class Runner {
  constructor(cog) {
    this.cog = cog;
    this.cogId = cog.id;
    this.emitter = new Emitter();

    this.cache = [];
  }

  run(next) {
    // TODO: Figure out how we can make this a let instead of a var
    var runner = this;

    let env = _.extend({}, this.cog.env || {}, process.env, { PWD: this.cog.cwd });

    if (this.cog['path+']) {
      env.PATH = `${this.cog['path+']}:${env.PATH}`;
    }

    let child = this.child = spawn(this.cog.run, this.cog.args, {
      cwd: this.cog.cwd,
      env: env,
      windowsHide: true
    });

    if (this.cog.log) {
      try {
        let filePath = path.resolve(runner.cog.cwd, runner.cog.log);
        let logStream = fs.createWriteStream(filePath, { flags: 'a' });
        logStream.on('error', (err) => {
          console.error(err)
        });
        child.stdout.pipe(logStream);
        child.stderr.pipe(logStream);
      }
      catch (err) {
        return next(err);
      }
    }

    child.on('error', (err) => {
      // TODO: log this somewhere?
      runner.addToCache('stderr', 'There was a problem spawning a process for this cog:\n');
      runner.addToCache('stderr', err + '\n');
      runner.addToCache('stderr', 'Do not bother trying to run this again until this resolved');
      runner.emit('stderr', err);
    });

    child.stdout.on('data', function(data) {
      runner.addToCache('stdout', data);
      runner.emit('stdout', data);
    });

    child.stderr.on('data', function(data) {
      runner.addToCache('stderr', data);
      runner.emit('stderr', data);
    });

    child.on('close', function(code) {
      runner.status = 'exit';
      runner.exitCode = code;
      runner.emit('close', code);
    });

    runner.status = 'running';
    next && next();

    runner.emit('start', this.child.pid);
  }

  pid() {
    return this.child.pid;
  }

  stop(next) {
    next = next || (() => {});
    if (!this.child || this.status === 'exit') {
      return next();
    }
    this.child.once('close', next);
    this.child.kill();
  }

  getJSON() {
    return {
      'id': this.cog.id,
      'type': this.cog.type,
      'pid': this.pid(),
      'cwd': this.cog.cwd,
      'host': this.cog.host,
      'port': this.cog.port,
      'tags': this.cog.tags,
      'description': this.cog.description,
      'run': this.cog.run,
      'status': this.status,
      'exitCode': this.exitCode,
      'args': this.cog.args
    }
  }

  on() {
    this.emitter.on.apply(this.emitter, arguments);
  }

  emit() {
    this.emitter.emit.apply(this.emitter, arguments);
  }

  removeListener() {
    this.emitter.removeListener.apply(this.emitter, arguments);
  }

  addToCache(type, data) {
    let cache = this.cache;
    cache.push({
      type: type,
      data: data.toString()
    });

    if (cache.length > CACHE_LIMIT) {
      cache.splice(0, cache.length - CACHE_LIMIT);
    }
  }

  getStat(cb) {
    if (!this.child || !this.child.pid || this.status !== 'running') {
      return cb(null, {memory: 0, cpu: 0});
    }

    pidusage(this.child.pid, (err, res) => {
      if (err) {
        return cb(err);
      }

      return cb(null, {
        memory: res.memory,
        cpu: res.cpu
      });
    });
  }
}

module.exports = Runner;
