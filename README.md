# Cog Runner

Install globally with:
`sudo npm install -g`

Start a cog:
`crun start <cog.json file path>`

Stop a cog:
`crun stop <cog_id>`

List all cogs:
`crun list`

Kill cog daemon:
`crun kill`

Monitor cog stdout:
`crun stdout <cog_id>`


# cog.json
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