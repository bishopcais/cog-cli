'use strict';

import { EventEmitter } from 'events';
import config from '../config';
import * as socketIo from 'socket.io-client';
import { getInterfaces } from './helpers';
import { stringify as queryStringify } from 'querystring';
import os from 'os';

export default class Connection extends EventEmitter {
  remote: null | SocketIOClient.Socket;
  url: string;
  reportUrl: string;
  handlers: {[key: string]: Function};

  constructor(url: string) {
    super();
    this.remote = null;

    this.url = url;
    this.reportUrl = this.url + '/runner';

    this.handlers = {};
  }

  connect(cb: (err?: string) => void): void {
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

    const clear = (): void => {
      if (this.remote) {
        for (const handler in this.handlers) {
          this.remote.removeListener(handler, this.handlers[handler]);
        }
      }
    };

    this.handlers.onConnect = (): void => {
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

    this.handlers.onError = (err: Error): void => {
      clear();
      if (this.remote && !this.remote.connected) {
        this.remote.close();
        this.remote = null;
      }
      cb('Connection error - ' + err);
    };

    this.remote.on('connect', this.handlers.onConnect);
    this.remote.on('connect_error', this.handlers.onError);
    this.remote.on('error', this.handlers.onError);

    this.remote.connect();
  }

  remoteEmit(type: string, arg: any): void {
    if (this.remote) {
      this.remote.emit(type, arg);
    }
  }

  getJSON(): object {
    const cfg = config.getCfg();

    return {
      'user': process.env.USER,
      'pid': process.pid,
      'platform': process.platform,
      'interfaces': getInterfaces(),
      'username': cfg.username,
      'key': cfg.key,
      'cogs': [],
      'cpus': os.cpus(),
      'memory': os.totalmem(),
      'hostname': os.hostname()
    };
  }

  destroy(): void {
    if (this.remote) {
      this.remote.close();
      this.remote = null;
    }
  }
}
