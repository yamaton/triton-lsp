import chai from "chai";
import Parser from 'web-tree-sitter';
import { Position, Range, uinteger, integer } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { asPoint, asPosition, lineAt, contains, translate } from "../src/utils";


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
    const content = "abyss\n  - nanachi\n  - riko\n  - regu";
    const doc = TextDocument.create('baba', 'typescript', 2, content);
    const line = lineAt(doc, 1);
    assert.strictEqual(line, "  - nanachi\n");
  });

  it('contains 0', () => {
    const start = Position.create(1, 2);
    const end = Position.create(3, 0);
    const range = Range.create(start, end);
    assert.isTrue(contains(range, start) && contains(range, end));
  });

  it('contains 1', () => {
    const start = Position.create(1, 5);
    const end = Position.create(3, 3);
    const range = Range.create(start, end);
    const p1 = Position.create(1, 1000);
    const p2 = Position.create(2, uinteger.MAX_VALUE);
    const p3 = Position.create(2, 0);
    const p4 = Position.create(3, 1);
    const points = [p1, p2, p3, p4];
    assert.isTrue(points.every(p => contains(range, p)));
  });

  it('contains 2', () => {
    const start = Position.create(1, 5);
    const end = Position.create(3, 0);
    const range = Range.create(start, end);
    const p1 = Position.create(1, 2);
    const p2 = Position.create(3, 2);
    const p3 = Position.create(4, 10);
    assert.isFalse(contains(range, p1) || contains(range, p2) || contains(range, p3));
  });

  it('translate 0', () => {
    const p = Position.create(1, 5);
    const expected = Position.create(1, 0);
    assert.deepEqual(expected, translate(p, 0, -100));
  });

  it('translate 1', () => {
    const p = Position.create(1, 5);
    const expected = Position.create(3, uinteger.MAX_VALUE);
    assert.deepEqual(expected, translate(p, 2, integer.MAX_VALUE));
  });

});



