import * as LSP from 'vscode-languageserver/node';
import { InitializeResult, ServerCapabilities, TextDocumentSyncKind } from 'vscode-languageserver-protocol';
import Analyzer from './analyzer';


const serverCapabilities: ServerCapabilities = {
  // For now we're using full-sync even though tree-sitter has great support
  // for partial updates.
  textDocumentSync: TextDocumentSyncKind.Incremental,
  completionProvider: {
    resolveProvider: true,
    triggerCharacters: [' '],

    // // [FIXME]
    // // The following enables completion label details.
    // // This feature is still in proposed state for 3.17.0.
    // // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionOptions
    //
    // completionItem: {
    //   labelDetailsSupport: true
    // }

  },
  hoverProvider: true,
  // documentHighlightProvider: true,
  // definitionProvider: true,
  // documentSymbolProvider: true,
  // workspaceSymbolProvider: true,
  // referencesProvider: true,
};


const connection = LSP.createConnection(LSP.ProposedFeatures.all);
// analyzer is initialized within conneciton.onInitialize() to resolve a promise
let analyzer: Analyzer;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;


connection.onInitialize(async (params: LSP.InitializeParams): Promise<InitializeResult> => {
  // Initialize analyzer here to resolve the promise of initializeParser()
  analyzer = await Analyzer.initialize();

  // [FIXME] ignore client capabilities for now
  // const clientCapabilities = params.capabilities;

  const result: LSP.InitializeResult = {
    capabilities: serverCapabilities
  };

  return result;
});


connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(LSP.DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});


connection.onDidOpenTextDocument((params: LSP.DidOpenTextDocumentParams) => {
  analyzer.open(params);
});


connection.onDidCloseTextDocument((params: LSP.DidCloseTextDocumentParams) => {
  analyzer.close(params);
});


connection.onDidChangeTextDocument((params: LSP.DidChangeTextDocumentParams) => {
  analyzer.update(params);
});


connection.onCompletion((params: LSP.CompletionParams) => analyzer.provideCompletion(params));
connection.onHover((params: LSP.HoverParams) => analyzer.provideHover(params));


// start listening after setups
connection.listen();
