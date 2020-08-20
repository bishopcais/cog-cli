import Runner from "./beacon/runner";
import Connection from "./beacon/connection";

export default interface Cog {
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
