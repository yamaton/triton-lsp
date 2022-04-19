import chai from "chai";
import Analyzer from "../src/analyzer";
import { Position } from "vscode-languageserver-types";
import { CompletionParams, DidOpenTextDocumentParams } from "vscode-languageserver-protocol";

const assert = chai.assert;


function prepare(text: string, position: Position, uri: string = "file://some/text/document.sh"): {
  didOpenTextDocumentParams: DidOpenTextDocumentParams,
  completionParams: CompletionParams
} {

  const textDocument = {
    uri,
    languageId: "shellscript",
    version: 2,
    text
  };
  const textDocumentIdentifier = { uri };
  const didOpenTextDocumentParams = { textDocument };
  const completionParams = { position, textDocument: textDocumentIdentifier };

  return { didOpenTextDocumentParams, completionParams };
}

describe('Autocomplete', () => {
  let analyzer: Analyzer;
  before(async () => {
    analyzer = await Analyzer.initialize();
  });

  it("cond", async () => {
    const text = "cond";
    const position = Position.create(0, 4);
    const { didOpenTextDocumentParams, completionParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const items = await analyzer.provideCompletion(completionParams);
    const labels = items.map(i => i.label);
    console.log(`[Autocomplete] labels = ${labels}`);
  });

  it("conda in", async () => {
    const text = "conda in";
    const position = Position.create(0, 8);
    const { didOpenTextDocumentParams, completionParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const items = await analyzer.provideCompletion(completionParams);
    const labels = items.map(i => i.label);
    console.log(`[Autocomplete] labels = ${labels}`);
  });

  it("conda install", async () => {
    const text = "conda install";
    const position = Position.create(0, 14);
    const { didOpenTextDocumentParams, completionParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const items = await analyzer.provideCompletion(completionParams);
    const labels = items.map(i => i.label);
    console.log(`[Autocomplete] labels = ${labels}`);
  });

});

