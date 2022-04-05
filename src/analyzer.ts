import Parser from 'web-tree-sitter';
import { SyntaxNode } from 'web-tree-sitter';
import LSP from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CommandFetcher } from './commandFetcher';
import { contains, asRange, translate, lineAt } from './utils';
import { Command, Option } from './command';


export function getCurrentNode(n: Parser.SyntaxNode, position: LSP.Position): Parser.SyntaxNode {
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


// --------------- For Hovers and Completions ----------------------

// Find the deepest node that contains the position in its range.


// Moves the position left by one character IF position is contained only in the root-node range.
// This is just a workround as you cannot reach command node if you start from
// the position, say, after 'echo '
// [FIXME] Do not rely on such an ugly hack
export function walkbackIfNeeded(document: TextDocument, root: SyntaxNode, position: LSP.Position): LSP.Position {
  const thisNode = getCurrentNode(root, position);
  console.debug("[walkbackIfNeeded] thisNode.type: ", thisNode.type);
  if (position.character > 0 && thisNode.type !== 'word') {
    console.info("[walkbackIfNeeded] stepping back!");
    return walkbackIfNeeded(document, root, translate(position, 0, -1));
  } else if (thisNode.type !== 'word' && position.character === 0 && position.line > 0) {
    const prevLineIndex = position.line - 1;
    const prevLine = lineAt(document, prevLineIndex);
    if (prevLine.trimEnd().endsWith('\\')) {
      const charIndex = prevLine.trimEnd().length - 1;
      return walkbackIfNeeded(document, root, LSP.Position.create(prevLineIndex, charIndex));
    }
  }
  return position;
}


// Returns current word as an option if the tree-sitter says so
export function getMatchingOption(currentWord: string, name: string, cmdSeq: Command[]): Option[] {
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

function isNotOldStyle(name: string): boolean {
  return name.startsWith('--') || name.length === 2;
}

function isOldStyle(name: string): boolean {
  return !isNotOldStyle(name);
}

function unstackOption(name: string): string[] {
  const xs = name.substring(1).split('').map(c => c.padStart(2, '-'));
  return [...new Set(xs)];
}

// Get command node inferred from the current position
function _getContextCommandNode(root: SyntaxNode, position: LSP.Position): SyntaxNode | undefined {
  let currentNode = getCurrentNode(root, position);
  if (currentNode.parent?.type === 'command_name') {
    currentNode = currentNode.parent;
  }
  if (currentNode.parent?.type === 'command') {
    return currentNode.parent;
  }
}

// Get command name covering the position if exists
function getContextCommandName(root: SyntaxNode, position: LSP.Position): string | undefined {
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
function _getSubcommandCandidates(root: SyntaxNode, position: LSP.Position): string[] {
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


// Get command and subcommand inferred from the current position
export async function getContextCmdSeq(root: SyntaxNode, position: LSP.Position, fetcher: CommandFetcher): Promise<Command[]> {
  let name = getContextCommandName(root, position);
  if (!name) {
    return Promise.reject("[getContextCmdSeq] Command name not found.");
  }

  try {
    let command = await fetcher.fetch(name);
    const seq: Command[] = [command];
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
    return seq;
  } catch (e) {
    console.error("[getContextCmdSeq] Error: ", e);
    return Promise.reject("[getContextCmdSeq] unknown command!");
  }
}


// Get command arguments as string[]
function getContextCmdArgs(document: TextDocument, root: SyntaxNode, position: LSP.Position): string[] {
  const p = walkbackIfNeeded(document, root, position);
  let node = _getContextCommandNode(root, p)?.firstNamedChild;
  if (node?.text === 'sudo') {
    node = node.nextSibling;
  }
  const res: string[] = [];
  while (node?.nextSibling) {
    node = node.nextSibling;
    let text = node.text;
    // --option=arg
    if (text.startsWith('--') && text.includes('=')) {
      text = text.split('=', 2)[0];
    }
    res.push(text);
  }
  return res;
}


// Get subcommand completions
export function getCompletionsSubcommands(deepestCmd: Command): vscode.CompletionItem[] {
  const subcommands = getSubcommandsWithAliases(deepestCmd);
  if (subcommands && subcommands.length) {
    const compitems = subcommands.map((sub, idx) => {
      const item = createCompletionItem(sub.name, sub.description);
      item.sortText = `33-${idx.toString().padStart(4)}`;
      return item;
    });
    return compitems;
  }
  return [];
}


// Get option completion
export function getCompletionsOptions(document: TextDocument, root: SyntaxNode, position: LSP.Position, cmdSeq: Command[]): vscode.CompletionItem[] {
  const args = getContextCmdArgs(document, root, position);
  const compitems: vscode.CompletionItem[] = [];
  const options = getOptions(cmdSeq);
  options.forEach((opt, idx) => {
    // suppress already-used options
    if (opt.names.every(name => !args.includes(name))) {
      opt.names.forEach(name => {
        const item = createCompletionItem(name, opt.description);
        item.sortText = `55-${idx.toString().padStart(4)}`;
        if (opt.argument) {
          const snippet = `${name} \$\{1:${opt.argument}\}`;
          item.insertText = new vscode.SnippetString(snippet);
        }
        compitems.push(item);
      });
    }
  });
  return compitems;
}


function createCompletionItem(label: string, desc: string): vscode.CompletionItem {
  return new vscode.CompletionItem({ label: label, description: desc });
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


