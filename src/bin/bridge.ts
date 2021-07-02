import net = require('net');
import fs = require('fs');
import path = require('path');
import {spawn } from 'child_process';
import config = require('../config');
import { Cog } from '../cog';

interface RequestSignal {
  action: 'load' | 'reload' | 'start' | 'stop' | 'unload' | 'status' | 'output' | 'quit';
  cog?: Cog;
  cogId?: string;
}

function launchDaemon(): void {
  const log = fs.openSync(config.paths.logFile, 'a');
  const child = spawn(
    process.execPath || 'node',
    [path.join(path.dirname(fs.realpathSync(__filename)), '../daemon/daemon.js')],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ipc', log, log],
    },
  );

  child.once('message', (msg: {error?: {code?: string}, listening: boolean}) => {
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

  start: (cogId: string): void => {
    request({ 'action': 'start', cogId });
  },

  stop: (cogId: string): void => {
    request({ 'action': 'stop', cogId });
  },

  unload: (cogId: string): void => {
    request({ 'action': 'unload', cogId });
  },

  status: (cogId: string): void => {
    request({ 'action': 'status', cogId });
  },

  output: (cogId: string): void => {
    request({ 'action': 'output', cogId });
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
  },
};
