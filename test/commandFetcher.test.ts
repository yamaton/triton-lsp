import chai from "chai";
import { Command } from "../src/types";
import CommandFetcher from "../src/commandFetcher";
import fs from 'fs';

const assert = chai.assert;


describe('CommandFetcher with empty DB', () => {
  const testDbName = "testfetcher.db";
  const fetcher = new CommandFetcher(testDbName);

  it("fetcher.fetch('h2o')", async () => {
    const name = 'h2o';
    const cmd = await fetcher.fetch(name);
    const opt = cmd?.options.find(opt => opt.names.some(n => n === '--loadjson'));
    assert.deepEqual(opt?.description, "Load JSON file in Command schema.");
  });

  it("fetcher.fetch('h2o') again", async () => {
    const name = 'h2o';
    const cmd = await fetcher.fetch(name);
    const opt = cmd?.options.find(opt => opt.names.some(n => n === '--list-subcommands'));
    assert.deepEqual(opt?.description, "List subcommands");
  });

  after(() => {
    fetcher.close();
    fs.rmSync(testDbName);
  });

});
