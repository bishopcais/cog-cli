import fs from 'fs';
import net from 'net';
import config from '../config';
import Beacon from '../beacon/beacon';
import { sleep } from '../util';

const beacon = new Beacon();

function beginStreaming(socket: net.Socket, id: string): void {
  const i = id ? ':' + id : '';
  const fn = socket.write.bind(socket);

  beacon.on('stdout' + i, fn);
  beacon.on('stderr' + i, fn);

  socket.on('end', () => {
    beacon.removeListener('stdout' + i, fn);
    beacon.removeListener('stderr' + i, fn);
  });
}

async function quitDaemon(): Promise<string> {
  let message = '';
  for (const cogId in beacon.runners) {
    beacon.runners[cogId].stop();
    await sleep();
    message += `Stopping and unloading ${cogId}.\n`;
  }
  return message;
}

function killDaemon(): void {
  quitDaemon();
  process.exit();
}

const server = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    const data = JSON.parse(chunk.toString());
    const cogId = data.id;

    if (!data.action) {
      socket.end('No action.');
    }
    else if (cogId && !beacon.runners[cogId]) {
      socket.end(`There is no cog with id - ${cogId}\n`);
    }
    else if (data.action === 'load') {
      beacon.load(data.cog, (err) => {
        socket.end(`${data.cog.id} - ${err || 'Cog loaded.'}\n`);
      });
    }
    else if (data.action === 'reload') {
      beacon.reload(data.cog, (err?: string): void => {
        socket.end(`${data.cog.id} - ${err || 'Cog reloaded.'}\n`);
      });
    }
    else if (data.action === 'start') {
      beacon.start(cogId, (err?: string): void => {
        socket.end(`${cogId} - ${err || 'Cog started.'}\n`);
      });
    }
    else if (data.action === 'stop') {
      beacon.stop(cogId, (err?: string): void => {
        socket.end(`${cogId} - ${err || 'Cog stopped.'}\n`);
      });
    }
    else if (data.action === 'unload') {
      beacon.unload(cogId, (err?: string): void => {
        socket.end(`${cogId} - ${err || 'Cog unloaded.'}\n`);
      });
    }
    else if (data.action === 'status') {
      socket.end(beacon.status(cogId));
    }
    else if (data.action === 'output') {
      beginStreaming(socket, cogId);
    }
    else if (data.action === 'ping') {
      socket.end(`pong`);
    }
    else if (data.action === 'quit') {
      quitDaemon().then((msg) => {
        socket.end(`Quitting cog-cli daemon...\n${msg}`);
        process.exit();
      }).catch((err) => {
        socket.end(err);
      });
    }
    else {
      socket.end('Invalid action.\n');
    }
  });
});

server.on('error', (err): void => {
  if (process.send) {
    process.send({'error': err});
  }
  throw err;
});

server.on('listening', (): void => {
  if (process.send) {
    process.send({'listening': true});
  }
  console.log(`${Date()}. Daemon Launched. Listening to ${config.port}`);
});

process.on('SIGINT', () => killDaemon());
process.on('SIGTERM', () => killDaemon());
process.on('uncaughtException', (err) => {
  console.error('-- caught exception --');
  console.error(err);
  killDaemon();
});

if (fs.existsSync(config.port)) {
  fs.unlinkSync(config.port);
}

server.listen(config.port);
