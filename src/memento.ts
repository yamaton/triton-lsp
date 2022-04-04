import BetterSqlite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import { Command } from './command';
import fs from 'fs';


const defaultDbPath = `${__dirname}/../commandspecs.db`;

// Memento is interface to sqlite3 database + cache as replacement to Memento in VS Code.
export class Memento {
  private db: BetterSqlite3.Database;
  private cache: Map<string, Command>;

  constructor(path=defaultDbPath) {
    this.db = this.initializeDatabase(path);
    this.cache = this.loadCommands();
  }

  private initializeDatabase(path: string): BetterSqlite3.Database {
    let db: BetterSqlite3.Database;
    if (fs.existsSync(path)) {
      db = Database(path);
    } else {
      console.info(`Database file not found;  starting from scratch.`);
      db = Database(path);
      db.prepare("CREATE TABLE Command (name TEXT, json JSON)").run();
    }
    return db;
  }


  public getNames = (): string[] => {
    return this.db.prepare("SELECT name FROM Command").pluck().all();
  }


  public get = (name: string): Command | undefined => {
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }

    const raw = this.db.prepare("SELECT json FROM Command WHERE name=?").pluck().get(name);
    const cmd = (!!raw) ? JSON.parse(raw) : undefined;
    if (cmd) {
      this.cache.set(name, cmd);
    }
    return cmd;
  }


  public remove = (name: string): void => {
    this.db.prepare("DELETE FROM Command WHERE name=?").run(name);
    this.cache.delete(name);
    console.info(`Removed ${name} from the database.`)
  }


  public has = (name: string): boolean => {
    const ans = this.db.prepare("SELECT name FROM Command WHERE name=?").pluck().get(name);
    return (!!ans);
  }


  public set = (name: string, cmdSpec: Command): void => {
    const stmt = (this.has(name))
                  ? this.db.prepare("UPDATE Command SET json = @json WHERE name = @name")
                  : this.db.prepare("INSERT INTO Command VALUES (@name, @json)");
    stmt.run({
      name: name,
      json: JSON.stringify(cmdSpec)
    });
    this.cache.set(name, cmdSpec);
  }


  public loadCommands = (): Map<string, Command> => {
    const d = new Map<string, Command>();
    const rawdata = this.db.prepare("SELECT json FROM Command").pluck().all();
    for (const raw of rawdata) {
      const cmd = JSON.parse(raw);
      d.set(cmd.name, cmd);
    }
    return d;
  }

}
