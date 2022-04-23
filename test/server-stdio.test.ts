
// baesd on rcjsuen/dockerfile-language-server-nodejs

import chai from "chai";
import * as child_process from "child_process";
import { KeyObject } from "crypto";
import { Response } from "node-fetch";
import { InitializeResult, LogMessageNotification, LogMessageParams, NotificationMessage, ResponseMessage } from "vscode-languageserver-protocol";

const assert = chai.assert;

const lspProcess = child_process.spawn("node", ["out/src/server.js", "--stdio"]);
let messageId = 1;

function send(method: string, params: object) {
  const message = {
    jsonrpc: "2.0",
    id: messageId++,
    method: method,
    params: params
  };
  const json = JSON.stringify(message);
  const headers = `Content-Length: ${json.length}\r\n\r\n`;

  lspProcess.stdin.write(headers);
  lspProcess.stdin.write(json);
}

function initialize() {
  send("initialize", {
    rootUri: process.cwd(),
    processId: process.pid,
    capabilities: {
      /* ... */
    }
  });
}


// msg as 'object' is not a proper JavaScript object so
// remove junks, like "Content-Length: 133", by
// converting it to string first.
function parse(msg: string | object): object | null {
  if (typeof msg !== 'string' && msg !== null) {
    return parse(`${msg}`);
  } else if (typeof msg === 'string' && msg.startsWith("Content-Length: ")) {
    const chunk = msg.split("\r\n\r\n")[1].trim();
    return (!!chunk) ? parse(chunk) : null;
  }

  try {
    return JSON.parse(msg);
  } catch {
    return null;
  }
}

function isNotificationMessage(obj: object): obj is NotificationMessage {
  return (obj as NotificationMessage).method !== undefined;
}

function isResponseMessage(obj: object): obj is ResponseMessage {
  return (obj as ResponseMessage).id !== undefined;
}

function isLogMessage(msg: NotificationMessage): boolean {
  return msg.method === "window/logMessage";
};

function hasInitializeResult(obj: ResponseMessage): boolean {
  return (obj.result as InitializeResult).capabilities !== undefined;
};

function getLogMessage(msg: NotificationMessage): string | null {
  try {
    const logMessageParams = msg.params as LogMessageParams;
    return logMessageParams.message;
  } catch {
    return null;
  }
}


describe('Connection Tests via --stdio', () => {

  // Terminate LSP
  after(() => {
    lspProcess.kill();
  });

  it("initialize (stdio)", (done) => {

    lspProcess.stdout.on("data", (message) => {
      const msg = parse(message);
      if (!msg) {
        console.log(`  -- (stdio) Got non-JSON: ${message}`);
      } else if (isNotificationMessage(msg)) {
        if (isLogMessage(msg)) {
          const received = getLogMessage(msg);
          console.log(`  -- (stdio) Got logMessage: ${received}`);
        } else {
          console.log(`  -- (stdio) unknown notification: ${msg}`);
        }
      } else if (isResponseMessage(msg)) {
        if (hasInitializeResult(msg)) {
          console.log(`  -- (stdio) Got InitializeResult`);
          done();
        } else {
          console.log(`  -- (stdio) unknown response: ${msg}`);
        }
      } else {
        console.log(`  -- (stdio) UNKNOWN: ${message}`);
      }
    });

    initialize();

  }).timeout(5000);

});
