import chai from "chai";
import { runH2o } from "../h2o";

const assert = chai.assert;


describe('runH2o', () => {
  it("runH2o('h2o')", async () => {
    const name = 'h2o';
    const cmd = runH2o(name);
    const opt = cmd?.options.find(opt => opt.names.some(n => n === '--loadjson'));
    assert.deepEqual(opt?.description, "Load JSON file in Command schema.");
  });

});
