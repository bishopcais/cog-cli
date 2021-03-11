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
$ cog --help
Usage: cog [options] [command]

Options:
  -v, --version                          output the version number
  -h, --help                             output usage information

Commands:
  config [options] [variable] [value]    Show or set config variable.
  launch                                 Launches daemon.
  load [options] [file]                  Load and run a cog application.
  reload [options] [file]                Stop, unload and load cog again.
  start [options] <cog_id|path>          Start a stopped cog.
  stop [options] <cog_id|pathh>          Stop a running cog.
  unload|remove [options] <cog_id|path>  Unload a stopped cog.
  status [cog_id]                        Show status of all cogs, or details of specified cog.
  output [cog_id]                        Listen to stdout/stderr output from all cogs or a specified cog.
  ip                                     Print out the default IP address cog-cli will use.
  quit                                   Exit daemon, and terminates all of its cogs.
```

Additionally, for each command, you may use `--help` to view additional information, for example `cog config --help`.

## Configuration

For `cog-cli` to function, you must configure it so that it can communicate with [cog-server](https://github.com/bishopcais/cog-server).
To accomplish this, you will need to run the `cog config` command, setting each value
appropriately. Using just `cog config` will show all available config variables and
their current values. The `username` and `key` fields should correspond with the
values you set for a user within `cog-server`. The `host` value is used as a default
value to use for `watcher` key/value in the `cog.json` file if it is omitted.

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

## Contributing

We are open to contributions.

* The software is provided under the [MIT license](LICENSE). Contributions to
this project are accepted under the same license.
* Please also ensure that each commit in the series has at least one
`Signed-off-by:` line, using your real name and email address. The names in
the `Signed-off-by:` and `Author:` lines must match. If anyone else
contributes to the commit, they must also add their own `Signed-off-by:`
line. By adding this line the contributor certifies the contribution is made
under the terms of the
[Developer Certificate of Origin (DCO)](DeveloperCertificateOfOrigin.txt).
* Questions, bug reports, et cetera are raised and discussed on the issues page.
* Please make merge requests into the master branch.
