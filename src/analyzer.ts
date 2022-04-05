import Parser from 'web-tree-sitter';


export function getCurrentNode(n: Parser.SyntaxNode, position: vscode.Position): Parser.SyntaxNode {
  if (!(range(n).contains(position))) {
    console.error("Out of range!");
  }
  for (const child of n.children) {
    const r = range(child);
    if (r.contains(position)) {
      return getCurrentNode(child, position);
    }
  }
  return n;
}

// helper of getCurrentNode
function range(n: Parser.SyntaxNode): vscode.Range {
  return new vscode.Range(
    n.startPosition.row,
    n.startPosition.column,
    n.endPosition.row,
    n.endPosition.column,
  );
}




// export class Analyzer {
//    private fetcher: CachingFetcher;

//    constructor(fetcher)

// }

// function ()