const fs = require('fs');
const net = require('net');
const config = require('../config');
const Beacon = require('../beacon/beacon');
const util = require('../util');

let beacon = new Beacon();

let beginStreaming = (socket, id) => {
  let i = id ? ':' + id : '';
  let fn = socket.write.bind(socket);

  beacon.on('stdout' + i, fn);
  beacon.on('stderr' + i, fn);

  socket.on('end', () => {
    beacon.removeListener('stdout' + i, fn);
    beacon.removeListener('stderr' + i, fn);
  });
};

async function quitDaemon() {
  let message = '';
  for (let cogId in beacon.runners) {
    beacon.runners[cogId].stop();
    await util.sleep(util.cog_sleep);
    message += `Stopping and unloading ${cogId}.\n`;
  }
  return message;
}

function killDaemon() {
  quitDaemon();
  process.exit();
}

let server = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    let data = JSON.parse(chunk.toString());
    let cogId = data.id;

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
      beacon.reload(data.cog, (err) => {
        socket.end(`${data.cog.id} - ${err || 'Cog reloaded.'}\n`);
      });
    }
    else if (data.action === 'start') {
      beacon.start(cogId, (err) => {
        socket.end(`${cogId} - ${err || 'Cog started.'}\n`);
      });
    }
    else if (data.action === 'stop') {
      beacon.stop(cogId, (err) => {
        socket.end(`${cogId} - ${err || 'Cog stopped.'}\n`);
      });
    }
    else if (data.action === 'unload') {
      beacon.unload(cogId, (err) => {
        socket.end(`${cogId} - ${err || 'Cog unloaded.'}\n`);
      });
    }
    else if (data.action === 'status') {
      socket.end(beacon.status(cogId));
    }
    else if (data.action === 'output') {
      beginStreaming(socket, cogId);
    }
    else if (data.action === 'quit') {
      quitDaemon().then((msg) => {
        socket.end(`Quitting crun-cli daemon...\n${msg}`);
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

server.on('error', (err) => {
  if (process.send) {
    process.send({'error': err});
  }
  throw err;
});

server.on('listening', (evt) => {
  if (process.send) {
    process.send({'listening': true});
  }
  console.log(`${Date()}. Daemon Launched. Listening to ${config.port}`);
});

process.on('SIGINT', () => killDaemon());
process.on('SIGTERM', () => killDaemon());
process.on('uncaughtException', () => killDaemon());

if (fs.existsSync(config.port)) {
  fs.unlinkSync(config.port);
}
server.listen(config.port);
