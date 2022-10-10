
// baesd on rcjsuen/dockerfile-language-server-nodejs

import chai from "chai";
import * as child_process from "child_process";
import { CompletionItem, Hover, MarkupContent, MarkupKind, Position } from "vscode-languageserver-types";
import { DidOpenTextDocumentParams, InitializeResult, LogMessageNotification, LogMessageParams, NotificationMessage, ResponseMessage, TextDocumentPositionParams } from "vscode-languageserver-protocol";

const assert = chai.assert;

const lspProcess = child_process.spawn("node", ["bin/main.js", "--stdio"]);
let messageId = 1;

function sendRequest(p: child_process.ChildProcessWithoutNullStreams, method: string, params: object) {
  const message = {
    jsonrpc: "2.0",
    id: messageId++,
    method: method,
    params: params
  };
  const json = JSON.stringify(message);
  const headers = `Content-Length: ${json.length}\r\n\r\n`;

  p.stdin.write(headers);
  p.stdin.write(json);
}

function sendNotification(p: child_process.ChildProcessWithoutNullStreams, method: string, params: object) {
  const message = {
    jsonrpc: "2.0",
    method: method,
    params: params
  };
  const json = JSON.stringify(message);
  const headers = `Content-Length: ${json.length}\r\n\r\n`;

  p.stdin.write(headers);
  p.stdin.write(json);
}

function initialize(p: child_process.ChildProcessWithoutNullStreams) {
  sendRequest(p, "initialize", {
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


function prepare(text: string, position: Position, uri: string = "file://some/text/document.sh"): [
  DidOpenTextDocumentParams, TextDocumentPositionParams] {

  const textDocument = {
    uri,
    languageId: "shellscript",
    version: 2,
    text
  };
  const textDocumentIdentifier = { uri };
  const didOpenTextDocumentParams = { textDocument };
  const textDocumentPositionParams = { position, textDocument: textDocumentIdentifier };

  return [didOpenTextDocumentParams, textDocumentPositionParams];
}



describe('Connection Tests via --stdio', () => {

  // Terminate LSP
  after(() => {
    lspProcess.kill();
  });

  // Event listeners must not interfere other tests
  afterEach(() => {
    lspProcess.stdout.removeAllListeners();
  });

  it("initialize (stdio)", (done) => {

    lspProcess.stdout.on("data", (message) => {
      const msg = parse(message);
      if (!msg) {
        console.log(`  -- (stdio initialize) non-JSON: ${message}`);
      } else if (isNotificationMessage(msg)) {
        if (isLogMessage(msg)) {
          const received = getLogMessage(msg);
          console.log(`  -- (stdio initialize) logMessage: ${received}`);
        } else {
          console.log(`  -- (stdio initialize) unknown notification: ${msg}`);
        }
      } else if (isResponseMessage(msg)) {
        if (hasInitializeResult(msg)) {
          console.log(`  -- (stdio initialize) InitializeResult`);
          done();
        } else {
          console.log(`  -- (stdio initialize) unknown response: ${msg}`);
        }
      } else {
        console.log(`  -- (stdio initialize) UNKNOWN: ${message}`);
      }
    });

    initialize(lspProcess);

  }).timeout(5000);



  it("initialized", (done) => {

    // catch a logMessage notification from the server
    lspProcess.stdout.on('data', (message) => {
      const msg = parse(message);
      if (!msg) {
        console.log(`  -- (stdio initialized) non-JSON: ${message}`);
      }
      else if (isNotificationMessage(msg)) {
        if (isLogMessage(msg)) {
          const logMessage = getLogMessage(msg);
          console.log(`  -- (stdio initialized) logMessage: ${logMessage}`);
          assert.strictEqual(logMessage, "onInitialized!");
          done();
        } else {
          console.log(`  -- (stdio initialized) unknown notification: ${msg}`);
        }
      } else if (isResponseMessage(msg)) {
        console.log(`  -- (stdio initialized) unknown response: ${msg.result}`);
      } else {
        console.log(`  -- (stdio initialized) UNKNOWN: ${msg}`);
      }

    });

    sendNotification(lspProcess, "initialized", {});

  });


  it("completion 1", (done) => {
    const text = "conda ins";
    const position = Position.create(0, 9);
    const uri = 'file:///conda/text.sh';
    const [didOpenTextDocumentParams, completionParams1] = prepare(text, position, uri);
    sendNotification(lspProcess, "textDocument/didOpen", didOpenTextDocumentParams);
    sendRequest(lspProcess, "textDocument/completion", completionParams1);

    lspProcess.stdout.on("data", (message) => {
      const json = parse(message);
      if (!json) {
        console.log(`  -- (stdio: comp) non-JSON: ${message}`);
      } else if (isNotificationMessage(json)) {
        if (isLogMessage(json)) {
          console.log(`  -- (stdio: comp) logMessage: ${getLogMessage(json)} `);
        } else {
          console.log(`  -- (stdio: comp) Unknown notification: ${json.method}`);
        }
      } else if (isResponseMessage(json)) {
        if (json.id) {
          const result = json.result as CompletionItem[];
          if (!Array.isArray(result)) {
            assert.fail("  -- (stdio: comp) Result is not an array.");
          } else if (result.length === 0) {
            assert.fail("  -- (stdio: comp) completion item list is empty.");
          }

          const labels = result.map(item => item.label);
          console.log(`  -- (stdio: comp) labels = ${labels}`);
          done();
        } else {
          assert.fail(`  -- (stdio: comp) What is this id? ${json.id}`);
        }
      } else {
        console.log(`  -- (stdio: comp) UNKNOWN: ${json}`);
      }
    });

  }).timeout(10000);


  it("hover 1", (done) => {
    const text = "cut --delimiter , -f 1 ";
    const position = Position.create(0, 12);
    const [didOpenTextDocumentParams, hoverParamsCom1] = prepare(text, position);
    const expected = "\`-d\`, \`--delimiter\` \`DELIM\`\n\n use DELIM instead of TAB for field delimiter";

    lspProcess.stdout.on("data", (message) => {
      const json = parse(message);
      if (!json) {
        console.log(`  -- (stdio: hover) non-JSON: ${message}`);
      } else if (isNotificationMessage(json)) {
        if (isLogMessage(json)) {
          console.log(`  -- (stdio: hover) logMessage: ${getLogMessage(json)} `);
        } else {
          console.log(`  -- (stdio: hover) Unknown notification: ${json.method}`);
        }
      } else if (isResponseMessage(json)) {
        if (json.id) {
          if (Hover.is(json.result)) {
            if (MarkupContent.is(json.result.contents)) {
              assert.strictEqual(json.result.contents.kind, MarkupKind.Markdown);
              assert.strictEqual(json.result.contents.value, expected);
              console.log(`  -- (stdio: hover) got expected: ${json.result.contents.value}`);
              done();
            } else {
              assert.fail("  -- (stdio: hover) Expect hover to be MarkupContent.");
            }
          } else {
            assert.fail("  -- (stdio: hover) result is not Hover.");
          }
        } else {
          assert.fail(`  -- (stdio: hover) What is this id? ${json.id}`);
        }
      } else {
        console.log(`  -- (stdio: hover) UNKNOWN: ${json}`);
      }

    });

    sendNotification(lspProcess, "textDocument/didOpen", didOpenTextDocumentParams);
    sendRequest(lspProcess, "textDocument/hover", hoverParamsCom1);

  }).timeout(10000);

});
