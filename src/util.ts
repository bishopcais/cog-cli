// constant representing the amount of time we need to sleep between cog
// commands or else cog-server and mongoose will bug out and not
// properly update cogs on the UI
export const COMMAND_SLEEP = 25;

export async function sleep(milliseconds?: number): Promise<NodeJS.Timeout> {
  return setTimeout(() => {}, milliseconds || COMMAND_SLEEP);
}
