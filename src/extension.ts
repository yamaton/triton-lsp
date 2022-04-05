import Parser from 'web-tree-sitter';
import { SyntaxNode } from 'web-tree-sitter';
import { CommandFetcher } from './commandFetcher';
import { Option, Command } from './command';
import { getCurrentNode, getMatchingOption, getContextCmdSeq, getCompletionsSubcommands, getCompletionsOptions, walkbackIfNeeded } from './analyzer';
import LSP from 'vscode-languageserver';
import * as utils from './utils';


async function initializeParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser();
  const path = `${__dirname}/../tree-sitter-bash.wasm`;
  const lang = await Parser.Language.load(path);
  parser.setLanguage(lang);
  return parser;
}

export async function activate(context: vscode.ExtensionContext) {
  const parser = await initializeParser();
  const trees: { [uri: string]: Parser.Tree } = {};
  const fetcher = new CommandFetcher();
  try {
    await fetcher.fetchAllCurated("general");
  } catch {
    console.warn("Failed in fetch.fetchAllCurated().");
  }


  const compprovider = vscode.languages.registerCompletionItemProvider(
    'shellscript',
    {
      async provideCompletionItems(document, position, token, context) {
        if (!parser) {
          console.error("[Completion] Parser is unavailable!");
          return Promise.reject("Parser unavailable!");
        }
        if (!trees[document.uri.toString()]) {
          console.log("[Completion] Creating tree");
          trees[document.uri.toString()] = parser.parse(document.getText());
        }
        const tree = trees[document.uri.toString()];
        const commandList = fetcher.getNames();
        let compCommands: vscode.CompletionItem[] = [];
        if (!!commandList) {
          compCommands = commandList.map((s) => new vscode.CompletionItem(s));
        }

        // this is an ugly hack to get current Node
        const p = walkbackIfNeeded(document, tree.rootNode, position);

        try {
          const cmdSeq = await getContextCmdSeq(tree.rootNode, p, fetcher);
          if (!!cmdSeq && cmdSeq.length) {
            const deepestCmd = cmdSeq[cmdSeq.length - 1];
            const compSubcommands = getCompletionsSubcommands(deepestCmd);
            const compOptions = getCompletionsOptions(document, tree.rootNode, p, cmdSeq);
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
    },
    ' ',  // triggerCharacter
  );

  const hoverprovider = vscode.languages.registerHoverProvider('shellscript', {
    async provideHover(document, position, token) {

      if (!parser) {
        console.error("[Hover] Parser is unavailable!");
        return Promise.reject("Parser is unavailable!");
      }

      if (!trees[document.uri.toString()]) {
        console.log("[Hover] Creating tree");
        trees[document.uri.toString()] = parser.parse(document.getText());
      }
      const tree = trees[document.uri.toString()];

      const currentWord = getCurrentNode(tree.rootNode, position).text;
      try {
        const cmdSeq = await getContextCmdSeq(tree.rootNode, position, fetcher);
        if (!!cmdSeq && cmdSeq.length) {
          const name = cmdSeq[0].name;
          if (currentWord === name) {
            const clearCacheCommandUri = vscode.Uri.parse(`command:h2o.clearCache?${encodeURIComponent(JSON.stringify(name))}`);
            const thisCmd = cmdSeq.find((cmd) => cmd.name === currentWord)!;
            const tldrText = (!!thisCmd.tldr) ? "\n" + utils.formatTldr(thisCmd.tldr) : "";
            const msg = new vscode.MarkdownString(`\`${name}\`` + tldrText + `\n\n[Reset](${clearCacheCommandUri})`);
            msg.isTrusted = true;
            return new vscode.Hover(msg);
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
            return new vscode.Hover(new vscode.MarkdownString(msg));
          } else if (cmdSeq.length) {
            const opts = getMatchingOption(currentWord, name, cmdSeq);
            const msg = utils.optsToMessage(opts);
            return new vscode.Hover(new vscode.MarkdownString(msg));
          } else {
            return Promise.reject(`No hover is available for ${currentWord}`);
          }
        }
      } catch (e) {
        console.log("[Hover] Error: ", e);
        return Promise.reject("No hover is available");
      }
    }
  });

  function updateTree(p: Parser, edit: vscode.TextDocumentChangeEvent): void {
    if (edit.contentChanges.length === 0) { return; }

    const old = trees[edit.document.uri.toString()];
    for (const e of edit.contentChanges) {
      const startIndex = e.rangeOffset;
      const oldEndIndex = e.rangeOffset + e.rangeLength;
      const newEndIndex = e.rangeOffset + e.text.length;
      const indices = [startIndex, oldEndIndex, newEndIndex];
      const [startPosition, oldEndPosition, newEndPosition] = indices.map(i => utils.asPoint(edit.document.positionAt(i)));
      const delta = { startIndex, oldEndIndex, newEndIndex, startPosition, oldEndPosition, newEndPosition };
      old.edit(delta);
    }
    const t = p.parse(edit.document.getText(), old);
    trees[edit.document.uri.toString()] = t;
  }

  function edit(editEvent: vscode.TextDocumentChangeEvent) {
    updateTree(parser, editEvent);
  }

  function close(document: vscode.TextDocument) {
    console.log("[Close] removing a tree");
    delete trees[document.uri.toString()];
  }

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(edit));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(close));
  context.subscriptions.push(compprovider);
  context.subscriptions.push(hoverprovider);

}


export function deactivate() { }
