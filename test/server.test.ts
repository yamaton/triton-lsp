// https://github.com/rcjsuen/dockerfile-language-server-nodejs/blob/master/test/server.test.ts

import chai from "chai";
import * as child_process from "child_process";
const assert = chai.assert;
import { MarkupKind } from 'vscode-languageserver-types'
import { TextDocumentSyncKind, InitializeResult } from 'vscode-languageserver';



// fork the server and connect to it using Node IPC
let lspProcess = child_process.fork("out/server.js", ["--node-ipc"]);
let messageId = 1;



function sendRequest(method: string, params: any): number {
  let message = {
    jsonrpc: "2.0",
    id: messageId++,
    method: method,
    params: params
  };
  lspProcess.send(message);
  return messageId - 1;
}


function sendNotification(method: string, params: any) {
  let message = {
    jsonrpc: "2.0",
    method: method,
    params: params
  };
  lspProcess.send(message);
}


function initialize(applyEdit: boolean, codeAction?: any, rename?: any): number {
  return initializeCustomCapabilities({
    textDocument: {
      completion: {
        completionItem: {
          deprecatedSupport: true,
          documentationFormat: [MarkupKind.Markdown],
          snippetSupport: true
        }
      },
      hover: {
        contentFormat: [MarkupKind.PlainText]
      },
      codeAction,
      semanticTokens: {
        formats: [],
        requests: {
          full: {
            delta: false
          }
        },
        tokenModifiers: [],
        tokenTypes: []
      },
      rename
    },
    workspace: {
      applyEdit: applyEdit,
      workspaceEdit: {
        documentChanges: true
      }
    }
  });
}


function initializeCustomCapabilities(capabilities: any): number {
  return sendRequest("initialize", {
    rootPath: process.cwd(),
    processId: process.pid,
    capabilities
  });
}


describe("LSP Tests", () => {
  it("initialize", function (finished) {
    this.timeout(5000);
    const responseId = initialize(false);
    lspProcess.once('message', function (json: InitializeResult) {
      assert.equal(json.id, responseId);
      let capabilities = json.result.capabilities;
      assert.equal(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
      assert.equal(capabilities.codeActionProvider, false);
      assert.equal(capabilities.completionProvider.resolveProvider, true);
      assert.equal(capabilities.executeCommandProvider, undefined);
      assert.equal(capabilities.foldingRangeProvider, true);
      assert.equal(capabilities.hoverProvider, true);
      assert.equal(capabilities.renameProvider, true);
      assert.equal(capabilities.renameProvider.prepareProvider, undefined);
      assert.equal(capabilities.semanticTokensProvider.full.delta, false);
      finished();
    });
  });

  it("initialize", function (finished) {
    this.timeout(5000);
    const responseId = initialize(false, {}, { prepareSupport: false });
    lspProcess.once('message', function (json: InitializeResult) {
      assert.equal(json.id, responseId);
      let capabilities = json.result.capabilities;
      assert.equal(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
      assert.equal(capabilities.codeActionProvider, false);
      assert.equal(capabilities.completionProvider.resolveProvider, true);
      assert.equal(capabilities.executeCommandProvider, undefined);
      assert.equal(capabilities.foldingRangeProvider, true);
      assert.equal(capabilities.hoverProvider, true);
      assert.equal(capabilities.renameProvider, true);
      assert.equal(capabilities.renameProvider.prepareProvider, undefined);
      finished();
    });
  });

  it("initialize", function (finished) {
    this.timeout(5000);
    const responseId = initialize(false, {}, { prepareSupport: true });
    lspProcess.once('message', function (json: InitializeResult) {
      assert.equal(json.id, responseId);
      let capabilities = json.result.capabilities;
      assert.equal(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
      assert.equal(capabilities.codeActionProvider, false);
      assert.equal(capabilities.completionProvider.resolveProvider, true);
      assert.equal(capabilities.executeCommandProvider, undefined);
      assert.equal(capabilities.foldingRangeProvider, true);
      assert.equal(capabilities.hoverProvider, true);
      assert.equal(capabilities.renameProvider.prepareProvider, true);
      finished();
    });
  });

  it("initialized", function () {
    sendNotification("initialized", {});
  });


  it("definition", function (finished) {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        languageId: "shellscript",
        version: 1,
        uri: "uri://definition.txt",
        text: "FROM node AS setup"
      }
    });

    const requestId = sendRequest("textDocument/definition", {
      textDocument: {
        uri: "uri://definition.txt",
      },
      position: {
        line: 0,
        character: 15
      }
    });

    const listener = (json) => {
      if (json.id === requestId) {
        lspProcess.removeListener("message", listener);
        assert.strictEqual(json.result.uri, "uri://definition.txt");
        assert.strictEqual(json.result.range.start.line, 0);
        assert.strictEqual(json.result.range.start.character, 13);
        assert.strictEqual(json.result.range.end.line, 0);
        assert.strictEqual(json.result.range.end.character, 18);
        finished();
      }
    };
    lspProcess.on("message", listener);
  });

  it("formatting", function (finished) {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        languageId: "shellscript",
        version: 1,
        uri: "uri://formatting.txt",
        text: " FROM node AS setup"
      }
    });

    const requestId = sendRequest("textDocument/formatting", {
      textDocument: {
        uri: "uri://formatting.txt",
      },
      options: {
        insertSpaces: true,
        tabSize: 4
      }
    });

    const listener = (json) => {
      if (json.id === requestId) {
        lspProcess.removeListener("message", listener);
        assert.ok(json.result instanceof Array);
        assert.strictEqual(json.result.length, 1);
        assert.strictEqual(json.result[0].newText, "");
        assert.strictEqual(json.result[0].range.start.line, 0);
        assert.strictEqual(json.result[0].range.start.character, 0);
        assert.strictEqual(json.result[0].range.end.line, 0);
        assert.strictEqual(json.result[0].range.end.character, 1);
        finished();
      }
    };
    lspProcess.on("message", listener);
  });

  it("range formatting", function (finished) {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        languageId: "shellscript",
        version: 1,
        uri: "uri://range-formatting.txt",
        text: " FROM node AS setup"
      }
    });

    const requestId = sendRequest("textDocument/rangeFormatting", {
      textDocument: {
        uri: "uri://range-formatting.txt",
      },
      range: {
        start: {
          line: 0,
          character: 0
        },
        end: {
          line: 0,
          character: 3
        }
      },
      options: {
        insertSpaces: true,
        tabSize: 4
      }
    });

    const listener = (json) => {
      if (json.id === requestId) {
        lspProcess.removeListener("message", listener);
        assert.ok(json.result instanceof Array);
        assert.strictEqual(json.result.length, 1);
        assert.strictEqual(json.result[0].newText, "");
        assert.strictEqual(json.result[0].range.start.line, 0);
        assert.strictEqual(json.result[0].range.start.character, 0);
        assert.strictEqual(json.result[0].range.end.line, 0);
        assert.strictEqual(json.result[0].range.end.character, 1);
        finished();
      }
    };
    lspProcess.on("message", listener);
  });

  it("on type formatting", (finished) => {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        languageId: "shellscript",
        version: 1,
        uri: "uri://on-type-formatting.txt",
        text: "FROM node AS setup\nRUN echo \necho"
      }
    });

    const requestId = sendRequest("textDocument/onTypeFormatting", {
      textDocument: {
        uri: "uri://on-type-formatting.txt",
      },
      position: {
        line: 1,
        character: 9
      },
      ch: '\\',
      options: {
        insertSpaces: true,
        tabSize: 4
      }
    });

    const listener = (json) => {
      if (json.id === requestId) {
        lspProcess.removeListener("message", listener);
        assert.ok(json.result instanceof Array);
        assert.strictEqual(json.result.length, 1);
        assert.strictEqual(json.result[0].newText, "    ");
        assert.strictEqual(json.result[0].range.start.line, 2);
        assert.strictEqual(json.result[0].range.start.character, 0);
        assert.strictEqual(json.result[0].range.end.line, 2);
        assert.strictEqual(json.result[0].range.end.character, 0);
        finished();
      }
    };
    lspProcess.on("message", listener);
  });

  it("rename", (finished) => {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        languageId: "shellscript",
        version: 1,
        uri: "uri://rename.txt",
        text: "FROM node AS setup"
      }
    });

    const requestId = sendRequest("textDocument/rename", {
      textDocument: {
        uri: "uri://rename.txt",
      },
      position: {
        line: 0,
        character: 15
      },
      newName: "build"
    });

    const listener = (json) => {
      if (json.id === requestId) {
        lspProcess.removeListener("message", listener);
        const changes = json.result.changes["uri://rename.txt"];
        assert.ok(changes instanceof Array);
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].newText, "build");
        assert.strictEqual(changes[0].range.start.line, 0);
        assert.strictEqual(changes[0].range.start.character, 13);
        assert.strictEqual(changes[0].range.end.line, 0);
        assert.strictEqual(changes[0].range.end.character, 18);
        finished();
      }
    };
    lspProcess.on("message", listener);
  });

});