# Changelog

## v1.1.0
* If the cog.json does not specify a run command, check if there exists a package.json and then
    assume it is using node and the script under "main" in package.json.

## v1.0.3
* Kill attached children if crun is terminated (will still leave children if receives SIGKILL).

## v1.0.2
* Use shell=True for spawning commands on Windows
* Only require `-r` and not both `-r` and `-f`.

## v1.0.1
* Published to internal CISL NPM
* Fix bug when trying to load cog with crun-server not being reachable
* Set default for 'watcher' in cog.json to http://localhost:7777 if not present

## v1.0.0
* Initial release with changelog
