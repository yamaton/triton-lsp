import { Option } from "./command";
import Parser from 'web-tree-sitter';


// Format tldr pages by cleaning tldr-specific notations {{path/to/file}}
// as well as removing the title starting with '#'.
export function formatTldr(text: string): string {
  const s = text.replace(/{{(.*?)}}/g, "$1");
  const formatted = s.split("\n").filter((line: string) => !line.trimStart().startsWith("#")).join("\n").trimStart();
  return formatted;
}


// Convert: vscode.Position -> Parser.Point
export function asPoint(p: vscode.Position): Parser.Point {
  return { row: p.line, column: p.character };
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
