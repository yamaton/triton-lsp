import * as fs from 'fs';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import type { SyntaxNode } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, TextEdit, CompletionItem, Hover, CompletionItemKind } from 'vscode-languageserver-types';
import {
  TextDocumentContentChangeEvent, DidChangeTextDocumentParams, DidOpenTextDocumentParams,
  DidCloseTextDocumentParams, CompletionParams, HoverParams
} from 'vscode-languageserver-protocol';
import type { Command, Option } from './types';
import CommandFetcher from './commandFetcher';
import { contains, asRange, translate, lineAt, asPoint, formatTldr, formatUsage, asHover, optsToMessage, isPrefixOf, isSubsequenceOf } from './utils';


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


// Moves the position backward (left or previous line)
// until the cursor reaches 'word' node.
//
// If a cursor starts from (0, 5) of the text "abc  ",
// walkbackIfNeeded() will return the position (0, 3)
// which is right after "abc".
//
function walkbackIfNeeded(document: TextDocument, root: SyntaxNode, position: Position): Position {
  const thisNode = getCurrentNode(root, position);
  console.info(`[walkbackIfNeeded] thisNode.type: ${thisNode.type}`);
  if (thisNode.type === ';') {
    console.info("[walkbackIfNeeded] stop at semicolon.");
    return position;
  }
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


// Check if the cursor is right after option-like string
function isRightAfterOptionLike(root: SyntaxNode, position: Position): boolean {
  const word = getCurrentNode(root, position).text;
  const res = word.startsWith('-');
  console.info(`[isRightAfterOptionLike] word: ${word}`);
  return res;
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
      const item = asCompletionItem(sub.name, sub.description, CompletionItemKind.Module);
      item.sortText = `33-${idx.toString().padStart(4)}`;
      return item;
    });
    return compitems;
  }
  return [];
}


// Get option completion
function getCompletionsOptions(document: TextDocument, root: SyntaxNode, position: Position, cmdSeq: Command[], dropLast: boolean = false): CompletionItem[] {
  const isCursorRightAfterWhitespace = !dropLast;
  if (!isCursorRightAfterWhitespace && !isRightAfterOptionLike(root, position)) {
    console.log("[Completion] no options provided because of surrounding characters");
    return [];
  }

  const args = getContextCmdArgs(document, root, position, dropLast);
  const compitems: CompletionItem[] = [];
  const options = getOptions(cmdSeq);
  options.forEach((opt, idx) => {
    // suppress already-used options
    if (opt.names.every(name => !args.includes(name))) {
      opt.names.forEach(name => {
        const item = asCompletionItem(name, opt.description, CompletionItemKind.Field);
        item.sortText = `55-${idx.toString().padStart(4)}`;
        if (opt.argument) {
          // [TODO] Select depending on CompletionClientCapabilities.snippetSupport
          // const snippet = `${name} \$\{1:${opt.argument}\}`;
          const snippet = `${name} \<${opt.argument}\>`;
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
function asCompletionItem(label: string, desc: string, kind: CompletionItemKind): CompletionItem {
  const compitem = CompletionItem.create(label);
  compitem.detail = desc;
  compitem.kind = kind;

  // [TODO] Requires support of LSP v3.17
  // compitem.labelDetails = { description: desc };
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

    console.log(`[Completion] document.getText(): ${document.getText()}`);
    console.log(`[Completion] given position: (${position.line}, ${position.character})`);

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
      compCommands = commandList.map((s) => {
        const item = CompletionItem.create(s);
        // [TODO] Add one-line command info as .detail
        item.kind = CompletionItemKind.Class;
        return item;
      });
    }

    // this is an ugly hack to get current Node
    const p = walkbackIfNeeded(document, tree.rootNode, position);
    console.log(`[Completion] after walkback: (${p.line}, ${p.character})`);
    const dropLast = (p === position);
    console.log(`[Completion] dropLast: ${dropLast}`);

    try {
      let cmdSeq = await this.getContextCmdSeq(tree.rootNode, p, dropLast);
      if (!!cmdSeq && cmdSeq.length) {
        const deepestCmd = cmdSeq[cmdSeq.length - 1];
        const compSubcommands = getCompletionsSubcommands(deepestCmd);
        const compOptions = getCompletionsOptions(document, tree.rootNode, p, cmdSeq, dropLast);
        let compItems = [
          ...compSubcommands,
          ...compOptions,
        ];

        // select subsequence-matched completion
        if (dropLast) {
          const token = getCurrentNode(tree.rootNode, position).text;
          compItems = compItems.filter(compItem => isSubsequenceOf(token, compItem.label));
        }
        return compItems;
      } else {
        throw new Error("unknown command");
      }
    } catch (e) {
      const currentToken = getCurrentNode(tree.rootNode, position).text;
      console.info(`[Completion] currentToken = ${currentToken}`);
      if (!!compCommands && p === position && currentToken.length >= 2) {
        console.info("[Completion] Only command completion is available (2)");

        // [TODO] Is fuzzy (subsequence) matching the better?
        return compCommands.filter(cmd => isPrefixOf(currentToken, cmd.label));
      }
      console.warn(`[Completion] No completion item is available (1) ${e}`);
      return Promise.reject("Error: No completion item is available");
    }
  }


  // Hover provider
  public async provideHover(params: HoverParams): Promise<Hover | null> {
    const uri = params.textDocument.uri;
    const document = this.documents[uri];
    const position = params.position;
    if (!this.parser) {
      console.error("[Hover] Parser is unavailable!");
      return null;
    }

    if (!this.trees[uri]) {
      console.log("[Hover] Creating tree");
      this.trees[uri] = this.parser.parse(document.getText());
    }
    const tree = this.trees[uri];

    const currentNode = getCurrentNode(tree.rootNode, position)
    const currentWord = currentNode.text;
    const currentRange = asRange(currentNode);
    try {
      const cmdSeq = await this.getContextCmdSeq(tree.rootNode, position);
      if (!!cmdSeq && cmdSeq.length) {
        const name = cmdSeq[0].name;
        if (currentWord === name) {
          // Display root-level command
          const thisCmd = cmdSeq.find((cmd) => cmd.name === currentWord)!;
          const usageText = formatUsage(thisCmd.usage);
          const tldrText = formatTldr(thisCmd.tldr);
          const msg = `\`${name}\`${usageText}${tldrText}`;
          // msg.isTrusted = true;      // [FIXME] Need this property in LSP
          return asHover(msg, currentRange);

        } else if (cmdSeq.length > 1 && cmdSeq.some((cmd) => cmd.name === currentWord)) {
          // Display a subcommand
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
          const usageText = formatUsage(thatCmd.usage);
          const msg = `${cmdPrefixName} **${thatCmd.name}**\n\n${thatCmd.description}${usageText}`;
          return asHover(msg, currentRange);

        } else if (cmdSeq.length) {
          // Display an option
          const opts = getMatchingOption(currentWord, cmdSeq);
          const msg = optsToMessage(opts);
          return asHover(msg, currentRange);
        } else {
          console.log(`No hover is available for ${currentWord}`);
          return null;
        }
      } else {
        console.log(`[Hover] No command found.`);
        return null;
      }
    } catch (e) {
      console.log(`[Hover] Error: ${e}`);
      return null;
    }
  }


  // Get command and subcommand inferred from the current position
  async getContextCmdSeq(root: SyntaxNode, position: Position, dropLast: boolean = false): Promise<Command[]> {

    let name = getContextCommandName(root, position);
    if (!name) {
      console.log("[getContextCmdSeq] Command name not found.");
      return [];
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
      console.error(`[getContextCmdSeq] unknown command: ${e}`);
      return [];
    }
  }
}

