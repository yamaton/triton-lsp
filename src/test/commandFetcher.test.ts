import chai from "chai";
import { Command } from "../types";
import CommandFetcher from "../commandFetcher";
import fs from 'fs';

const assert = chai.assert;


describe('CommandFetcher with empty DB', () => {
  const testDbName = "testfetcher.db";
  const fetcher = new CommandFetcher(testDbName);

  it("fetcher.fetch('h2o')", async () => {
    const name = 'h2o';
    const cmd = await fetcher.fetch(name);
    const opt = cmd?.options.find(opt => opt.names.some(n => n === '--loadjson'));
    assert.strictEqual(opt?.description, "Load JSON file in Command schema.");
  });

  it("fetcher.fetch('h2o') again", async () => {
    const name = 'h2o';
    const cmd = await fetcher.fetch(name);
    const opt = cmd?.options.find(opt => opt.names.some(n => n === '--list-subcommands'));
    assert.strictEqual(opt?.description, "List subcommands");
  });

  it("fetcher.fetchAllCurated('general')", async () => {
    await fetcher.fetchAllCurated('general');
  }).timeout(0);

  it("fetcher.fetchAll('npm')", async () => {
    const name = 'npm';
    const cmd = await fetcher.fetch(name);
    const subcmd = cmd?.subcommands?.find(c => c.name === 'install');
    assert.strictEqual(subcmd?.description, "Install a package");
  });


  after(() => {
    fetcher.close();
    fs.rmSync(testDbName);
  });

});


describe('CommandFetcher with default DB', () => {
  const fetcher = new CommandFetcher();

  it("fetcher.fetch('stack')", async () => {
    const name = 'stack';
    const cmd = await fetcher.fetch(name);
    const subcmd = cmd?.subcommands?.find(c => c.name === 'runghc');
    assert.deepEqual(subcmd?.description, "Run runghc");
  });

});
