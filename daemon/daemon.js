let
  fs = require('fs'),
  net = require('net'),
  config = require('../config'),
  Beacon = require('../beacon/beacon'),
  beacon = new Beacon;


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

let quitNow = () => {
  process.exit()
};

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
        socket.end((err || 'Cog started.') + '\n');
      });
    }
    else if (data.action === 'reload') {
      beacon.reload(data.cog, (err) => {
        socket.end((err || 'Cog reloaded.') + '\n');
      });
    }
    else if (data.action === 'run') {
      beacon.run(cogId, (err) => {
        socket.end((err || 'Cog restarted.') + '\n');
      });
    }
    else if (data.action === 'stop') {
      beacon.stop(cogId, (err) => {
        socket.end((err || 'Cog stopped.') + '\n');
      });
    }
    else if (data.action === 'unload') {
      beacon.unload(cogId, (err) => {
        socket.end((err || 'Cog removed.') + '\n');
      });
    }
    else if (data.action === 'status') {
      socket.end(beacon.status(cogId));
    }
    else if (data.action === 'output') {
      beginStreaming(socket, cogId);
    }
    else if (data.action === 'quit') {
      socket.end('quitting..\n');
      quitNow();
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
  console.log(`${Date()}. Daemon Launched. Listening to ${config.port}`)
});

if (fs.existsSync(config.port)) {
  fs.unlinkSync(config.port);
}
server.listen(config.port);