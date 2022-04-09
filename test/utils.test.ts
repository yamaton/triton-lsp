import chai from "chai";
import Parser from 'web-tree-sitter';
import { Position, Range } from 'vscode-languageserver-types'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { asPoint, asPosition, lineAt } from "../src/utils";


const assert = chai.assert;

describe('Utils: Misc', () => {
  it('asPosition: Point -> Position', () => {
    const point: Parser.Point = { row: 0, column: 2 };
    const pos: Position = { line: 0, character: 2 };
    assert.deepEqual(pos, asPosition(point));
  });

  it('asPoint: Position -> Point', () => {
    const point: Parser.Point = { row: 3, column: 10 };
    const pos: Position = { line: 3, character: 10 };
    assert.deepEqual(point, asPoint(pos));
  });

  it('asPoint . asPosition === id', () => {
    const point: Parser.Point = { row: 6, column: 2 };
    assert.deepEqual(point, asPoint(asPosition(point)));
  });

  it('asPosition . asPoint === id', () => {
    const pos = Position.create(3, 0);
    assert.deepEqual(pos, asPosition(asPoint(pos)));
  });

  it('lineAt', () => {
    const content = "abyss\n  - nanachi\n  - riko\n  - regu"
    const doc = TextDocument.create('baba', 'typescript', 2, content);
    const line = lineAt(doc, 1);
    assert.equal(line, "  - nanachi\n");
  });

});

