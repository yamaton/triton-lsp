
import type { Command } from './types';
import { Memento } from './memento';
import { runH2o } from './h2o';
import { HTTPResponseError } from './error';
import fetch, { Response } from 'node-fetch';
import pako from 'pako';


// -----
// CommandFetcher manages the local cache using Memento.
// It also pulls command data from the remote repository.
export default class CommandFetcher {
  private memento: Memento;

  constructor(path: string | undefined = undefined) {
    if (!path) {
      this.memento = new Memento();
    } else {
      this.memento = new Memento(path);
    }
    const existing = this.getNames();
    const msg = (!existing.length || existing.length === 0)
      ? `
      ---------------------------------------
        Memento is empty
      ---------------------------------------`
      : `
      ---------------------------------------
        Memento has ${existing.length} specs
      ---------------------------------------`;
    console.log(msg);
  }

  // Get d data of the command `name`
  private getCache(name: string): Command | undefined {
    return this.memento.get(name);
  }

  // Update Memento record and the name list
  public async update(name: string, command: Command): Promise<void> {
    const t0 = new Date();
    await this.memento.set(name, command);
    const t1 = new Date();
    const diff = t1.getTime() - t0.getTime();
    console.log(`[CommandFetcher.update] ${name}: Memento update took ${diff} ms.`);
  }

  public async remove(name: string): Promise<void> {
    const t0 = new Date();
    await this.memento.remove(name);
    const t1 = new Date();
    const diff = t1.getTime() - t0.getTime();
    console.log(`[CommandFetcher.remove] ${name}: Memento update took ${diff} ms.`);
  }


  // Get command data from cache first, then run H2O if fails.
  public async fetch(name: string): Promise<Command> {
    if (name.length < 2) {
      return Promise.reject(`Command name too short: ${name}`);
    }

    let cached = this.getCache(name);
    if (cached) {
      console.log(`[CommandFetcher.fetch] Fetching from cache: ${name}`);
      return cached;
    }

    console.log(`[CommandFetcher.fetch] Fetching from H2O: ${name}`);
    try {
      const command = runH2o(name);
      if (!command) {
        console.warn(`[CommandFetcher.fetch] Failed to fetch command ${name} from H2O`);
        return Promise.reject(`Failed to fetch command ${name} from H2O`);
      }
      try {
        this.update(name, command);
      } catch (e) {
        console.log(`Failed to update: ${e}`);
      }
      return command;

    } catch (e) {
      console.log(`[CommandFetcher.fetch] Error: ${e}`);
      return Promise.reject(`[CommandFetcher.fetch] Failed in CommandFetcher.update() with name = ${name}`);
    }
  }


  // Download the package bundle `kind` and load them to cache
  public async fetchAllCurated(kind = 'general', isForcing = false): Promise<void> {
    console.log("[CommandFetcher.fetchAllCurated] Started running...");
    const url = `https://github.com/yamaton/h2o-curated-data/raw/main/${kind}.json.gz`;
    const checkStatus = (res: Response) => {
      if (res.ok) {
        return res;
      } else {
        throw new HTTPResponseError(res);
      }
    };

    const t0 = new Date();

    let response: Response;
    try {
      response = await fetch(url);
      checkStatus(response);
    } catch (error) {
      try {
        const err = error as HTTPResponseError;
        const errorBody = await err.response.text();
        console.error(`Error body: ${errorBody}`);
        return Promise.reject("Failed to fetch HTTP response.");
      } catch (e) {
        console.error(`Error ... even failed to fetch error body: ${e}`);
        return Promise.reject("Failed to fetch over HTTP");
      }
    }
    console.log("[CommandFetcher.fetchAllCurated] received HTTP response");

    const t1 = new Date();
    const diffDownload = t1.getTime() - t0.getTime();
    console.log(`[CommandFetcher.fetchAllCurated] (${kind}) Download took ${diffDownload} ms.`);


    let commands: Command[] = [];
    try {
      const s = await response.buffer();
      const decoded = pako.inflate(s, { to: 'string' });
      commands = JSON.parse(decoded) as Command[];
    } catch (err) {
      console.error(`[fetchAllCurated] Error: ${err}`);
      return Promise.reject("Failed to inflate and parse the content as JSON.");
    }

    const t2 = new Date();
    const diffUnpacking = t2.getTime() - t1.getTime();
    console.log(`[CommandFetcher.fetchAllCurated] (${kind}) Unpack took ${diffUnpacking} ms.`);
    console.log(`[CommandFetcher.fetchAllCurated] Done inflating and parsing. # of Commands = ${commands.length}`);

    for (const cmd of commands) {
      if (isForcing || this.getCache(cmd.name) === undefined) {
        this.update(cmd.name, cmd);
      }
    }
  }


  // Download the command `name` from the remote repository
  public async downloadCommand(name: string, kind = 'experimental'): Promise<void> {
    console.log(`[CommandFetcher.downloadCommand] Started getting ${name} in ${kind}...`);
    const url = `https://raw.githubusercontent.com/yamaton/h2o-curated-data/main/${kind}/json/${name}.json`;
    const checkStatus = (res: Response) => {
      if (res.ok) {
        return res;
      } else {
        throw new HTTPResponseError(res);
      }
    };

    let response: Response;
    try {
      response = await fetch(url);
      checkStatus(response);
    } catch (error) {
      try {
        const err = error as HTTPResponseError;
        const errorBody = await err.response.text();
        console.error(`Error body: ${errorBody}`);
        return Promise.reject("Failed to fetch HTTP response.");
      } catch (e) {
        console.error(`Error ... even failed to fetch error body: ${e}`);
        return Promise.reject("Failed to fetch over HTTP");
      }
    }
    console.log("[CommandFetcher.downloadCommand] received HTTP response");

    let cmd: Command;
    try {
      const content = await response.text();
      cmd = JSON.parse(content) as Command;
    } catch (err) {
      const msg = `[CommandFetcher.downloadCommand] Error: ${err}`;
      console.error(msg);
      return Promise.reject(msg);
    }

    console.log(`[CommandFetcher.downloadCommand] Loading: ${cmd.name}`);
    this.update(cmd.name, cmd);
  }


  // Get a list of the command bundle `kind`.
  // This is used for removal of bundled commands.
  public async fetchList(kind = 'bio'): Promise<string[]> {
    console.log("[CommandFetcher.fetchList] Started running...");
    const url = `https://raw.githubusercontent.com/yamaton/h2o-curated-data/main/${kind}.txt`;
    const checkStatus = (res: Response) => {
      if (res.ok) {
        return res;
      } else {
        throw new HTTPResponseError(res);
      }
    };

    let response: Response;
    try {
      response = await fetch(url);
      checkStatus(response);
    } catch (error) {
      try {
        const err = error as HTTPResponseError;
        const errorBody = await err.response.text();
        console.error(`Error body: ${errorBody}`);
        return Promise.reject("Failed to fetch HTTP response.");
      } catch (e) {
        console.error(`Error ... even failed to fetch error body: ${e}`);
        return Promise.reject("Failed to fetch over HTTP");
      }
    }
    console.log("[CacheFetcher.fetchList] received HTTP response");

    let names: string[] = [];
    try {
      const content = await response.text();
      names = content.split(/\r?\n/).map((str) => str.trim()).filter(s => !!s && s.length > 0);
    } catch (err) {
      const msg = `[CacheFetcher.fetchList] Error: ${err}`;
      console.error(msg);
      return Promise.reject(msg);
    }
    names.forEach((name) => console.log(`    Received ${name}`));
    return names;
  }


  // Load a list of all command names in Memento
  public getNames(): string[] {
    return this.memento.getNames();
  }


  // Close DB
  public close(): void {
    this.memento.close();
  }

}

