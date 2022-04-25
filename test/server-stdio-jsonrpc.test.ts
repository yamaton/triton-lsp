
// baesd on rcjsuen/dockerfile-language-server-nodejs

import chai from "chai";
import * as child_process from "child_process";
import { CompletionItem, Hover, MarkupContent, MarkupKind, Position } from "vscode-languageserver-types";
import { CompletionParams, DidOpenTextDocumentParams, InitializeResult, LogMessageNotification, LogMessageParams, NotificationMessage, ResponseMessage, TextDocumentPositionParams } from "vscode-languageserver-protocol";
import * as rpc from "vscode-jsonrpc/node";

const assert = chai.assert;

const lspProcess = child_process.spawn("node", ["out/src/server.js", "--stdio"]);
const reader = new rpc.StreamMessageReader(lspProcess.stdout);
const writer = new rpc.StreamMessageWriter(lspProcess.stdin);
let messageId = 1;


function sendRequest(method: string, params: object) {
  console.log(`LSP client emits sendRequest with method = ${method}`);
  const message = {
    jsonrpc: "2.0",
    id: messageId++,
    method: method,
    params: params
  };
  writer.write(message);
}

function sendNotification(method: string, params: object) {
  const message = {
    jsonrpc: "2.0",
    method: method,
    params: params
  };
  writer.write(message);
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

function hasCompletionItems(obj: ResponseMessage): boolean {
  const items = obj.result as CompletionItem[];
  return (Array.isArray(items) && items.length > 0 && items[0].label !== undefined);
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


describe('Connection via vscode-jsonrpc', () => {

  // Terminate LSP
  after(() => {
    lspProcess.kill();
  });


  it("initialize + initialized + comp + hover (jsonrpc)", async () => {

    reader.listen((msg) => {
      if (!msg) {
        console.log(`  -- (jsonrpc) non-JSON: ${msg}`);
      } else if (isNotificationMessage(msg)) {
        if (isLogMessage(msg)) {
          const received = getLogMessage(msg);
          console.log(`  -- (jsonrpc) logMessage: ${received}`);
        } else {
          console.log(`  -- (jsonrpc) unknown notification: ${msg}`);
        }
      } else if (isResponseMessage(msg)) {
        if (hasInitializeResult(msg)) {
          console.log(`  -- (jsonrpc initialized) InitializeResult`);
        } else if (hasCompletionItems(msg)) {
          const labels = (msg.result as CompletionItem[]).map(item => item.label);
          console.log(`  -- (jsonrpc: comp) labels = ${labels}`);
        } else if (Hover.is(msg.result)) {
          if (MarkupContent.is(msg.result.contents)) {
            const expected = "\`-k\`, \`--insecure\` \n\n Allow insecure server connections when using SSL";
            assert.strictEqual(msg.result.contents.kind, MarkupKind.Markdown);
            assert.strictEqual(msg.result.contents.value, expected);
            console.log(`  -- (jsonrpc: hover) got expected: ${msg.result.contents.value}`);
          }
        } else {
          console.log(`  -- (jsonrpc) unknown response: ${msg}`);
        }
      } else {
        console.log(`  -- (jsonrpc) UNKNOWN: ${msg}`);
      }
    });

    sendRequest("initialize", {
      rootUri: process.cwd(),
      processId: process.pid,
      capabilities: {}
    });
    await new Promise(resolve => setTimeout(resolve, 200));

    sendNotification("initialized", {});
    await new Promise(resolve => setTimeout(resolve, 200));

    const text = "conda ins";
    const position = Position.create(0, 9);
    const uri = 'file:///conda/text.sh';
    const [didOpenTextDocumentParams, completionParams1] = prepare(text, position, uri);

    sendNotification("textDocument/didOpen", didOpenTextDocumentParams);
    await new Promise(resolve => setTimeout(resolve, 200));

    sendRequest("textDocument/completion", completionParams1);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const text2 = "curl --insecure ";
    const position2 = Position.create(0, 12);
    const [didOpenTextDocumentParamsHover, hoverParamsHover] = prepare(text2, position2);

    sendNotification("textDocument/didOpen", didOpenTextDocumentParamsHover);
    await new Promise(resolve => setTimeout(resolve, 200));

    sendRequest("textDocument/hover", hoverParamsHover);
    await new Promise(resolve => setTimeout(resolve, 1000));

  }).timeout(5000);

});
