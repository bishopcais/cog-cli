# Cog Runner

The Cog Runner (or `crun-cli`) is a CLI program that allows you to start up several "cogs" and
monitor their status without having to create a bunch of terminal windows for each process. It
also, if you specify a `watcher` in your cog.json will communicate with the Cog Server (`crun-server`)
which allows you to then control and monitor the cogs remotely via your web browser.

## Usage
### Install globally with:
`npm link`

### Start Cog Runner
`crun launch`

### Configure crun-server key
`crun config -u <username> -k <key>`

Note: The username and key are configured within crun-server.

### Start a cog:
`crun start <cog.json file path>`
`crun load <cog.json file path>`

Note: If you leave out the cog.json argument, `crun-cli` will look in the current
directory for a `cog.json` and if it's found, load that.

### Stop a cog:
`crun stop <cog_id>`

### List all cogs:
`crun list`

### Kill cog daemon:
`crun kill`

### Monitor cog stdout:
`crun stdout <cog_id>`


### Quit Cog Runner
`crun quit`

## cog.json
Note: If you leave out the `host` key but specify a `port`, `crun-cli` will automatically fill
in the `host` value for you using the first non-internal IPv4 address it finds via the 
[os.networkInterfaces](https://nodejs.org/api/os.html#os_os_networkinterfaces) function.
```
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