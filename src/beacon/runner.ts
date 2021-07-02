import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import pidusage from 'pidusage';
import { EventEmitter } from 'events';
import _ from 'lodash';
import { Cog } from '../cog';
import { validSignal } from '../util';

const CACHE_LIMIT = 30;

interface RunnerJson {
  id: string;
  type?: string;
  pid: number;
  cwd: string;
  host?: string;
  port?: number;
  tags?: string[];
  description?: string;
  run: string;
  status: string;
  exitCode: number;
  args?: string[];
}

export default class Runner {
  public cog: Cog;

  public cogId: string;

  private emitter: EventEmitter;

  public cache: {
    type: string;
    data: string;
  }[];

  private child?: ChildProcess;

  public status: 'running' | 'exit';

  public exitCode: number;

  public constructor(cog: Cog) {
    this.cog = cog;
    this.cogId = cog.id;
    this.emitter = new EventEmitter();

    this.cache = [];

    this.status = 'exit';
    this.exitCode = 0;
  }

  public run(next?: (err?: string) => void): void {
    const env = _.extend({}, this.cog.env || {}, process.env, { PWD: this.cog.cwd });

    if (this.cog['path+']) {
      env.PATH = `${this.cog['path+']}:${env.PATH}`;
    }

    const child = this.child = spawn(this.cog.run, this.cog.args, {
      cwd: this.cog.cwd,
      env: env,
      windowsHide: true,
      shell: process.platform === 'win32',
    });

    if (this.cog.log) {
      try {
        const filePath = path.resolve(this.cog.cwd, this.cog.log);
        const logStream = fs.createWriteStream(filePath, { flags: 'a' });
        logStream.on('error', (err) => {
          console.error(err);
        });
        child.stdout.pipe(logStream);
        child.stderr.pipe(logStream);
      }
      catch (err) {
        if (next) {
          next(err);
        }
      }
    }

    child.on('error', (err) => {
      // TODO: log this somewhere?
      this.addToCache('stderr', 'There was a problem spawning a process for this cog:\n');
      this.addToCache('stderr', `${err.toString()}\n`);
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

  public pid(): number {
    return (this.child) ? this.child.pid: -1;
  }

  public stop(next?: () => void): void {
    next = next || ((): void => {
      // do nothing
    });
    if (!this.child || this.status === 'exit') {
      return next();
    }
    this.child.once('close', next);
    this.child.kill();
  }

  public sendSignal(signal: NodeJS.Signals, next?: () => void): void {
    next = next || ((): void => {
      // do nothing
    });
    if (!validSignal) {
      console.error(`invalid signal sent: ${signal}`);
      return next();
    }
    else if (!this.child || this.status === 'exit') {
      return next();
    }
    this.child.kill(signal);
  }

  public getJSON(): RunnerJson {
    return {
      id: this.cog.id,
      type: this.cog.type,
      pid: this.pid(),
      cwd: this.cog.cwd,
      host: this.cog.host,
      port: this.cog.port,
      tags: this.cog.tags,
      description: this.cog.description,
      run: this.cog.run,
      status: this.status,
      exitCode: this.exitCode,
      args: this.cog.args,
    };
  }

  public on(type: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(type, listener);
  }

  public emit(type: string, ...data: unknown[]): void {
    this.emitter.emit(type, data);
  }

  public addToCache(type: string, data: string | Buffer): void {
    this.cache.push({
      type: type,
      data: data.toString(),
    });

    if (this.cache.length > CACHE_LIMIT) {
      this.cache.splice(0, this.cache.length - CACHE_LIMIT);
    }
  }

  public getStat(cb: (err: string | null, stat?: {memory: number; cpu: number}) => void): void {
    if (!this.child || !this.child.pid || this.status !== 'running') {
      return cb(null, {memory: 0, cpu: 0});
    }

    pidusage(this.child.pid, (err, res) => {
      if (err) {
        return cb(err.message);
      }

      return cb(null, {
        memory: res.memory,
        cpu: res.cpu,
      });
    });
  }
}
