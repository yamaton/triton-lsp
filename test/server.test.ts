// https://github.com/rcjsuen/dockerfile-language-server-nodejs/blob/master/test/server.test.ts

import chai from "chai";
import * as child_process from "child_process";
import { CompletionItem, CompletionList, DocumentUri, MarkupKind, Position, TextDocumentItem } from 'vscode-languageserver-types'
import type {
  ClientCapabilities, InitializeParams, NotificationMessage, RequestMessage, ResponseMessage,
  DidOpenTextDocumentParams, CompletionParams
} from 'vscode-languageserver-protocol'
import { TextDocumentSyncKind, InitializeResult } from 'vscode-languageserver';

const assert = chai.assert;


// fork the server and connect to it using Node IPC
const lspProcess = child_process.fork("bin/main.js", ["--node-ipc"]);
let messageId = 42;


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
  }

  return sendRequest(lspProcess, "initialize", params);
}


describe("LSP Tests", () => {

  it("initialize", (done) => {
    const responseId = initialize();
    lspProcess.once('message', (json: ResponseMessage) => {

      console.log(`[LSP Tests] Object.keys(json) = ${Object.keys(json)}`);
      if ('error' in json) {
        assert.fail(`Got ResponseError: ${json.error?.message}`);
      }
      assert.strictEqual(json.id, responseId);
      const result = json.result as InitializeResult;
      const capabilities = result.capabilities;

      assert.deepStrictEqual(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
      assert.strictEqual(capabilities.completionProvider?.resolveProvider, true);
      assert.strictEqual(capabilities.hoverProvider, true);
      assert.strictEqual(capabilities.codeActionProvider, undefined);
      assert.strictEqual(capabilities.foldingRangeProvider, undefined);
      assert.strictEqual(capabilities.renameProvider, undefined);

      done();

    });
  }).timeout(5000);


  it("initialized", (done) => {
    sendNotification(lspProcess, "initialized", {});
    done();
  });


  it("completion 1", (done) => {
    const uri = "uri://path/to/comp1.sh"
    const textDocumentComp1 = TextDocumentItem.create(uri, "shellscript", 1, "curl --ins  ");
    const paramsCom1: DidOpenTextDocumentParams = { textDocument: textDocumentComp1 };
    sendNotification(lspProcess, "textDocument/didOpen", paramsCom1);

    const completionParamsCom1: CompletionParams = {
      textDocument: { uri },
      position: Position.create(0, 10),
    };

    const id = sendRequest(lspProcess, "textDocument/completion", completionParamsCom1);
    lspProcess.once("message", (json: ResponseMessage) => {

      if ('error' in json) {
        assert.fail(`Got ResponseError: ${json.error?.message}`);
      }

      // [TODO] check all possible IDs returned
      if (json.id === id) {
        const result = json.result as CompletionItem[];
        if (!Array.isArray(result)) {
          assert.fail("[completion 1] Result is not an array.");
        } else if (result.length == 0) {
          assert.fail("[completion 1] completion item list is empty.");
        }

        const labels = result.map(item => item.label);
        console.log(`[Autocomplete] labels = ${labels}`);
        done();
      } else {
        assert.fail(`[completion 1] What is this id? ${json.id}`);
      }

    });
  }).timeout(5000);



  // Terminate LSP
  after(() => {
    lspProcess.kill();
  });

});