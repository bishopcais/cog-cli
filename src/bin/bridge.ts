import net = require('net');
import fs = require('fs');
import path = require('path');
import {spawn } from 'child_process';
import config = require('../config');
import Cog from '../cog';

interface RequestSignal {
  action: 'load' | 'reload' | 'start' | 'stop' | 'unload' | 'status' | 'output' | 'quit';
  cog?: Cog;
  cog_id?: string;
}

function launchDaemon(): void {
  const log = fs.openSync(config.paths.logFile, 'a');
  const child = spawn(process.execPath || 'node', [
    path.join(path.dirname(fs.realpathSync(__filename)), '../daemon/daemon.js')
  ], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ipc', log, log]
  });

  child.once('message', (msg) => {
    child.disconnect();
    if (msg.error) {
      let message = 'Unexpected Error';
      if (msg.error.code === 'EADDRINUSE') {
        message = 'Error: The socket in use. Daemon has probably already launched.';
      }
      console.error(message);
    }
    else {
      if (msg.listening) {
        console.log('Daemon has been launched.');
      }
      else {
        console.error('Unexpected message.');
      }
    }
  });

  child.unref();
}

function connect(cb: (err?: string) => void): net.Socket {
  const daemon = net.connect(config.port, (): void => {
    cb();
  });
  daemon.on('error', (): void => {
    cb('error');
  });
  return daemon;
}

// Launches a daemon.
function launch(): void {
  // Check if daemon is alreay launched
  const daemon = connect((err) => {
    if (err) {
      return launchDaemon();
    }
    console.log('Daemon was alreay launched');
    daemon.end();
  });
}

function request(signal: RequestSignal): void {
  const daemon = connect((err?: string): void => {
    if (err) {
      console.error('Daemon needs to be launched. Launch it with: cog launch');
      return;
    }

    daemon.on('data', (data) => {
      process.stdout.write(data.toString('utf8'));
    });

    daemon.write(JSON.stringify(signal));
  });
}

export = {
  launch: launch,

  load: (cog: Cog): void => {
    request({ 'action': 'load', 'cog': cog });
  },

  reload: (cog: Cog): void => {
    request({ 'action': 'reload', 'cog': cog });
  },

  start: (cog_id: string): void => {
    request({ 'action': 'start', 'cog_id': cog_id });
  },

  stop: (cog_id: string): void => {
    request({ 'action': 'stop', 'cog_id': cog_id });
  },

  unload: (cog_id: string): void => {
    request({ 'action': 'unload', 'cog_id': cog_id });
  },

  status: (cog_id: string): void => {
    request({ 'action': 'status', 'cog_id': cog_id });
  },

  output: (cog_id: string): void => {
    request({ 'action': 'output', 'cog_id': cog_id });
  },

  ping: (callback: (connected: boolean) => void): void => {
    const daemon = connect((err) => {
      if (err) {
        console.error('Daemon needs to be launched. Launch it with: cog launch');
        callback(false);
        return;
      }

      daemon.on('data', (data) => {
        if (data.toString() === 'pong') {
          callback(true);
        }
        else {
          callback(false);
        }
      });

      daemon.write(JSON.stringify('ping'));
    });
  },

  quit: (): void => {
    request({ 'action': 'quit' });
  }
};
