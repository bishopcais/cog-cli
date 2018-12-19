// constant representing the amount of time we need
// to sleep between cog commands or else crun-server
// and mongoose will bug out and not properly update
// cogs on the UI
module.exports.cog_sleep = 250;

module.exports.sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
