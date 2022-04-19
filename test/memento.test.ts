import chai from "chai";
import { Memento } from "../src/memento";
import { Command } from "../src/types";
import fs from 'fs';

const assert = chai.assert;

const acommand: Command = {
  name: "nanachi",
  description: "nanachi commmand",
  options: [
    {
      names: [
        "--maaa"
      ],
      argument: "GGG",
      description: "maaa san"
    },
    {
      names: [
        "--baba"
      ],
      argument: "KEKE",
      description: "baba is you"
    },
  ]
};

describe('Memento I/O', () => {
  const testDbPath = "testtest.db";
  if (fs.existsSync(testDbPath)) {
    fs.rmSync(testDbPath);
  }
  const memento = new Memento(testDbPath);

  it('Newly created memento has no entry.', () => {
    assert.deepEqual(memento.getNames(), []);
  });

  it('Set Memento a command', (done) => {
    memento.set(acommand.name, acommand);
    done();
  });

  it('Memento remembers what\'s given', () => {
    const cmd = memento.get(acommand.name);
    assert.deepEqual(acommand, cmd);
  });

  it('Memento sets/updates a value', () => {
    const newDesc = "updated desc";
    const updatedCmd: Command = { ...acommand, description: newDesc };
    memento.set(acommand.name, updatedCmd);
    const cmd2 = memento.get(updatedCmd.name);
    assert.strictEqual(cmd2?.description, newDesc);
    assert.deepEqual(cmd2, updatedCmd);
  });

  after(() => {
    memento.close();
    fs.rmSync(testDbPath);
  });
});

