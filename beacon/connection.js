'use strict';

const Emitter = require('events').EventEmitter;
const config = require('../config');
const client = require('socket.io-client');
const helpers = require('./helpers');
const querystring = require('querystring');
const os = require('os');

class Connection {
  constructor(url) {
    this.remote = null;

    this.url = url;
    this.reportURL = this.url + '/runner';

    // Adding events
    this.emitter = new Emitter();
    this.on = this.emitter.on.bind(this.emitter);
  }

  connect(cb) {
    if (this.remote && this.remote.connected) {
      return cb();
    }

    if (!this.remote) {
      this.remote = client.connect(this.reportURL, {
        autoConnect: false,
        query: querystring.stringify({
          info: JSON.stringify(this.getJSON())
        })
      });
    }

    let onConnect = () => {
      cb();
      clear();
      this.remote.on('action', this.emitter.emit.bind(this.emitter, 'action'));
      this.remote.on('disconnect', this.emitter.emit.bind(this.emitter, 'disconnect'));
      this.remote.on('reconnect', this.emitter.emit.bind(this.emitter, 'reconnect'));
      this.remote.on('p cogs', this.emitter.emit.bind(this.emitter, 'p cogs'));
    };

    let onError = (err) => {
      clear();
      if (!this.remote.connected) {
        this.remote.destroy();
        this.remote = null;
      }
      cb('Connection error - ' + err);
    };

    let clear = () => {
      this.remote.removeListener('connect', onConnect);
      this.remote.removeListener('connect_error', onError);
      this.remote.removeListener('error', onError);
    };

    this.remote.on('connect', onConnect);
    this.remote.on('connect_error', onError);
    this.remote.on('error', onError);

    this.remote.connect();
  }

  emit() {
    if (this.remote) {
      this.remote.emit.apply(this.remote, arguments);
    }
  }

  getJSON() {
    let cfg = config.getCfg();

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
    };
  }

  destroy() {
    if (this.remote) {
      this.remote.destroy();
      this.remote = null;
    }
  }
}

module.exports = Connection;
