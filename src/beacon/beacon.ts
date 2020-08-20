import _ from 'lodash';
import { EventEmitter } from 'events';
import Connection from './connection';
import Runner from './runner';
import Cog from '../cog';
import { validSignal } from '../util';

const STAT_REPORT_TIME = 1000;

type callback = (err?: string) => void;

interface CogStat {
  cogId: string;
  memory: number;
  cpu: number;
}

interface Action {
  cogId: string;
  action: string;
  watching: boolean;
}

export default class Beacon {
  private emitter: EventEmitter;

  private runners: {[id: string]: Runner};

  private connections: {[url: string]: Connection};

  private cogs: {[id: string]: Cog};

  public constructor() {
    this.emitter = new EventEmitter();
    this.runners = {};
    this.connections = {};
    this.cogs = {};
  }

  public load(cog: Cog, next: callback): void {
    const err = this.validate(cog);
    if (err) {
      return next(err);
    }

    this.connectCog(cog, (err?: string) => {
      if (err) {
        return next(err);
      }
      this.runCog(cog, next);
    });
  }

  public connectCog(cog: Cog, next: callback): void {
    const url = cog.watcher;
    let connection = this.connections[url];

    if (!connection) {
      connection = this.connections[url] = new Connection(url);
      connection.on('action', this.onAction.bind(this, connection));
      connection.on('disconnect', this.onDisconnect.bind(this, connection));
      connection.on('reconnect', this.onReconnect.bind(this, connection));
    }
    connection.connect((err?: string) => {
      if (err) {
        return next(err);
      }

      cog.connection = connection;
      next();
    });
  }

  public runCog(cog: Cog, next: (err?: string) => void): void {
    if (_.find(this.runners, {cogId: cog.id})) {
      next(`Cog ${cog.id} is already running.`);
      return;
    }

    const runner = new Runner(cog);

    runner.run((err) => {
      next(err);
      if (err) {
        return;
      }

      this.cogs[cog.id] = cog;
      this.runners[cog.id] = runner;
      cog.runner = runner;

      runner.on('start', this.onRunnerUpdate.bind(this, cog));
      runner.on('close', this.onRunnerUpdate.bind(this, cog));
      runner.on('stdout', this.onRunnerStream.bind(this, cog, 'stdout'));
      runner.on('stderr', this.onRunnerStream.bind(this, cog, 'stderr'));
    });
  }

  // Events
  public onAction(connection: Connection, action: Action): void {
    if (!action.cogId) {
      return;
    }
    const cog = this.cogs[action.cogId];

    // Check for permission.
    if (this.connections[cog.watcher] !== connection) {
      return;
    }

    const actionName = action.action.toLowerCase();
    if (actionName === 'watch') {
      if (action.watching) {
        this.startWatching(cog);
      }
      else {
        this.stopWatching(cog);
      }
    }
    else if (actionName === 'clear') {
      cog.runner.cache = [];
      connection.remoteEmit('clear', {cogId: cog.id});
    }
    else if (actionName === 'stop') {
      cog.runner.stop();
    }
    else if (actionName === 'run') {
      cog.runner.run();
    }
    else if (actionName === 'playback') {
      connection.remoteEmit('a playback', cog.runner.cache);
    }
    else {
      const signal = actionName.toUpperCase();
      if (!validSignal(signal)) {
        console.error(`invalid signal sent: ${signal}`);
        return;
      }
      cog.runner.sendSignal((signal as NodeJS.Signals));
    }
  }

  public onDisconnect(connection: Connection): void {
    // Stop watcher.
    const cogs: Cog[] = _.filter(this.cogs, { connection: connection });
    _.each(cogs, (cog: Cog) => this.stopWatching(cog));
  }

  public onReconnect(connection: Connection): void {
    const cogs: Cog[] = _.filter(this.cogs, { connection: connection });
    connection.remoteEmit('u cogs', _.map(cogs, (cog: Cog) => cog.runner.getJSON()));
  }

  public onRunnerUpdate(cog: Cog): void {
    this.connections[cog.watcher].remoteEmit('u cog', this.runners[cog.id].getJSON());
  }

  public onRunnerStream(cog: Cog, type: string, data: unknown): void {
    if (data && typeof data === 'object' && data.toString) {
      data = data.toString();
    }
    if (cog.outputToConnection) {
      cog.connection.remoteEmit('stream', {cogId: cog.id, data: data, type: type});
    }

    this.emitter.emit(`${type}:${cog.id}`, data);
    this.emitter.emit(type, data);
  }

  public start(cogId: string, cb: (err?: string) => void): void {
    this.runners[cogId].run();
    cb();
  }

  // Actions
  public stop(cogId: string, cb: (err?: string) => void): void {
    const runner = this.runners[cogId];
    if (!runner) {
      return cb(`There is no instance loaded with id ${cogId}`);
    }
    runner.stop(cb);
  }

  public unload(cogId: string, cb: (err?: string) => void): void {
    if (this.runners[cogId].status !== 'exit') {
      return cb(`Cog ${cogId} hasn't exited yet. Please close cog first.`);
    }

    const cog = this.cogs[cogId];
    cog.connection.remoteEmit('r cog', cog.runner.getJSON());
    this.stopWatching(cog);

    // remove runner
    delete this.runners[cogId];
    delete this.cogs[cogId];
    delete this.connections[cogId];

    cb();
  }

  public reload(cog: Cog, cb: (err?: string) => void): void {
    this.stop(cog.id, (err?: string) => {
      if (err) {
        cb(err);
        return;
      }
      this.unload(cog.id, (err?: string) => {
        if (err) {
          cb(err);
          return;
        }
        this.load(cog, cb);
      });
    });
  }

  public startWatching(cog: Cog): void {
    cog.outputToConnection = true;
    if (!cog.intervalId) {
      cog.intervalId = setInterval(() => {
        cog.runner.getStat((err, stat) => {
          if (err || !stat) {
            return;
          }
          (stat as CogStat).cogId = cog.id;
          cog.connection.remoteEmit('stat', stat);
        });
      }, STAT_REPORT_TIME);
    }
  }

  public stopWatching(cog: Cog): void {
    cog.outputToConnection = false;
    if (cog.intervalId) {
      clearInterval(cog.intervalId);
      cog.intervalId = null;
    }
  }

  public status(cogId: string): string {
    let result = '';

    if (!cogId) {
      if (_.isEmpty(this.runners)) {
        return 'There are no cogs running.\n';
      }

      result += 'Cogs\n';
      result += '------------\n';
      for (cogId in this.runners) {
        const runner = this.runners[cogId];
        result += `${runner.cog.id}: ${runner.status} ${runner.status === 'exit' ? runner.exitCode : ''}\n`;
      }

      result += '\n\n';
      result += 'Connections\n';
      result += '------------\n';
      for (cogId in this.connections) {
        const conn = this.connections[cogId];
        result += `${conn.url}: ${conn.remote && conn.remote.connected ? 'connected' : 'disconnected'}\n`;
      }
      result += '\n';
      return result;
    }

    if (!this.runners[cogId]) {
      return `There is no cog running with id '${cogId}\n'`;
    }

    result += JSON.stringify(this.runners[cogId].getJSON(), null, 2);
    return result;
  }

  // Interfaces
  public on(type: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(type, listener);
  }

  public removeListener(type: string, listener: (...args: unknown[]) => void): void {
    this.emitter.removeListener(type, listener);
  }

  public validate(cog: Cog): string | void {
    if (!cog.id) {
      return 'Cog id not supplied';
    }

    if (!cog.watcher) {
      return 'The cog needs a watcher endpoint.';
    }
  }
}
