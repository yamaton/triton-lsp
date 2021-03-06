import * as fs from 'fs';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import type { SyntaxNode } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, TextEdit, CompletionItem, Hover } from 'vscode-languageserver-types';
import {
  TextDocumentContentChangeEvent, DidChangeTextDocumentParams, DidOpenTextDocumentParams,
  DidCloseTextDocumentParams, CompletionParams, HoverParams
} from 'vscode-languageserver-protocol';
import type { Command, Option } from './types';
import CommandFetcher from './commandFetcher';
import { contains, asRange, translate, lineAt, asPoint, formatTldr, asHover, optsToMessage } from './utils';


type Trees = { [uri: string]: Parser.Tree };
type MyTextDocuments = { [uri: string]: TextDocument };


// Create and initalize Parser object
async function initializeParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser();
  const wasmpath = path.join(__dirname, '..', 'tree-sitter-bash.wasm');
  if (!fs.existsSync(wasmpath)) {
    throw new Error(`tree-sitter-bash.wasm is not found`);
  }
  const lang = await Parser.Language.load(wasmpath);
  parser.setLanguage(lang);
  return parser;
}


// Get the deepest node covering `position`
function getCurrentNode(n: Parser.SyntaxNode, position: Position): Parser.SyntaxNode {
  if (!(contains(asRange(n), position))) {
    console.error("Out of range!");
  }
  for (const child of n.children) {
    const r = asRange(child);
    if (contains(r, position)) {
      return getCurrentNode(child, position);
    }
  }
  return n;
}


// Moves the position left by one character IF position is contained only in the root-node range.
// This is just a workround as you cannot reach command node if you start from
// the position, say, after 'echo '
// [FIXME] Do not rely on such an ugly hack
function walkbackIfNeeded(document: TextDocument, root: SyntaxNode, position: Position): Position {
  const thisNode = getCurrentNode(root, position);
  console.info("[walkbackIfNeeded] thisNode.type: ", thisNode.type);
  if (position.character > 0 && thisNode.type !== 'word') {
    console.info("[walkbackIfNeeded] stepping back!");
    return walkbackIfNeeded(document, root, translate(position, 0, -1));
  } else if (thisNode.type !== 'word' && position.character === 0 && position.line > 0) {
    const prevLineIndex = position.line - 1;
    const prevLine = lineAt(document, prevLineIndex);
    if (prevLine.trimEnd().endsWith('\\')) {
      const charIndex = prevLine.trimEnd().length - 1;
      return walkbackIfNeeded(document, root, Position.create(prevLineIndex, charIndex));
    }
  }
  return position;
}


// Returns current word as an option if the tree-sitter says so
function getMatchingOption(currentWord: string, cmdSeq: Command[]): Option[] {
  const thisName = currentWord.split('=', 2)[0];
  if (thisName.startsWith('-')) {
    const options = getOptions(cmdSeq);
    const theOption = options.find((x) => x.names.includes(thisName));
    if (theOption) {
      return [theOption];
    } else if (isOldStyle(thisName)) {
      // deal with a stacked options like `-xvf`
      // or, a short option immediately followed by an argument, i.e. '-oArgument'
      const shortOptionNames = unstackOption(thisName);
      const shortOptions = shortOptionNames.map(short => options.find(opt => opt.names.includes(short))!).filter(opt => opt);
      if (shortOptionNames.length > 0 && shortOptionNames.length === shortOptions.length) {
        return shortOptions;        // i.e. -xvf
      } else if (shortOptions.length > 0) {
        return [shortOptions[0]];   // i.e. -oArgument
      }
    }
  }
  return [];
}


function _isNotOldStyle(name: string): boolean {
  return name.startsWith('--') || name.length === 2;
}


// check if string is old style like '-option arg'
function isOldStyle(name: string): boolean {
  return name.startsWith('-') && !_isNotOldStyle(name);
}


// unstackOption('-xvf') == ['-x', '-v', '-f']
function unstackOption(name: string): string[] {
  const xs = name.substring(1).split('').map(c => c.padStart(2, '-'));
  return [...new Set(xs)];
}


// Get command node inferred from the current position
function _getContextCommandNode(root: SyntaxNode, position: Position): SyntaxNode | undefined {
  let currentNode = getCurrentNode(root, position);
  if (currentNode.parent?.type === 'command_name') {
    currentNode = currentNode.parent;
  }
  if (currentNode.parent?.type === 'command') {
    return currentNode.parent;
  }
}


// Get command name covering the position if exists
function getContextCommandName(root: SyntaxNode, position: Position): string | undefined {
  // if you are at a command, a named node, the currentNode becomes one-layer deeper than other nameless nodes.
  const commandNode = _getContextCommandNode(root, position);
  let name = commandNode?.firstNamedChild?.text!;
  if (name === 'sudo') {
    name = commandNode?.firstNamedChild?.nextSibling?.text!;
  }
  return name;
}


// Get subcommand names NOT starting with `-`
// [FIXME] this catches option's argument; use database instead
function _getSubcommandCandidates(root: SyntaxNode, position: Position): string[] {
  const candidates: string[] = [];
  let commandNode = _getContextCommandNode(root, position)!;
  if (commandNode) {
    let n = commandNode?.firstNamedChild;
    while (n?.nextSibling) {
      n = n?.nextSibling;
      if (!n.text.startsWith('-')) {
        candidates.push(n.text);
      }
    }
  }
  return candidates;
}


// Get command arguments as string[]
function getContextCmdArgs(document: TextDocument, root: SyntaxNode, position: Position, dropLast: boolean = false): string[] {
  const p = walkbackIfNeeded(document, root, position);
  let node = _getContextCommandNode(root, p)?.firstNamedChild;
  if (node?.text === 'sudo') {
    node = node.nextSibling;
  }
  let res: string[] = [];
  while (node?.nextSibling) {
    node = node.nextSibling;
    let text = node.text;
    // --option=arg
    if (text.startsWith('--') && text.includes('=')) {
      text = text.split('=', 2)[0];
    }
    res.push(text);
  }

  if (dropLast && res.length) {
    res = res.slice(0, -1);
  }
  return res;
}


// Get subcommand completions
function getCompletionsSubcommands(deepestCmd: Command): CompletionItem[] {
  const subcommands = getSubcommandsWithAliases(deepestCmd);
  if (subcommands && subcommands.length) {
    const compitems = subcommands.map((sub, idx) => {
      const item = asCompletionItem(sub.name, sub.description);
      item.sortText = `33-${idx.toString().padStart(4)}`;
      return item;
    });
    return compitems;
  }
  return [];
}


// Get option completion
function getCompletionsOptions(document: TextDocument, root: SyntaxNode, position: Position, cmdSeq: Command[], dropLast: boolean = false): CompletionItem[] {
  const args = getContextCmdArgs(document, root, position, dropLast);
  const compitems: CompletionItem[] = [];
  const options = getOptions(cmdSeq);
  options.forEach((opt, idx) => {
    // suppress already-used options
    if (opt.names.every(name => !args.includes(name))) {
      opt.names.forEach(name => {
        const item = asCompletionItem(name, opt.description);
        item.sortText = `55-${idx.toString().padStart(4)}`;
        if (opt.argument) {
          const snippet = `${name} \$\{1:${opt.argument}\}`;
          // [TODO] replace with item.textEdit = (something: TextEdit | InsertReplace)
          item.insertText = snippet;
        }
        compitems.push(item);
      });
    }
  });
  return compitems;
}


// Get the word at given position
function getThisWord(root: SyntaxNode, p: Position): string {
  let node = _getContextCommandNode(root, p)?.firstNamedChild;
  let res = (!!node) ? node.text : "";

  while (node?.nextSibling) {
    node = node.nextSibling;
    let text = node.text;
    // --option=arg
    if (text.startsWith('--') && text.includes('=')) {
      text = text.split('=', 2)[0];
    }
    res = text;
  }
  return res;
}


// To CompletionItem
// [FIXME] Want to pass vscode.CompletionItemLabel with {label: label, description: desc}
function asCompletionItem(label: string, desc: string): CompletionItem {
  const compitem = CompletionItem.create(label);
  compitem.documentation = desc;
  // Requires support of LSP v3.17
  compitem.labelDetails = { description: desc };
  return compitem;
}


// Get options including inherited ones
function getOptions(cmdSeq: Command[]): Option[] {
  const inheritedOptionsArray = cmdSeq.map(x => (!!x.inheritedOptions) ? x.inheritedOptions : []);
  const deepestCmd = cmdSeq[cmdSeq.length - 1];
  const options = deepestCmd.options.concat(...inheritedOptionsArray);
  return options;
}


// Get subcommands including aliases of a subcommands
function getSubcommandsWithAliases(cmd: Command): Command[] {
  const subcommands = cmd.subcommands;
  if (!subcommands) {
    return [];
  }

  const res: Command[] = [];
  for (let subcmd of subcommands) {
    res.push(subcmd);
    if (!!subcmd.aliases) {
      for (const alias of subcmd.aliases) {
        const aliasCmd = { ...subcmd };
        aliasCmd.name = alias;
        aliasCmd.description = `(Alias of ${subcmd.name}) `.concat(aliasCmd.description);
        res.push(aliasCmd);
      }
    }
  }
  return res;
}


// get Parser.Edit from TextDocumentContentChangeEvent
type ContentChangeEvent = {
  range: Range;
  text: string;
};

function getDelta(e: ContentChangeEvent, text: TextDocument): Parser.Edit {
  const startIndex = text.offsetAt(e.range.start);
  const oldEndIndex = text.offsetAt(e.range.end);
  const newEndIndex = startIndex + e.text.length;
  const startPosition = asPoint(e.range.start);
  const oldEndPosition = asPoint(e.range.end);
  const newEndPosition = asPoint(text.positionAt(newEndIndex));
  return {
    startIndex, oldEndIndex, newEndIndex,
    startPosition, oldEndPosition, newEndPosition
  };
}



//----------------------------------------------------
//       Analyzer
//----------------------------------------------------

// Provide completion and hover
export default class Analyzer {
  private trees: Trees;
  private documents: MyTextDocuments;
  private parser: Parser;
  private fetcher: CommandFetcher;

  static async initialize() {
    const parser = await initializeParser();
    return new Analyzer(parser);
  }


  constructor(parser: Parser) {
    this.trees = {};
    this.documents = {};
    this.fetcher = new CommandFetcher();
    this.parser = parser;
  }


  // Update both `this.trees` and `this.documents`
  public update(params: DidChangeTextDocumentParams): void {

    // If the changes are incremental
    if (params.contentChanges.every(TextDocumentContentChangeEvent.isIncremental)) {
      this.updateWithIncremental(params);

      // if the changes are full (just in case)
    } else if (params.contentChanges.every(TextDocumentContentChangeEvent.isFull)) {
      console.error("[Analyzer] DidChangeTextDocumentParams should NOT be Full");
      this.updateWithFull(params);

      // don't know what to do if both incremental and full changes are present.
    } else {
      console.error("[Analyzer] DidChangeTextDocumentParams has both Incremental and Full changes. Confused.");
    }
  }


  updateWithIncremental(params: DidChangeTextDocumentParams): void {
    const uri = params.textDocument.uri;
    const oldTree = this.trees[uri];
    const oldDoc = this.documents[uri];
    const edits: TextEdit[] = [];

    for (const e of params.contentChanges) {
      if (TextDocumentContentChangeEvent.isIncremental(e)) {
        const delta = getDelta(e, oldDoc);
        oldTree.edit(delta);
        edits.push({ range: e.range, newText: e.text });
      } else {
        console.error("[Analyzer] Should take Incremental changes.");
        return;
      }
    }
    const newContent = TextDocument.applyEdits(oldDoc, edits);
    this.trees[uri] = this.parser.parse(newContent, oldTree);

    const newDoc = TextDocument.create(oldDoc.uri, oldDoc.languageId, oldDoc.version, newContent);
    this.documents[uri] = newDoc;
  }


  updateWithFull(params: DidChangeTextDocumentParams): void {
    const lastEvent = params.contentChanges[params.contentChanges.length - 1];
    if (TextDocumentContentChangeEvent.isIncremental(lastEvent)) {
      console.error("[Analyzer] Should take Full changes.");
      return;
    }
    const uri = params.textDocument.uri;
    const oldDoc = this.documents[uri];

    const newContent = lastEvent.text;
    this.trees[uri] = this.parser.parse(newContent);
    const newDoc = TextDocument.create(oldDoc.uri, oldDoc.languageId, oldDoc.version, newContent);
    this.documents[uri] = newDoc;
  }


  public open(params: DidOpenTextDocumentParams): void {
    const td = params.textDocument;
    const uri = td.uri;
    const tree = this.parser.parse(td.text);
    const doc = TextDocument.create(td.uri, td.languageId, td.version, td.text);
    this.trees[uri] = tree;
    this.documents[uri] = doc;
  }


  public close(params: DidCloseTextDocumentParams): void {
    const uri = params.textDocument.uri;
    console.log(`[Analyzer] removing a parse tree: ${uri}`);
    if (!(uri in this.trees)) {
      console.error(`[Analyzer] ${uri} is absent in this.trees`);
    }
    if (!(uri in this.documents)) {
      console.error(`[Analyzer] ${uri} is absent in this.documents`);
    }

    delete this.trees[uri];
    delete this.documents[uri];
  }


  // Completion provider
  public async provideCompletion(params: CompletionParams): Promise<CompletionItem[]> {
    const uri = params.textDocument.uri;
    const document = this.documents[uri];
    const position = params.position;

    if (!this.parser) {
      console.error("[Completion] Parser is unavailable!");
      return Promise.reject("Parser unavailable!");
    }
    if (!this.trees[uri]) {
      console.log("[Completion] Create tree due to cache absence.");
      this.trees[uri] = this.parser.parse(document.getText());
    }
    const tree = this.trees[uri];
    const commandList = this.fetcher.getNames();
    let compCommands: CompletionItem[] = [];
    if (!!commandList) {
      compCommands = commandList.map((s) => CompletionItem.create(s));
    }

    // this is an ugly hack to get current Node
    const p = walkbackIfNeeded(document, tree.rootNode, position);
    const dropLast = (p === position);
    console.info(`[Completion] position = (${position.line}, ${position.character})`);
    console.info(`[Completion] p = (${p.line}, ${p.character})`);

    try {
      let cmdSeq = await this.getContextCmdSeq(tree.rootNode, p, dropLast);
      if (!!cmdSeq && cmdSeq.length) {
        const deepestCmd = cmdSeq[cmdSeq.length - 1];
        const compSubcommands = getCompletionsSubcommands(deepestCmd);
        const compOptions = getCompletionsOptions(document, tree.rootNode, p, cmdSeq, dropLast);
        return [
          ...compSubcommands,
          ...compOptions,
        ];
      } else {
        throw new Error("unknown command");
      }
    } catch (e) {
      const currentWord = getCurrentNode(tree.rootNode, position).text;
      console.info(`[Completion] currentWord = ${currentWord}`);
      if (!!compCommands && p === position && currentWord.length >= 3) {
        console.info("[Completion] Only command completion is available (2)");
        return compCommands;
      }
      console.warn("[Completion] No completion item is available (1)", e);
      return Promise.reject("Error: No completion item is available");
    }
  }


  // Hover provider
  public async provideHover(params: HoverParams): Promise<Hover> {
    const uri = params.textDocument.uri;
    const document = this.documents[uri];
    const position = params.position;
    if (!this.parser) {
      console.error("[Hover] Parser is unavailable!");
      return Promise.reject("Parser is unavailable!");
    }

    if (!this.trees[uri]) {
      console.log("[Hover] Creating tree");
      this.trees[uri] = this.parser.parse(document.getText());
    }
    const tree = this.trees[uri];

    const currentWord = getCurrentNode(tree.rootNode, position).text;
    try {
      const cmdSeq = await this.getContextCmdSeq(tree.rootNode, position);
      if (!!cmdSeq && cmdSeq.length) {
        const name = cmdSeq[0].name;
        if (currentWord === name) {
          const thisCmd = cmdSeq.find((cmd) => cmd.name === currentWord)!;
          const tldrText = (!!thisCmd.tldr) ? "\n" + formatTldr(thisCmd.tldr) : "";
          const msg = `\`${name}\`` + tldrText;
          // msg.isTrusted = true;      // [FIXME] Need this property in LSP
          return asHover(msg);

        } else if (cmdSeq.length > 1 && cmdSeq.some((cmd) => cmd.name === currentWord)) {
          const thatCmd = cmdSeq.find((cmd) => cmd.name === currentWord)!;
          const nameSeq: string[] = [];
          for (const cmd of cmdSeq) {
            if (cmd.name !== currentWord) {
              nameSeq.push(cmd.name);
            } else {
              break;
            }
          }
          const cmdPrefixName = nameSeq.join(" ");
          const msg = `${cmdPrefixName} **${thatCmd.name}**\n\n ${thatCmd.description}`;
          return asHover(msg);

        } else if (cmdSeq.length) {
          const opts = getMatchingOption(currentWord, cmdSeq);
          const msg = optsToMessage(opts);
          return asHover(msg);
        } else {
          return Promise.reject(`No hover is available for ${currentWord}`);
        }
      } else {
        return Promise.reject(`[Hover] No command found.`);
      }
    } catch (e) {
      console.log("[Hover] Error: ", e);
      return Promise.reject("No hover is available");
    }
  }


  // Get command and subcommand inferred from the current position
  async getContextCmdSeq(root: SyntaxNode, position: Position, dropLast: boolean = false): Promise<Command[]> {

    let name = getContextCommandName(root, position);
    if (!name) {
      return Promise.reject("[getContextCmdSeq] Command name not found.");
    }

    try {
      let command = await this.fetcher.fetch(name);
      let seq: Command[] = [command];
      if (!!command) {
        const words = _getSubcommandCandidates(root, position);
        let found = true;
        while (found && !!command.subcommands && command.subcommands.length) {
          found = false;
          const subcommands = getSubcommandsWithAliases(command);
          for (const word of words) {
            for (const subcmd of subcommands) {
              if (subcmd.name === word) {
                command = subcmd;
                seq.push(command);
                found = true;
              }
            }
          }
        }
      }

      // drop the last entry
      if (dropLast && seq.length
        && getThisWord(root, position) === seq[seq.length - 1].name) {
        seq = seq.slice(0, -1);
        console.info(`[Completion] dropLast: ${seq.map(x => x.name)}`);
      }
      return seq;
    } catch (e) {
      console.error("[getContextCmdSeq] Error:", e);
      return Promise.reject("[getContextCmdSeq] unknown command!");
    }
  }
}

