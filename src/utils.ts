import { Option } from "./command";
import Parser from 'web-tree-sitter';
import LSP from 'vscode-languageserver';
import { TextDocument } from "vscode-languageserver-textdocument";



// Convert: vscode.Position -> Parser.Point
export function asPoint(p: LSP.Position): Parser.Point {
  return { row: p.line, column: p.character };
}


// Parser.Point -> LSP.Position
function asPosition(p: Parser.Point): LSP.Position {
  return LSP.Position.create(p.row, p.column);
}


// Parser.SyntaxNode -> LSP.Range
export function asRange(n: Parser.SyntaxNode): LSP.Range {
  const r = LSP.Range.create(
    asPosition(n.startPosition),
    asPosition(n.endPosition)
  );
  return r;
}


export function lineAt(document: TextDocument, line: number): string {
  return document.getText(LSP.Range.create(line, -1, line, Number.MAX_VALUE));
}


// This is consistent with vscode.Range.contains
export function contains(range: LSP.Range, position: LSP.Position): boolean {
  return isBeforeOrEqual(range.start, position) && isBeforeOrEqual(position, range.end);
}

// Position utils
function isBefore(left: LSP.Position, right: LSP.Position) {
  const cond1 = left.line < right.line;
  const cond2 = left.line == right.line && left.character < right.character;
  return cond1 || cond2;
}

function isEqual(left: LSP.Position, right: LSP.Position) {
  return left.line == right.line && left.character == right.character;
}

function isBeforeOrEqual(left: LSP.Position, right: LSP.Position) {
  return isBefore(left, right) || isEqual(left, right);
}

function isAfter(left: LSP.Position, right: LSP.Position) {
  return isBefore(right, left);
}

function isAfterOrEqual(left: LSP.Position, right: LSP.Position) {
  return isBeforeOrEqual(right, left);
}

export function translate(position: LSP.Position, lineDelta: number, characterDelta: number): LSP.Position {
  return LSP.Position.create(
    Math.max(0, position.line + lineDelta),
    Math.max(0, position.character + characterDelta),
  );
}



// Format tldr pages by cleaning tldr-specific notations {{path/to/file}}
// as well as removing the title starting with '#'.
export function formatTldr(text: string): string {
  const s = text.replace(/{{(.*?)}}/g, "$1");
  const formatted = s.split("\n").filter((line: string) => !line.trimStart().startsWith("#")).join("\n").trimStart();
  return formatted;
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
