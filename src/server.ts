import * as LSP from 'vscode-languageserver/node';
import {
  CompletionParams, DidChangeConfigurationNotification, DidChangeTextDocumentParams,
  DidCloseTextDocumentParams, DidOpenTextDocumentParams,
  HoverParams,
  InitializeParams, InitializeResult, ServerCapabilities, TextDocumentSyncKind
} from 'vscode-languageserver-protocol';
import Analyzer from './analyzer';


const serverCapabilities: ServerCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Incremental,
  completionProvider: {
    resolveProvider: false,

    // // [FIXME]
    // // The following enables completion label details.
    // // This feature is still in proposed state for 3.17.0.
    // // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionOptions
    completionItem: {
      labelDetailsSupport: true
    }

  },
  hoverProvider: true,
  // documentHighlightProvider: true,
  // definitionProvider: true,
  // documentSymbolProvider: true,
  // workspaceSymbolProvider: true,
  // referencesProvider: true,
};

const connection = LSP.createConnection(LSP.ProposedFeatures.all);

// console.debug is alias of console.log
console.debug = connection.console.log.bind(connection.console);
console.log = connection.console.log.bind(connection.console);
console.info = connection.console.info.bind(connection.console);
console.warn = connection.console.warn.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// analyzer is initialized within conneciton.onInitialize() to resolve a promise
let analyzer: Analyzer;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;


connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  // Initialize analyzer here to resolve the promise of initializeParser()
  connection.console.log("onInitialize()");
  analyzer = await Analyzer.initialize();

  // [FIXME] ignore client capabilities for now
  // const clientCapabilities = params.capabilities;

  const result: InitializeResult = {
    capabilities: serverCapabilities
  };

  return result;
});


connection.onInitialized(() => {
  connection.console.log('onInitialized!');

  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});


connection.onDidOpenTextDocument((params: DidOpenTextDocumentParams) => {
  connection.console.log("onDidOpenTextDocument!");
  analyzer.open(params);
});


connection.onDidCloseTextDocument((params: DidCloseTextDocumentParams) => {
  connection.console.log("onDidCloseTextDocument!");
  analyzer.close(params);
});


connection.onDidChangeTextDocument((params: DidChangeTextDocumentParams) => {
  connection.console.log("onDidChangeTextDocument!");
  analyzer.update(params);
});

connection.onCompletion((params: CompletionParams) => {
  connection.console.log("onCompletion!");
  return analyzer.provideCompletion(params);
});

connection.onHover((params: HoverParams) => {
  connection.console.log("onHover!");
  return analyzer.provideHover(params);
});


// start listening after setups
connection.listen();
