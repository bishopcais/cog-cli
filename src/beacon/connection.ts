import { EventEmitter } from 'events';
import config from '../config';
import * as socketIo from 'socket.io-client';
import { getInterfaces, NetworkInterfaceInfo } from './helpers';
import { stringify as queryStringify } from 'querystring';
import os from 'os';

interface ConnectionJson {
  user?: string;
  pid: number;
  platform: string;
  interfaces: NetworkInterfaceInfo[];
  username?: string;
  key?: string;
  cpus: os.CpuInfo[];
  memory: number;
  hostname: string;
}

export default class Connection extends EventEmitter {
  public remote: null | SocketIOClient.Socket;

  public url: string;

  private reportUrl: string;

  private handlers: {[key: string]: Function}; // eslint-disable-line @typescript-eslint/ban-types

  public constructor(url: string) {
    super();
    this.remote = null;

    this.url = url;
    this.reportUrl = `${this.url}/runner`;

    this.handlers = {};
  }

  private clear(): void {
    if (this.remote) {
      for (const handler in this.handlers) {
        try {
          this.remote.removeListener(handler, this.handlers[handler]);
        }
        catch (err) {
          console.error(`Could not removeListener for ${handler} - ${(err as string)}`);
        }
      }
    }
  }

  public connect(cb: (err?: string) => void): void {
    if (this.remote && this.remote.connected) {
      return cb();
    }

    if (!this.remote) {
      this.remote = socketIo.connect(this.reportUrl, {
        autoConnect: false,
        query: queryStringify({
          info: JSON.stringify(this.getJSON()),
        }),
      });
    }

    this.handlers.onConnect = (): void => {
      if (!this.remote) {
        cb('No remote');
        return;
      }
      this.clear();
      this.remote.on('action', this.emit.bind(this, 'action'));
      this.remote.on('disconnect', this.emit.bind(this, 'disconnect'));
      this.remote.on('reconnect', this.emit.bind(this, 'reconnect'));
      this.remote.on('p cogs', this.emit.bind(this, 'p cogs'));
      cb();
    };

    this.handlers.onError = (err: Error): void => {
      this.clear();
      if (this.remote && !this.remote.connected) {
        this.remote.close();
        this.remote = null;
      }
      cb(`Connection error - ${err.toString()}`);
    };

    this.remote.on('connect', this.handlers.onConnect);
    this.remote.on('connect_error', this.handlers.onError);
    this.remote.on('error', this.handlers.onError);

    this.remote.connect();
  }

  public remoteEmit(type: string, arg: unknown): void {
    if (this.remote) {
      this.remote.emit(type, arg);
    }
  }

  public getJSON(): ConnectionJson {
    const cfg = config.getCfg();

    return {
      user: process.env.USER,
      pid: process.pid,
      platform: process.platform,
      interfaces: getInterfaces(),
      username: cfg.username,
      key: cfg.key,
      cpus: os.cpus(),
      memory: os.totalmem(),
      hostname: os.hostname(),
    };
  }

  public destroy(): void {
    if (this.remote) {
      this.remote.close();
      this.remote = null;
    }
  }
}
