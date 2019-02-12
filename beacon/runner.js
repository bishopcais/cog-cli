'use strict';

const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const pidusage = require('pidusage');
const Emitter = require('events').EventEmitter;
const _ = require('lodash');

const CACHE_LIMIT = 30;

class Runner {
  constructor(cog) {
    this.cog = cog;
    this.cogId = cog.id;
    this.emitter = new Emitter();

    this.cache = [];
  }

  run(next) {
    let env = _.extend({}, this.cog.env || {}, process.env, { PWD: this.cog.cwd });

    if (this.cog['path+']) {
      env.PATH = `${this.cog['path+']}:${env.PATH}`;
    }

    let child = this.child = spawn(this.cog.run, this.cog.args, {
      cwd: this.cog.cwd,
      env: env,
      windowsHide: true,
      shell: process.platform === 'win32'
    });

    if (this.cog.log) {
      try {
        let filePath = path.resolve(this.cog.cwd, this.cog.log);
        let logStream = fs.createWriteStream(filePath, { flags: 'a' });
        logStream.on('error', (err) => {
          console.error(err);
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
      this.addToCache('stderr', 'There was a problem spawning a process for this cog:\n');
      this.addToCache('stderr', err + '\n');
      this.addToCache('stderr', 'Do not bother trying to run this again until this resolved');
      this.emit('stderr', err);
    });

    child.stdout.on('data', (data) => {
      this.addToCache('stdout', data);
      this.emit('stdout', data);
    });

    child.stderr.on('data', (data) => {
      this.addToCache('stderr', data);
      this.emit('stderr', data);
    });

    child.on('close', (code) => {
      this.status = 'exit';
      this.exitCode = code;
      this.emit('close', code);
    });

    this.status = 'running';

    if (next) {
      next();
    }

    this.emit('start', this.child.pid);
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
    };
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
