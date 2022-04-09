import BetterSqlite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import { Command } from './types';
import fs from 'fs';


const defaultDbPath = `${__dirname}/../commandspecs.db`;

// Memento is interface to sqlite3 database + cache as replacement to Memento in VS Code.
export class Memento {
  private db: BetterSqlite3.Database;
  private cache: {[name: string]: Command};

  constructor(path=defaultDbPath) {
    this.db = Memento.initializeDatabase(path);
    this.cache = this.loadCommands();
  }

  static initializeDatabase(path: string): BetterSqlite3.Database {
    let db: BetterSqlite3.Database;
    if (fs.existsSync(path)) {
      db = Database(path);
    } else {
      console.info(`Database file not found;  starting from scratch.`);
      db = Database(path);
      db.prepare("create table command (name text, json json)").run();
    }
    return db;
  }


  public getNames = (): string[] => {
    return this.db.prepare("select name from command").pluck().all();
  }


  public get = (name: string): Command | undefined => {
    if (name in this.cache) {
      return this.cache[name];
    }

    const raw = this.db.prepare("select json from command where name=?").pluck().get(name);
    const cmd = (!!raw) ? JSON.parse(raw) : undefined;
    if (cmd) {
      this.cache[name] = cmd;
    }
    return cmd;
  }


  public remove = (name: string): void => {
    this.db.prepare("delete from command where name=?").run(name);
    delete this.cache[name];
    console.info(`Removed ${name} from the database.`)
  }


  public has = (name: string): boolean => {
    const ans = this.db.prepare("select name from command where name=?").pluck().get(name);
    return (!!ans);
  }


  public set = (name: string, cmdSpec: Command): void => {
    const stmt = (this.has(name))
                  ? this.db.prepare("update command set json = @json where name = @name")
                  : this.db.prepare("insert into command values (@name, @json)");
    stmt.run({
      name: name,
      json: JSON.stringify(cmdSpec)
    });
    this.cache[name] = cmdSpec;
  }


  public loadCommands = (): {[name: string]: Command} => {
    const d: {[name: string]: Command} = {};
    const rawdata = this.db.prepare("select json from command").pluck().all();
    for (const raw of rawdata) {
      const cmd = JSON.parse(raw);
      d[cmd.name] = cmd;
    }
    return d;
  }

  public close = (): void => {
    this.db.close();
    this.cache = {};
  }

}
