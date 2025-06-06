import type { Option } from "./types";
import Parser from 'web-tree-sitter';
import { TextDocument } from "vscode-languageserver-textdocument";
import { Position, Range, Hover, uinteger, integer, MarkupContent, MarkupKind } from "vscode-languageserver-types";

// Convert: Position -> Parser.Point
export function asPoint(p: Position): Parser.Point {
  return { row: p.line, column: p.character };
}


// Parser.Point -> Position
export function asPosition(p: Parser.Point): Position {
  return Position.create(p.row, p.column);
}


// Parser.SyntaxNode -> Range
export function asRange(n: Parser.SyntaxNode): Range {
  const r = Range.create(
    asPosition(n.startPosition),
    asPosition(n.endPosition)
  );
  return r;
}


// Reproduce vscode.TextDocument.lineAt()
export function lineAt(document: TextDocument, line: uinteger): string {
  return document.getText(Range.create(line, 0, line, uinteger.MAX_VALUE));
}


// Reproduce vscode.Range.contains()
export function contains(range: Range, position: Position): boolean {
  return isBeforeOrEqual(range.start, position) && isBeforeOrEqual(position, range.end);
}

// Position utils
function isBefore(left: Position, right: Position) {
  const cond1 = left.line < right.line;
  const cond2 = left.line === right.line && left.character < right.character;
  return cond1 || cond2;
}

function isEqual(left: Position, right: Position) {
  return left.line === right.line && left.character === right.character;
}

function isBeforeOrEqual(left: Position, right: Position) {
  return isBefore(left, right) || isEqual(left, right);
}

function isAfter(left: Position, right: Position) {
  return isBefore(right, left);
}

function isAfterOrEqual(left: Position, right: Position) {
  return isBeforeOrEqual(right, left);
}


// Repoduce vscode.Position.translate()
export function translate(position: Position, lineDelta: integer, characterDelta: integer): Position {
  return Position.create(
    Math.min(Math.max(0, position.line + lineDelta), integer.MAX_VALUE),
    Math.min(Math.max(0, position.character + characterDelta), integer.MAX_VALUE),
  );
}


// Format tldr pages by cleaning tldr-specific notations {{path/to/file}}
// as well as removing the title starting with '#'.
export function formatTldr(text: string | undefined): string {
  if (!text || !text.length) {
    return "";
  }
  const s = text.replace(/{{(.*?)}}/g, "$1");
  const formatted = s
      .split("\n")
      .filter((line: string) => !line.trimStart().startsWith("#"))
      .map(line => line.replace(/^`(.*)`$/gi, '    `$1`\n\n'))
      .join("\n")
      .trimStart();
  return `\n\n${formatted}`;
}


// Format usage
export function formatUsage(text: string | undefined): string {
  if (!text || !text.trim().length) {
    return "";
  }
  const trimmed = text.trim();
  const xs = trimmed.split("\n");
  const formatted = `Usage:\n\n${xs.map(x => '     ' + x).join("\n")}\n\n`;
  return `\n\n${formatted}\n`;
}


// Format description
export function formatDescription(text: string): string {
  const trimmed = text.trim();
  return `\n\n${trimmed}`;
}


// Convert: option -> UI text (string)
export function optsToMessage(opts: Option[]): string {
  if (opts.length === 1) {
    const opt = opts[0];
    const namestr = opt.names.map((s) => `\`${s}\``).join(', ');
    const argstr = (!!opt.argument) ? `\`${opt.argument}\`` : "";
    const msg = `${namestr} ${argstr}\n\n ${opt.description}`;
    return msg;
  } else {
    // deal with stacked option
    const namestrs = opts.map(opt => opt.names.map((s) => `\`${s}\``).join(', '));
    const messages = opts.map((opt, i) => `${namestrs[i]}\n\n ${opt.description}`);
    const joined = messages.join("\n\n");
    return joined;
  }
}


// string -> MarkupContent
function markup(value: string): MarkupContent {
  const res: MarkupContent = {
    kind: MarkupKind.Markdown,
    value: value,
  };
  return res;
};


// string -> Hover
export function asHover(value: string, range?: Range): Hover {
  const msg = markup(value);
  const res: Hover = {
    contents: msg,
    range
  };
  return res;
}


// check if string a is prefix of b
export function isPrefixOf(left: string, right: string): boolean {
  const lengthLeft = left.length;
  const lengthRight = right.length;
  if (lengthLeft > lengthRight) {
    return false;
  }
  return (left === right.substring(0, lengthLeft));
}


// check if token is subsequence of the text
export function isSubsequenceOf(token: string, text: string): boolean {

  // check if a letter c is found in the substring token[textIndex: ]
  // returns the index if found. Otherwise -1.
  const findIndex = (c: string, textIndex: number): number => {
    for (let i = textIndex; i < text.length; i++) {
      if (c === text[i]) {
        return i;
      }
    }
    return -1;
  };

  let textIndex = 0;
  const cs = [...token];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const res = findIndex(c, textIndex);
    if (res === -1) {
      return false;
    }
    textIndex = res + 1;
  }
  return true;
}