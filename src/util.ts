import { networkInterfaces } from 'os';

// constant representing the amount of time we need to sleep between cog
// commands or else cog-server and mongoose will bug out and not
// properly update cogs on the UI
export const COMMAND_SLEEP = 25;

export async function sleep(milliseconds?: number): Promise<NodeJS.Timer> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds || COMMAND_SLEEP);
  });
}

export function validSignal(signal: string): boolean {
  return [
    'SIGABRT',
    'SIGALRM',
    'SIGBUS',
    'SIGCHLD',
    'SIGCONT',
    'SIGFPE',
    'SIGHUP',
    'SIGILL',
    'SIGINT',
    'SIGIO',
    'SIGIOT',
    'SIGKILL',
    'SIGPIPE',
    'SIGPOLL',
    'SIGPROF',
    'SIGPWR',
    'SIGQUIT',
    'SIGSEGV',
    'SIGSTKFLT',
    'SIGSTOP',
    'SIGSYS',
    'SIGTERM',
    'SIGTRAP',
    'SIGTSTP',
    'SIGTTIN',
    'SIGTTOU',
    'SIGUNUSED',
    'SIGURG',
    'SIGUSR1',
    'SIGUSR2',
    'SIGVTALRM',
    'SIGWINCH',
    'SIGXCPU',
    'SIGXFSZ',
    'SIGBREAK',
    'SIGLOST',
    'SIGINFO',
  ].includes(signal);
}

export function getIP(): string | null {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const networkInterface of interfaces[name]) {
      if (networkInterface.family === 'IPv6' || networkInterface.internal) {
        continue;
      }

      const parts = networkInterface.address.split('.');
      if (parts[0] === '10' || parts[0] === '192' || (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31)) {
        continue;
      }
      return networkInterface.address;
    }
  }
  return null;
}
