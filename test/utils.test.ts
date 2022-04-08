import chai from "chai";
import Parser from 'web-tree-sitter';
import { Position } from 'vscode-languageserver-types'
import { asPoint, asPosition } from "../src/utils";


const assert = chai.assert;

describe('Utils: Parser.Point <--> Position', () => {
  it('Point -> Position', () => {
    const point: Parser.Point = { row: 0, column: 2 };
    const pos: Position = { line: 0, character: 2 };
    assert.deepEqual(pos, asPosition(point));
  });

  it('Position -> Point', () => {
    const point: Parser.Point = { row: 3, column: 10 };
    const pos: Position = { line: 3, character: 10 };
    assert.deepEqual(point, asPoint(pos));
  });

  it('Point -> Position -> Point should be identity', () => {
    const point: Parser.Point = { row: 6, column: 2 };
    assert.deepEqual(point, asPoint(asPosition(point)));
  });

  it('Position -> Point -> Position should be identity', () => {
    const pos = Position.create(3, 0);
    assert.deepEqual(pos, asPosition(asPoint(pos)));
  });
});

