import chai from "chai";
import Analyzer from "../src/analyzer";
import { Position } from "vscode-languageserver-types";

const assert = chai.assert;


function prepare(text: string, position: Position, uri: string = "file://some/text/document.sh") {

  const textDocument = {
    uri,
    languageId: "shellscript",
    version: 2,
    text
  };
  const textDocumentIdentifier = { uri };
  const didOpenTextDocumentParams = { textDocument };
  const didChangeTextDocumentParams = { position, textDocument: textDocumentIdentifier };

  return { didOpenTextDocumentParams, didChangeTextDocumentParams }
}


describe('Autocomplete', async () => {
  const analyzer = await Analyzer.initialize();

  it("conda in", async () => {
    const text = "conda in"
    const position = Position.create(0, 8);
    const { didOpenTextDocumentParams, didChangeTextDocumentParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const items = await analyzer.provideCompletion(didChangeTextDocumentParams);
    const labels = items.map(i => i.label);
    console.log(`labels = ${labels}`);
  });

  it("conda install", async () => {
    const text = "conda install"
    const position = Position.create(0, 14);
    const { didOpenTextDocumentParams, didChangeTextDocumentParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const items = await analyzer.provideCompletion(didChangeTextDocumentParams);
    const labels = items.map(i => i.label);
    console.log(`labels = ${labels}`);
  });

});

