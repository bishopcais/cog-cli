'use strict';

import fs from 'fs';
import path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import pidusage from 'pidusage';
import { EventEmitter } from 'events';
import _ from 'lodash';
import Cog from '../cog';

const CACHE_LIMIT = 30;

class Runner {
  cog: Cog;
  cogId: string;
  emitter: EventEmitter;
  cache: {type: string, data: string}[];
  child?: ChildProcessWithoutNullStreams;
  status: 'running' | 'exit';
  exitCode: number;

  constructor(cog: Cog) {
    this.cog = cog;
    this.cogId = cog.id;
    this.emitter = new EventEmitter();

    this.cache = [];

    this.status = 'exit';
    this.exitCode = 0;
  }

  run(next: (err?: string) => void): void {
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

  pid(): number {
    return (this.child) ? this.child.pid: -1;
  }

  stop(next?: () => void): void {
    next = next || (() => {});
    if (!this.child || this.status === 'exit') {
      return next();
    }
    this.child.once('close', next);
    this.child.kill();
  }

  sendSignal(signal: string, next?: () => void): void {
    next = next || (() => {});
    if (!this.child || this.status === 'exit') {
      return next();
    }
    this.child.kill(signal);
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

  on(type: string, listener: (...args: any[]) => void) {
    this.emitter.on(type, listener);
  }

  emit(type: string, ...data: any[]) {
    this.emitter.emit(type, data);
  }

  addToCache(type: string, data: string | Buffer) {
    this.cache.push({
      type: type,
      data: data.toString()
    });

    if (this.cache.length > CACHE_LIMIT) {
      this.cache.splice(0, this.cache.length - CACHE_LIMIT);
    }
  }

  getStat(cb: (err: Error | null, stat?: {memory: number, cpu: number}) => void) {
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
