# cog-cli

The `cog-cli` is a CLI program that allows you to start up several "cogs" and
monitor their status without having to create a bunch of terminal windows for each process. It
also, if you specify a `watcher` in your cog.json will communicate with the Cog Server (`cog-server`)
which allows you to then control and monitor the cogs remotely via your web browser.

## Installation

```bash
npm install @bishopcais/cog-cli
```

(the final command may require `sudo` depending on configuration of OS)

## Usage

```text
$ crun --help
Usage: crun [options] [command]

Options:
  -V, --version                     output the version number
  -h, --help                        output usage information

Commands:
  launch                            Launches daemon.
  load [options] [file]             Load and run a cog application.
  reload [options] [file]           Stop, Unload and load cog again.
  start [options] <cog_id>          Start a stopped cog.
  stop [options] <cog_id>           Stop a running cog.
  unload|remove [options] <cog_id>  Unload a stopped cog.
  status [cog_id]                   Show status of all cogs, or details of specified cog.
  output [cog_id]                   Listen to stdout/stderr output from all cogs or a specified cog.
  ip                                Print out the default IP address cog will use.
  quit                              Exit daemon, and terminates all of its cogs.
  config [options]                  Show configuration. 'cog config --h' to learn more
```

## cog.json

cog-cli utilizes a cog.json file to specify the various settings that a cog should use when
loaded.

An example cog.json file is shown below:

```json
{
  "run": "node",
  "args": [ "child.js" ],
  "watcher": "http://localhost:7777",

  "type": "Cog",
  "id": "instance-1",
  "tags": ["red", "blue", "green"],

  "host": "http://cel-service",
  "port": "8888"
}
```

Note: If you leave out the `host` key but specify a `port`, `cog-cli` will automatically fill
in the `host` value for you using the first non-internal IPv4 address it finds via the
[os.networkInterfaces](https://nodejs.org/api/os.html#os_os_networkinterfaces) function. You can
use the `cog ip` command to see what that IP address will be.

Note: If `watcher` is omitted, it defaults to `http://localhost:7777`.
