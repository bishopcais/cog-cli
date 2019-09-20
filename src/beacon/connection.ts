'use strict';

import { EventEmitter } from 'events';
import config from '../config';
import * as socketIo from 'socket.io-client';
import { getInterfaces } from './helpers';
import { stringify as queryStringify } from 'querystring';
import os from 'os';

class Connection extends EventEmitter {
  remote: null | SocketIOClient.Socket;
  url: string
  reportUrl: string;

  constructor(url: string) {
    super();
    this.remote = null;

    this.url = url;
    this.reportUrl = this.url + '/runner';
  }

  connect(cb: (err?: string) => void) {
    if (this.remote && this.remote.connected) {
      return cb();
    }

    if (!this.remote) {
      this.remote = socketIo.connect(this.reportUrl, {
        autoConnect: false,
        query: queryStringify({
          info: JSON.stringify(this.getJSON())
        })
      });
    }

    let onConnect = () => {
      cb();
      clear();
      if (!this.remote) {
        return;
      }
      this.remote.on('action', this.emit.bind(this, 'action'));
      this.remote.on('disconnect', this.emit.bind(this, 'disconnect'));
      this.remote.on('reconnect', this.emit.bind(this, 'reconnect'));
      this.remote.on('p cogs', this.emit.bind(this, 'p cogs'));
    };

    let onError = (err: any) => {
      clear();
      if (this.remote && !this.remote.connected) {
        this.remote.close();
        this.remote = null;
      }
      cb('Connection error - ' + err);
    };

    let clear = () => {
      if (this.remote) {
        this.remote.removeListener('connect', onConnect);
        this.remote.removeListener('connect_error', onError);
        this.remote.removeListener('error', onError);
      }

    };

    this.remote.on('connect', onConnect);
    this.remote.on('connect_error', onError);
    this.remote.on('error', onError);

    this.remote.connect();
  }

  remoteEmit(type: string, ...args: any[]) {
    if (this.remote) {
      this.remote.emit(type, args);
    }
  }

  getJSON() {
    let cfg = config.getCfg();

    return {
      'user': process.env.USER,
      'pid': process.pid,
      'platform': process.platform,
      'interfaces': getInterfaces,
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
      this.remote.close();
      this.remote = null;
    }
  }
}

module.exports = Connection;
