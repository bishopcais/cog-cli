import net = require('net');
import fs = require('fs');
import path = require('path');
import {spawn } from 'child_process';
import config = require('../config');
import Cog from '../cog';

interface RequestSignal {
  action: 'load' | 'reload' | 'start' | 'stop' | 'unload' | 'status' | 'output' | 'quit',
  cog?: Cog,
  cog_id?: string
}

// Launches a daemon.
function launch(): void {
  // Check if daemon is alreay launched
  let daemon = connect((err) => {
    if (err) {
      return launchDaemon();
    }
    console.log('Daemon was alreay launched');
    daemon.end();
  });
}

function launchDaemon(): void {
  let log = fs.openSync(config.paths.logFile, 'a');
  let child = spawn(process.execPath || 'node', [
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
  let daemon = net.connect(config.port, (): void => {
    cb();
  });
  daemon.on('error', (): void => {
    cb('error');
  });
  return daemon;
};

let request = (signal: RequestSignal): void => {
  let daemon = connect((err?: string): void => {
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

  load: (cog: Cog) => {
    request({ 'action': 'load', 'cog': cog });
  },

  reload: (cog: Cog) => {
    request({ 'action': 'reload', 'cog': cog });
  },

  start: (cog_id: string) => {
    request({ 'action': 'start', 'cog_id': cog_id });
  },

  stop: (cog_id: string) => {
    request({ 'action': 'stop', 'cog_id': cog_id });
  },

  unload: (cog_id: string) => {
    request({ 'action': 'unload', 'cog_id': cog_id });
  },

  status: (cog_id: string) => {
    request({ 'action': 'status', 'cog_id': cog_id });
  },

  output: (cog_id: string) => {
    request({ 'action': 'output', 'cog_id': cog_id });
  },

  ping: (callback: (connected: boolean) => void) => {
    let daemon = connect((err) => {
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

  quit: () => {
    request({ 'action': 'quit' });
  }
};
