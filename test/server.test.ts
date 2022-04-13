// https://github.com/rcjsuen/dockerfile-language-server-nodejs/blob/master/test/server.test.ts

import chai from "chai";
import * as child_process from "child_process";
import { DocumentUri, MarkupKind } from 'vscode-languageserver-types'
import { ClientCapabilities, InitializeParams, NotificationMessage, RequestMessage, ResponseError, ResponseMessage } from 'vscode-languageserver-protocol'
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
    lspProcess.once('message', (json: ResponseMessage | ResponseError) => {

      console.log(`[LSP Tests] Object.keys(json) = ${Object.keys(json)}`);
      if ('error' in json) {
        assert.fail(`Got ResponseError: ${json.error?.message}`);
      }
      const msg = json as ResponseMessage;
      assert.strictEqual(msg.id, responseId);
      const result = msg.result as InitializeResult;
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


  // it("definition", function (done) {
  //   sendNotification(lspProcess, "textDocument/didOpen", {
  //     textDocument: {
  //       languageId: "shellscript",
  //       version: 1,
  //       uri: "uri://definition.txt",
  //       text: "FROM node AS setup"
  //     }
  //   });

  //   const requestId = sendRequest(lspProcess, "textDocument/definition", {
  //     textDocument: {
  //       uri: "uri://definition.txt",
  //     },
  //     position: {
  //       line: 0,
  //       character: 15
  //     }
  //   });

  //   const listener = (json) => {
  //     if (json.id === requestId) {
  //       lspProcess.removeListener("message", listener);
  //       assert.strictEqual(json.result.uri, "uri://definition.txt");
  //       assert.strictEqual(json.result.range.start.line, 0);
  //       assert.strictEqual(json.result.range.start.character, 13);
  //       assert.strictEqual(json.result.range.end.line, 0);
  //       assert.strictEqual(json.result.range.end.character, 18);
  //       done();
  //     }
  //   };
  //   lspProcess.on("message", listener);
  // });

  // it("formatting", function (done) {
  //   sendNotification(lspProcess, "textDocument/didOpen", {
  //     textDocument: {
  //       languageId: "shellscript",
  //       version: 1,
  //       uri: "uri://formatting.txt",
  //       text: " FROM node AS setup"
  //     }
  //   });

  //   const requestId = sendRequest(lspProcess, "textDocument/formatting", {
  //     textDocument: {
  //       uri: "uri://formatting.txt",
  //     },
  //     options: {
  //       insertSpaces: true,
  //       tabSize: 4
  //     }
  //   });

  //   const listener = (json) => {
  //     if (json.id === requestId) {
  //       lspProcess.removeListener("message", listener);
  //       assert.ok(json.result instanceof Array);
  //       assert.strictEqual(json.result.length, 1);
  //       assert.strictEqual(json.result[0].newText, "");
  //       assert.strictEqual(json.result[0].range.start.line, 0);
  //       assert.strictEqual(json.result[0].range.start.character, 0);
  //       assert.strictEqual(json.result[0].range.end.line, 0);
  //       assert.strictEqual(json.result[0].range.end.character, 1);
  //       done();
  //     }
  //   };
  //   lspProcess.on("message", listener);
  // });

  // it("range formatting", function (done) {
  //   sendNotification(lspProcess, "textDocument/didOpen", {
  //     textDocument: {
  //       languageId: "shellscript",
  //       version: 1,
  //       uri: "uri://range-formatting.txt",
  //       text: " FROM node AS setup"
  //     }
  //   });

  //   const requestId = sendRequest(lspProcess, "textDocument/rangeFormatting", {
  //     textDocument: {
  //       uri: "uri://range-formatting.txt",
  //     },
  //     range: {
  //       start: {
  //         line: 0,
  //         character: 0
  //       },
  //       end: {
  //         line: 0,
  //         character: 3
  //       }
  //     },
  //     options: {
  //       insertSpaces: true,
  //       tabSize: 4
  //     }
  //   });

  //   const listener = (json) => {
  //     if (json.id === requestId) {
  //       lspProcess.removeListener("message", listener);
  //       assert.ok(json.result instanceof Array);
  //       assert.strictEqual(json.result.length, 1);
  //       assert.strictEqual(json.result[0].newText, "");
  //       assert.strictEqual(json.result[0].range.start.line, 0);
  //       assert.strictEqual(json.result[0].range.start.character, 0);
  //       assert.strictEqual(json.result[0].range.end.line, 0);
  //       assert.strictEqual(json.result[0].range.end.character, 1);
  //       done();
  //     }
  //   };
  //   lspProcess.on("message", listener);
  // });

  // it("on type formatting", (done) => {
  //   sendNotification(lspProcess, "textDocument/didOpen", {
  //     textDocument: {
  //       languageId: "shellscript",
  //       version: 1,
  //       uri: "uri://on-type-formatting.txt",
  //       text: "FROM node AS setup\nRUN echo \necho"
  //     }
  //   });

  //   const requestId = sendRequest(lspProcess, "textDocument/onTypeFormatting", {
  //     textDocument: {
  //       uri: "uri://on-type-formatting.txt",
  //     },
  //     position: {
  //       line: 1,
  //       character: 9
  //     },
  //     ch: '\\',
  //     options: {
  //       insertSpaces: true,
  //       tabSize: 4
  //     }
  //   });

  //   const listener = (json) => {
  //     if (json.id === requestId) {
  //       lspProcess.removeListener("message", listener);
  //       assert.ok(json.result instanceof Array);
  //       assert.strictEqual(json.result.length, 1);
  //       assert.strictEqual(json.result[0].newText, "    ");
  //       assert.strictEqual(json.result[0].range.start.line, 2);
  //       assert.strictEqual(json.result[0].range.start.character, 0);
  //       assert.strictEqual(json.result[0].range.end.line, 2);
  //       assert.strictEqual(json.result[0].range.end.character, 0);
  //       done();
  //     }
  //   };
  //   lspProcess.on("message", listener);
  // });

  // it("rename", (done) => {
  //   sendNotification(lspProcess, "textDocument/didOpen", {
  //     textDocument: {
  //       languageId: "shellscript",
  //       version: 1,
  //       uri: "uri://rename.txt",
  //       text: "FROM node AS setup"
  //     }
  //   });

  //   const requestId = sendRequest(lspProcess, "textDocument/rename", {
  //     textDocument: {
  //       uri: "uri://rename.txt",
  //     },
  //     position: {
  //       line: 0,
  //       character: 15
  //     },
  //     newName: "build"
  //   });

  //   const listener = (json) => {
  //     if (json.id === requestId) {
  //       lspProcess.removeListener("message", listener);
  //       const changes = json.result.changes["uri://rename.txt"];
  //       assert.ok(changes instanceof Array);
  //       assert.strictEqual(changes.length, 1);
  //       assert.strictEqual(changes[0].newText, "build");
  //       assert.strictEqual(changes[0].range.start.line, 0);
  //       assert.strictEqual(changes[0].range.start.character, 13);
  //       assert.strictEqual(changes[0].range.end.line, 0);
  //       assert.strictEqual(changes[0].range.end.character, 18);
  //       done();
  //     }
  //   };
  //   lspProcess.on("message", listener);
  // });


  // Terminate LSP
  after(() => {
    lspProcess.kill();
  });

});