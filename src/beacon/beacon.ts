'use strict';

const _ = require('lodash');
import { EventEmitter } from 'events';

const Runner = require('./runner');
const Connection = require('./connection');

let STAT_REPORT_TIME = 1000;

export default class Beacon {
  emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.runners = {};
    this.connections = {};
    this.cogs = {};
  }

  load(cog, next) {
    let e = this.validate(cog);
    if (e) {
      return next(e);
    }

    this.connectCog(cog, (err) => {
      if (err) {
        return next(err);
      }
      this.runCog(cog, next);
    });
  }

  connectCog(cog, next) {
    let url = cog.watcher;
    let connection = this.connections[url];

    if (!connection) {
      connection = this.connections[url] = new Connection(url);
      connection.on('action', this.onAction.bind(this, connection));
      connection.on('disconnect', this.onDisconnect.bind(this, connection));
      connection.on('reconnect', this.onReconnect.bind(this, connection));
    }
    connection.connect((err) => {
      if (err) {
        return next(err);
      }

      cog.connection = connection;
      next();
    });
  }

  runCog(cog, next) {
    if (_.find(this.runners, { cogId: cog.id })) {
      return next(`Cog ${cog.id} is already running.`);
    }

    let runner = new Runner(cog);

    runner.run((err) => {
      next(err);
      if (err) return;

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
  onAction(connection, action) {
    if (!action.cogId) {
      return;
    }
    let cog = this.cogs[action.cogId];

    // Check for permission.
    if (this.connections[cog.watcher] !== connection) {
      return;
    }

    let action_name = action.action.toLowerCase();

    if (action_name === 'watch') {
      if (action.watching) {
        this.startWatching(cog);
      }
      else {
        this.stopWatching(cog);
      }
    }
    else if (action_name === 'stop') {
      cog.runner.stop();
    }
    else if (action_name === 'run') {
      cog.runner.run();
    }
    else if (action_name === 'playback') {
      connection.remoteEmit('a playback', cog.runner.cache);
    }
    else {
      cog.runner.sendSignal(action_name.toUpperCase());
    }
  }

  onDisconnect(connection) {
    // Stop watcher.
    let cogs = _.filter(this.cogs, { connection: connection });
    _.each(cogs, (cog) => { this.stopWatching(cog); });
  }

  onReconnect(connection) {
    let cogs = _.filter(this.cogs, { connection: connection });
    let cogJSONs = _.map(cogs, (cog) => { return cog.runner.getJSON(); });
    connection.remoteEmit('u cogs', cogJSONs);
  }

  onRunnerUpdate(cog) {
    this.connections[cog.watcher].remoteEmit('u cog', this.runners[cog.id].getJSON());
  }

  onRunnerStream(cog, type, data) {
    if (cog.outputToConnection) {
      cog.connection.remoteEmit('stream', {cogId: cog.id, data: data.toString(), type: type});
    }

    this.emitter.emit(type + ':' + cog.id, data);
    this.emitter.emit(type, data);
  }

  start(cogId, cb) {
    this.runners[cogId].run();
    cb();
  }

  // Actions
  stop(cogId, cb) {
    let runner = this.runners[cogId];
    if (!runner) {
      return cb('There is no instance loaded with id ' + cogId);
    }
    runner.stop(cb);
  }

  unload(cogId, cb) {
    let c = this.runners[cogId].getJSON();
    let cog = this.cogs[cogId];

    if (c.status !== 'exit') {
      return cb(`Cog hasn't exited yet. Please close cog first.`);
    }

    cog.connection.remoteEmit('r cog', cog.runner.getJSON());
    this.stopWatching(cog);

    // remove runner
    delete this.runners[cogId];
    delete this.cogs[cogId];
    delete this.connections[cogId];

    cb();
  }

  reload(cog, cb) {
    this.stop(cog.id, (err) => {
      if (err) {
        return cb(err);
      }
      this.unload(cog.id, (err) => {
        if (err) {
          return cb(err);
        }
        this.load(cog, cb);
      });
    });
  }

  startWatching(cog) {
    cog.outputToConnection = true;
    if (!cog.intervalId) {
      cog.intervalId = setInterval(() => {
        cog.runner.getStat((err, stat) => {
          if (err) {
            return;
          }
          stat.cogId = cog.id;
          cog.connection.remoteEmit('stat', stat);
        });
      }, STAT_REPORT_TIME);
    }
  }

  stopWatching(cog) {
    cog.outputToConnection = false;
    clearInterval(cog.intervalId);
    cog.intervalId = null;
  }

  status(cogId) {
    let result = '';

    if (!cogId) {
      if (_.isEmpty(this.runners)) {
        return 'There are no cogs running.\n';
      }

      result += 'Cogs\n';
      result += '------------\n';
      for (cogId in this.runners) {
        let r = this.runners[cogId].getJSON();
        result += `${r.id}: ${r.status} ${r.status === 'exit' ? r.exitCode : ''}\n`;
      }

      result += '\n\n';
      result += 'Connections\n';
      result += '------------\n';
      for (cogId in this.connections) {
        let c = this.connections[cogId];
        result += `${c.url}: ${c.remote && c.remote.connected ? 'connected' : 'disconnected'}\n`;
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
  on(type: string, listener: (...args: any[]) => void) {
    this.emitter.on(type, listener);
  }

  removeListener(type: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(type, listener);
  }

  validate(cog) {
    if (!cog.id) {
      return 'Cog id not supplied';
    }

    if (!cog.watcher) {
      return 'The cog needs a watcher endpoint.';
    }
  }
}
