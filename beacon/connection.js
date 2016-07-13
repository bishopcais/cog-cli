"use strict"
var
  Emitter = require('events').EventEmitter,
  _ = require('lodash'),
  config = require('../config'),
  client = require('socket.io-client'),
  helpers = require('./helpers'),
  querystring = require('querystring'),
  os = require('os');

class Connection {
  constructor(url) {
    this.url = url;
    this.reportURL = this.url + '/runner';

    // Adding events
    this.emitter = new Emitter();
    this.on = this.emitter.on.bind(this.emitter);
  }

  connect(cb) {
    var
      c = this,
      exists = !!this.remote;

    if (exists && this.remote.connected)
      return cb();

    if (!exists)
      this.remote = client.connect(this.reportURL, {
        autoConnect: false,
        query: querystring.stringify({
          info: JSON.stringify(this.getJSON())
        })
      });

    var remote = this.remote;

    var onConnect = () => {
      cb();
      clear();
      remote.on('action', c.emitter.emit.bind(c.emitter, 'action') );
      remote.on('disconnect', c.emitter.emit.bind(c.emitter, 'disconnect') );
      remote.on('reconnect', c.emitter.emit.bind(c.emitter, 'reconnect') );
      remote.on('p cogs', c.emitter.emit.bind(c.emitter, 'p cogs') );
    }

    var onError = (err) => {
      if (!exists){
        this.remote.destroy();
        this.remote = null;
      }
      clear();
      cb('Connection error - ' + err);
    }

    var clear = () => {
      remote.removeListener('connect', onConnect);
      remote.removeListener('connect_error', onError);
      remote.removeListener('error', onError);
    }

    remote.on('connect', onConnect);
    remote.on('connect_error', onError);
    remote.on('error', onError);

    remote.connect();
  }

  emit() {
    if (this.remote)
      this.remote.emit.apply(this.remote, arguments);
  }

  getJSON() {
    var cfg = config.getCfg();

    return {
      'user': process.env.USER,
      'pid': process.pid,
      'platform': process.platform,
      'interfaces': helpers.interfaces(),
      'username': cfg.username,
      'key': cfg.key,
      'cogs': [],
      'cpus': os.cpus(),
      'memory': os.totalmem(),
      'hostname': os.hostname()
    }
  }

  destroy() {
    if (this.remote) {
      this.remote.destroy();
      this.remote = null;
    }
  }
}

module.exports = Connection;