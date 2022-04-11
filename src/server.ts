import LSP from 'vscode-languageserver/node';
import Analyzer from './analyzer';

const connection = LSP.createConnection(LSP.ProposedFeatures.all);
// analyzer is initialized within conneciton.onInitialize() to resolve a promise
let analyzer: Analyzer;

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize(async (params: LSP.InitializeParams) => {
  analyzer = await Analyzer.initialize();  // Initialize here to resolve the promise of initializeParser()

  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: LSP.InitializeResult = {
    capabilities: {
      textDocumentSync: LSP.TextDocumentSyncKind.Incremental,

      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [' '],
      },
      hoverProvider: true,
    }
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});


connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
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

