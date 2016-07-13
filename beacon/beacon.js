"use strict";
var
  Emitter = require('events').EventEmitter,
  _ = require('lodash'),
  Runner = require('./runner'),
  Connection = require('./connection');

var STAT_REPORT_TIME = 1000;

class Beacon {
  constructor() {
    this.emitter = new Emitter();
    this.runners = {};
    this.connections = {};
    this.cogs = {};
  }

  load(cog, next) {
    var beacon = this;

    var e = this.validate(cog);
    if (e) return next(e);

    beacon.connectCog(cog, (err) => {
      if (err) return next(err);
      beacon.runCog(cog, next);
    });
  }

  connectCog(cog, next) {
    var url = cog.watcher;
    var connection = this.connections[url];

    if (!connection) {
      connection = this.connections[url] = new Connection(url);
      connection.on('action', this.onAction.bind(this, connection));
      connection.on('disconnect', this.onDisconnect.bind(this, connection));
      connection.on('reconnect', this.onReconnect.bind(this, connection));
    }
    connection.connect((err) => {
      if (err) return next(err);
      cog.connection = connection;
      next();
    });
  }

  runCog(cog, next) {
    if (_.find(this.runners, { cogId: cog.id }))
      return next(`Cog ${cog.id} is already running.`);

    var
      beacon = this,
      runner = new Runner(cog);

    runner.run((err) => {
      next(err);
      if (err) return;

      this.cogs[cog.id] = cog;
      this.runners[cog.id] = runner;
      cog.runner = runner;

      runner.on('start', beacon.onRunnerUpdate.bind(beacon, cog));
      runner.on('close', beacon.onRunnerUpdate.bind(beacon, cog));
      runner.on('stdout', beacon.onRunnerStream.bind(beacon, cog, 'stdout'));
      runner.on('stderr', beacon.onRunnerStream.bind(beacon, cog, 'stderr'));
    });
  }

  // Events
  onAction(connection, action) {
    if (action.cogId)
      var cog = this.cogs[action.cogId];

    // Check for permission.
    if (cog && this.connections[cog.watcher] !== connection)
      return;

    if (cog && action.action == 'watch') {
      if (action.watching) this.startWatching(cog);
      else this.stopWatching(cog);

    } else if (cog && action.action == 'stop') {
      cog.runner.stop();

    } else if (cog && action.action == 'run') {
      cog.runner.run();

    } else if (cog && action.action == 'playback') {
      connection.emit('a playback', cog.runner.cache);
    }
  }

  onDisconnect(connection) {
    // Stop watcher.
    var beacon = this;
    var cogs =_.filter(this.cogs, { connection : connection });
    _.each(cogs, (cog) => { beacon.stopWatching(cog); });
  }

  onReconnect(connection) {
    var cogs =_.filter(this.cogs, { connection : connection });
    var cogJSONs = _.map(cogs, (cog) => {  return cog.runner.getJSON(); });
    connection.emit('u cogs', cogJSONs);
  }

  onRunnerUpdate(cog) {
    var runner = this.runners[cog.id];
    var connection = this.connections[cog.watcher];
    connection.emit('u cog', runner.getJSON());
  }

  onRunnerStream(cog, type, data) {
    if (cog.outputToConnection)
      cog.connection.emit('stream', { cogId: cog.id, data: data.toString(), type: type });

    this.emitter.emit(type + ':' + cog.id, data);
    this.emitter.emit(type, data);
  }

  // Actions
  stop(cogId, cb) {
    var runner = this.runners[cogId];
    if (!runner)
      return cb('There is no instance loaded with id ' + cogId);
    runner.stop(cb);
  }

  run(cogId, cb) {
    this.runners[cogId].run();
    cb();
  }

  unload(cogId, cb) {
    var c = this.runners[cogId].getJSON();
    var cog = this.cogs[cogId];

    if (c.status != 'exit')
      return cb(`Cog hasn't exitted yet. Please close cog first.`);

    cog.connection.emit('r cog', cog.runner.getJSON());
    this.stopWatching(cog);

    // remove runner
    delete this.runners[cogId];
    delete this.cogs[cogId];
    delete this.connections[cogId];

    cb();
  }

  reload(cog, cb) {
    var
      beacon = this,
      cogId = cog.id;

    beacon.stop(cogId, (err) => {
      if (err) return cb(err);
      beacon.unload(cogId, (err) => {
        if (err) return cb(err);
        beacon.load(cog, cb);
      });
    });
  }

  startWatching(cog) {
    cog.outputToConnection = true;
    if (!cog.intervalId)
      cog.intervalId = setInterval(() => {
        cog.runner.getStat((err, stat) => {
          if (err) return;
          stat.cogId = cog.id;
          cog.connection.emit('stat', stat);
        });
      }, STAT_REPORT_TIME);
  }

  stopWatching(cog) {
    cog.outputToConnection = false;
    clearInterval(cog.intervalId);
    cog.intervalId = null;
  }

  status(cogId) {
    var result = '';
    var r, c;

    if (!cogId) {
      if (_.isEmpty(this.runners))
        return 'There are no cogs running.\n'

      result += 'Cogs\n';
      result += '------------\n';
      for (cogId in this.runners) {
        r = this.runners[cogId].getJSON();
        result += `${r.id}: ${r.status} ${r.status == 'exit' ? r.exitCode : ''}\n`;
      }

      result += '\n\n';
      result += 'Connections\n';
      result += '------------\n';
      for (cogId in this.connections) {
        c = this.connections[cogId];
        result += `${c.url}: ${c.remote && c.remote.connected ? 'connected' : 'disconnected'}\n`;
      }
      result += '\n';
      return result;
    }
    r = this.runners[cogId];

    if (!r)
      return `There is no cog running with id '${cogId}\n'`

    result += JSON.stringify(r.getJSON(), null, 2);
    return result;
  }

  // Interfaces
  on() {
    this.emitter.on.apply(this.emitter, arguments);
  }

  removeListener() {
    this.emitter.removeListener.apply(this.emitter, arguments);
  }

  validate(cog) {
    if (!cog.id)
      return 'Cog id not supplied';

    if (!cog.watcher)
      return 'The cog needs a watcher endpoint.';
  }
}

module.exports = Beacon;