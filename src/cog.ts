export default interface Cog {
    id: string,
    run: string,
    args?: string[],
    watcher?: string,
    type?: string,
    description?: string,
    tags?: string[],
    host?: string,
    port?: number,
    log?: string,
    "path+"?: string,
    env: {[key: string]: string},
    cwd: string
}
