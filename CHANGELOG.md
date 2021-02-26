# Changelog

## v3.0.0

* Rename project to `@bishopcais/cog-cli`
* Make publicly available on GitHub and through NPM

## v2.0.0

* Rewrite into typescript
* Deprecate `crun` command
* Add internal clear command to clear cog output cache
* Fix crash if receiving invalid signal
* Output to console.error on uncaught exceptions
* Make config output more table like to improve readability

## v1.4.0

* Renamed project to `cog-cli` and added new `cog` entry point (`crun` remains as well for BC).
* Add `ping` beacon command to do check if daemon is running before doing running load, unload, etc.

## v1.3.0

* Add ability to send arbitrary signals to processes
* Update dependencies

## v1.2.2

* Use fs.realpathSync to follow symlinks instead of fs.readlinkSync to better resolve
    relative paths

## v1.2.1

* Fix not following symbolic link when using the recursive flag

## v1.2.0

* When given a symlink, crun will attempt to follow/use it
* Lower required Node engine to 8 from 10
* Upgrade commander from 2.19.0 to 2.20.0
* Change config option from using options to new signature, use `crun config --help` to view it.
* Remove `-f` option for `start|stop|unload` and just implicitly check if using a path or not

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
