import * as vscode from 'vscode';
import SnippetsService from './snippets-service';
import { SnippetsTreeProvider, SnippetTreeItem, CategoryTreeItem } from './snippets-tree-provider';

class SnippetsDndController {
  context: vscode.ExtensionContext;
  snippetsTreeProvider: SnippetsTreeProvider;
  snippetsService: SnippetsService;
  dragMimeTypes: string[];
  dropMimeTypes: string[];

  constructor(context: vscode.ExtensionContext, snippetsTreeProvider: SnippetsTreeProvider, snippetsService: SnippetsService) {
    this.context = context;
    this.snippetsTreeProvider = snippetsTreeProvider;
    this.snippetsService = snippetsService;
    this.dragMimeTypes = ["application/vnd.code.tree.snippetsTreeview"];
    this.dropMimeTypes = ["application/vnd.code.tree.snippetsTreeview"];
  }

  async handleDrag(sourceItems: SnippetTreeItem[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
    const draggableItems = sourceItems.filter(
      (item) => item.contextValue === "snippetTreeItem-user"
    );

    const payload = draggableItems.map((item) => ({
      index: item.index,
      parent: item.category,
      contextValue: item.contextValue
    }));

    dataTransfer.set(
      "application/vnd.code.tree.snippetsTreeview",
      new vscode.DataTransferItem(JSON.stringify(payload))
    );
  }

  async handleDrop(target: CategoryTreeItem | undefined, dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
    const dataItem = dataTransfer.get("application/vnd.code.tree.snippetsTreeview");

    if (!dataItem) return;

    const payload: Array<{ index: number; parent: string; contextValue: string }> = JSON.parse(dataItem.value);

    if (target?.contextValue === "categoryTreeItem-user") {
      const targetParent = target.label as string;

      payload.forEach((snippetTreeItem) => {
        const userSnippets = this.snippetsService.getUserSnippets();

        const oldParent = snippetTreeItem.parent;
        const snippet = userSnippets[oldParent][snippetTreeItem.index];

        try {
          this.snippetsService.deleteUserSnippet(oldParent, snippetTreeItem.index);

          const updated = this.snippetsService.getUserSnippets();

          updated[targetParent].push(snippet);

          this.snippetsService.setUserSnippets(updated);
        } catch (err) {
          console.error(err);
        }
      });
    }

    this.snippetsTreeProvider.rebuild();
    this.snippetsTreeProvider.refresh();
  }

  dispose(): void {}
}

export { SnippetsDndController };
