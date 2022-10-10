import chai from "chai";
import Analyzer from "../analyzer";
import { MarkupContent, MarkupKind, Position } from "vscode-languageserver-types";
import { HoverParams, DidOpenTextDocumentParams } from "vscode-languageserver-protocol";

const assert = chai.assert;


function prepare(text: string, position: Position, uri: string = "file://some/text/document.sh"): {
  didOpenTextDocumentParams: DidOpenTextDocumentParams,
  hoverParams: HoverParams
} {

  const textDocument = {
    uri,
    languageId: "shellscript",
    version: 2,
    text
  };
  const textDocumentIdentifier = { uri };
  const didOpenTextDocumentParams = { textDocument };
  const hoverParams = { position, textDocument: textDocumentIdentifier };

  return { didOpenTextDocumentParams, hoverParams };
}




describe('Hover', () => {

  let analyzer: Analyzer;
  before(async () => {
    analyzer = await Analyzer.initialize();
  });


  it("conda install", async () => {
    const text = "conda install";
    const position = Position.create(0, 9);
    const expected = `conda **install**\n\n Installs a list of packages into a specified conda environment.`;

    const { didOpenTextDocumentParams, hoverParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const hover = await analyzer.provideHover(hoverParams);
    if (!!hover && MarkupContent.is(hover.contents)) {
      assert.strictEqual(hover.contents.kind, MarkupKind.Markdown);
      assert.strictEqual(hover.contents.value, expected);
    } else {
      assert.fail("hover.content is not MarkupContent.");
    }
  });

  it("tar -xvf", async () => {
    const text = "tar -xvf";
    const position = Position.create(0, 6);
    const expected = `\`-x\`, \`--extract\`, \`--get\`\n\n extract files from an archive\n\n\`-v\`, \`--verbose\`\n\n verbosely list files processed\n\n\`-f\`, \`--file\`\n\n use archive file or device ARCHIVE`;
    const { didOpenTextDocumentParams, hoverParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const hover = await analyzer.provideHover(hoverParams);
    if (!!hover && MarkupContent.is(hover.contents)) {
      assert.strictEqual(hover.contents.kind, MarkupKind.Markdown);
      assert.strictEqual(hover.contents.value, expected);
    } else {
      assert.fail("hover.content is not MarkupContent.");
    }
  });

  it("cut --delimiter", (done) => {
    const text = "curl --delimiter ',' -f 1";
    const position = Position.create(0, 10);
    const expected = "\`-d\`, \`--delimiter\` `DELIM`\n\n  use DELIM instead of TAB for field delimiter";
    const { didOpenTextDocumentParams, hoverParams } = prepare(text, position);
    analyzer.open(didOpenTextDocumentParams);
    const hover = analyzer.provideHover(hoverParams);
    hover.then((hov) => {
      if (!!hov && MarkupContent.is(hov.contents)) {
        assert.strictEqual(hov.contents.kind, MarkupKind.Markdown);
        assert.strictEqual(hov.contents.value, expected);
        done();
      } else {
        assert.fail("hover.content is not MarkupContent.");
      }
    });
  });


});

