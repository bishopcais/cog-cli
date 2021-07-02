import fs from 'fs';
import path from 'path';

import Runner from './beacon/runner';
import Connection from './beacon/connection';

import config = require('./config');
import { getIP } from './util';


export interface Cog {
  id: string;
  run: string;
  args?: string[];
  watcher: string;
  type?: string;
  description?: string;
  tags?: string[];
  host?: string;
  port?: number;
  log?: string;
  'path+'?: string;
  env: {[key: string]: string};
  cwd: string;
  runner: Runner;
  connection: Connection;
  outputToConnection: boolean;
  intervalId: NodeJS.Timer | null;
}

export function loadCogFile(filePath: string): Cog {
  let cog: Cog;
  try {
    cog = (JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'})) as Cog);
  }
  catch (err) {
    throw new Error(`Error loading and parsing ${filePath}`);
  }

  cog.cwd = cog.cwd || path.dirname(path.resolve(filePath));

  // Legacy allowed port to be defined as string, make sure it is an integer
  if (cog.port) {
    if (typeof cog.port === 'string') {
      cog.port = parseInt(cog.port);
    }
  }

  // Resolve host if not set
  if (cog.port && !cog.host) {
    const host = config.getCfg()['host'];
    if (host) {
      cog.host = host;
    }
    else {
      // In case there are no public IP addresses, just default to localhost
      const ipAddress = getIP();
      cog.host = (ipAddress) ? `http://${ipAddress}` : 'http://localhost';
    }
  }

  // Make sure host starts with http protocol
  const pattern = /^https?:\/\//;
  if (cog.host && !pattern.test(cog.host)) {
    cog.host = `http://${cog.host}`;
  }

  // Set default watcher URL
  cog.watcher = cog.watcher || 'http://localhost:7777';

  if (!cog.run) {
    if (fs.existsSync(path.resolve(cog.cwd, 'package.json'))) {
      const packageJson = JSON.parse(fs.readFileSync(
        path.resolve(cog.cwd, 'package.json'),
        {encoding: 'utf-8'},
      )) as {main?: string};

      if (packageJson.main) {
        cog.run = 'node';
        cog.args = [packageJson.main];
      }
    }
  }
  return cog;
}

export function getCogFiles(file: string): string[] {
  const files = [];
  if (!fs.existsSync(file)) {
    throw new Error(`${file} - file not found`);
  }
  file = fs.realpathSync(file);
  if (fs.lstatSync(file).isDirectory()) {
    const dirs = [[file, 0]];
    while (dirs.length > 0) {
      const [dir, depth] = dirs.shift() as [string, number];
      const cogFile = path.join(dir, 'cog.json');
      if (fs.existsSync(cogFile)) {
        files.push(path.resolve(cogFile));
        continue;
      }
      else if (depth > 2) {
        continue;
      }
      for (const entry of fs.readdirSync(dir)) {
        const current = fs.realpathSync(path.join(dir, entry));
        if (fs.lstatSync(current).isDirectory()) {
          dirs.push([current, depth + 1]);
        }
      }
    }
  }
  else {
    files.push(file);
  }
  return files;
}

export function getCogIds(cogId: string): string[] {
  const cogIds = [];
  if (fs.existsSync(cogId)) {
    const files = getCogFiles(cogId);
    for (const file of files) {
      try {
        cogIds.push(loadCogFile(file).id);
      }
      catch (err) {
        console.error((err as Error).message);
      }
    }
  }
  else {
    cogIds.push(cogId);
  }
  return cogIds;
}
