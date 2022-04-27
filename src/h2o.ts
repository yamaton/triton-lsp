import { Command } from './types';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';


let neverNotifiedError = true;


// Call H2O executable and get command information from the local environment
export function runH2o(name: string): Command | undefined {
  const h2opath = (process.platform === 'linux')
            ? path.join(__dirname, '..', 'bin', 'h2o-x86_64-unknown-linux')
            : (process.platform === 'darwin')
            ? path.join(__dirname, '..', 'bin', 'bin/h2o-x86_64-apple-darwin')
            : "";
  if (!h2opath) {
    if (neverNotifiedError) {
      const msg = `The help scanner (H2O) does not support ${process.platform}.`;
      console.error(msg);
      neverNotifiedError = false;
    }
    return;
  }

  if (!fs.existsSync(h2opath)) {
    throw new Error(`h2o executable is not found`);
  }

  const wrapperPath = path.join(__dirname, '..', 'bin', 'wrap-h2o');
  if (!fs.existsSync(wrapperPath)) {
    throw new Error(`warp-h2o is not found`);
  }

  console.log(`[h2o.runH2o] spawning h2o: ${name}`);
  const proc = spawnSync(wrapperPath, [h2opath, name], { encoding: "utf8" });
  if (proc.status !== 0) {
    console.log(`[h2o.runH2o] Got error code running: ${name}`);
    console.log(`[h2o.runH2o] proc.status = ${proc.status}`);
    return;
  }
  const out = proc.stdout;
  if (out) {
    const command = JSON.parse(out);
    if (command) {
      console.log(`[h2o.runH2o] Got command output: ${command.name}`);
      return command;
    } else {
      console.warn('[h2o.runH2o] Failed to parse H2O output as JSON: ', name);
    }
  } else {
    console.warn('[h2o.runH2o] Failed to get H2O output: ', name);
  }
}
