// https://github.com/rcjsuen/dockerfile-language-server-nodejs/blob/master/test/server.test.ts

import * as chai from "chai";
import * as child_process from "child_process";
import { CompletionItem, CompletionList, DocumentUri, Hover, MarkedString, MarkupContent, MarkupKind, Position, TextDocumentItem } from 'vscode-languageserver-types';
import {
  ClientCapabilities, InitializeParams, NotificationMessage, RequestMessage, ResponseMessage,
  DidOpenTextDocumentParams, CompletionParams, HoverParams, TextDocumentPositionParams,
  TextDocumentSyncKind, InitializeResult, LogMessageParams, Message
} from 'vscode-languageserver-protocol';

const assert = chai.assert;


// fork the server and connect to it using Node IPC
const lspProcess = child_process.fork("bin/main.js", ["--node-ipc"]);
let messageId = 42;


// Send a request to the server
function sendRequest(ps: child_process.ChildProcess, method: string, params: any): number {
  const message: RequestMessage = {
    jsonrpc: "2.0",
    id: messageId++,
    method: method,
    params: params
  };
  ps.send(message);
  return messageId - 1;
}


// Send a notification to the server
function sendNotification(ps: child_process.ChildProcess, method: string, params: any) {
  const message: NotificationMessage = {
    jsonrpc: "2.0",
    method: method,
    params: params
  };
  ps.send(message);
}


const clientCapabilities: ClientCapabilities = {
  textDocument: {
    completion: {
      completionItem: {
        documentationFormat: [MarkupKind.Markdown],
        snippetSupport: true,
        // labelDetailSupport: true,    // [TODO] Enable since 3.17
      }
    },
    hover: {
      contentFormat: [MarkupKind.Markdown]
    }
  }
};


// Send initialize request to the server
function initialize(): number {
  const rootUri: DocumentUri = process.cwd();
  const params: InitializeParams = {
    processId: process.pid,
    rootUri,
    workspaceFolders: [
      {
        uri: rootUri,
        name: "something"
      }
    ],
    capabilities: clientCapabilities,
  };
  return sendRequest(lspProcess, "initialize", params);
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


describe("LSP Tests", () => {

  // Terminate LSP
  after(() => {
    lspProcess.kill();
  });

  // Event listeners must not interfere other tests
  afterEach(() => {
    lspProcess.removeAllListeners();
  });

  it("initialize", (done) => {
    const responseId = initialize();
    lspProcess.on('message', (msg: any) => {

      if (isNotificationMessage(msg)) {
        if (isLogMessage(msg)) {
          const received = getLogMessage(msg);
          console.log(`  -- (node-ipc: initialize) logMessage: ${received}`);
        } else {
          console.log(`  -- (node-ipc: initialize) unknown notification: ${msg}`);
        }
      } else if (isResponseMessage(msg)) {
        if (hasInitializeResult(msg)) {
          console.log(`  -- (node-ipc: initialize) InitializeResult`);
          assert.strictEqual(msg.id, responseId);
          const result = msg.result as InitializeResult;
          const capabilities = result.capabilities;
          assert.deepStrictEqual(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
          assert.strictEqual(capabilities.completionProvider?.resolveProvider, false);
          assert.strictEqual(capabilities.hoverProvider, true);
          assert.strictEqual(capabilities.codeActionProvider, undefined);
          assert.strictEqual(capabilities.foldingRangeProvider, undefined);
          assert.strictEqual(capabilities.renameProvider, undefined);
          done();
        } else {
          console.log(`  -- (node-ipc: initialize) unknown response: ${msg}`);
        }
      } else {
        console.log(`  -- (node-ipc: initialize) UNKNOWN: ${msg}`);
      }

    });
  }).timeout(5000);


  it("initialized", (done) => {

    // catch a logMessage notification from the server
    lspProcess.once('message', (msg: any) => {

      if (isNotificationMessage(msg)) {
        if (isLogMessage(msg)) {
          const logMessage = getLogMessage(msg);
          console.log(`  -- (node-ipc: initialized) logMessage: ${logMessage}`);
          assert.strictEqual(logMessage, "onInitialized!");
          done();
        } else {
          console.log(`  -- (node-ipc: initialized) unknown notification: ${msg}`);
        }
      } else if (isResponseMessage(msg)) {
        console.log(`  -- (node-ipc: initialized) unknown response: ${msg.result}`);
      } else {
        console.log(`  -- (node-ipc: initialized) UNKNOWN: ${msg}`);
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
    const id = sendRequest(lspProcess, "textDocument/completion", completionParams1);

    lspProcess.on("message", (json: any) => {

      if ('error' in json) {
        assert.fail(`Got ResponseError: ${json.error?.message}`);
      }

      if (isNotificationMessage(json)) {
        if (isLogMessage(json)) {
          console.log(`  -- (node-ipc: comp) logMessage: ${getLogMessage(json)} `);
        } else {
          console.log(`  -- (node-ipc: comp) Unknown notification: ${json.method}`);
        }
      } else if (isResponseMessage(json)) {
        if (json.id === id) {
          const result = json.result as CompletionItem[];
          if (!Array.isArray(result)) {
            assert.fail("  -- (node-ipc: comp) Result is not an array.");
          } else if (result.length === 0) {
            assert.fail("  -- (node-ipc: comp) completion item list is empty.");
          }

          const labels = result.map(item => item.label);
          console.log(`  -- (node-ipc: comp) labels = ${labels}`);
          done();
        } else {
          assert.fail(`  -- (node-ipc: comp) What is this id? ${json.id}`);
        }
      } else {
        console.log(`  -- (node-ipc: comp) UNKNOWN: ${json}`);
      }
    });

  }).timeout(5000);


  it("hover 1", (done) => {
    const text = "curl --insecure ";
    const position = Position.create(0, 12);
    const [didOpenTextDocumentParams, hoverParamsCom1] = prepare(text, position);
    const expected = "\`-k\`, \`--insecure\` \n\n Allow insecure server connections when using SSL";

    sendNotification(lspProcess, "textDocument/didOpen", didOpenTextDocumentParams);
    const id = sendRequest(lspProcess, "textDocument/hover", hoverParamsCom1);

    lspProcess.on("message", (json: any) => {

      if ('error' in json) {
        assert.fail(`Got ResponseError: ${json.error?.message}`);
      }

      if (isNotificationMessage(json)) {
        if (isLogMessage(json)) {
          console.log(`  -- (node-ipc: hover) logMessage: ${getLogMessage(json)} `);
        } else {
          console.log(`  -- (node-ipc: hover) Unknown notification: ${json.method}`);
        }
      } else if (isResponseMessage(json)) {
        if (json.id === id) {
          if (Hover.is(json.result)) {
            if (MarkupContent.is(json.result.contents)) {
              assert.strictEqual(json.result.contents.kind, MarkupKind.Markdown);
              assert.strictEqual(json.result.contents.value, expected);
              done();
            } else {
              assert.fail("  -- (node-ipc: hover) Expect hover to be MarkupContent.");
            }
          } else {
            assert.fail("  -- (node-ipc: hover) result is not Hover.");
          }
        } else {
          assert.fail(`  -- (node-ipc: hover) What is this id? ${json.id}`);
        }
      } else {
        console.log(`  -- (node-ipc: hover) UNKNOWN: ${json}`);
      }

    });
  }).timeout(5000);


});