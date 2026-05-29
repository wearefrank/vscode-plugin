import * as vscode from 'vscode';
import SnippetsService, { Snippet, UserSnippets } from './snippets-service';

class SnippetsTreeProvider {
  _onDidChangeTreeData: vscode.EventEmitter<null>;
  onDidChangeTreeData: vscode.Event<null>;
  userSnippetsService: SnippetsService;
  userSnippetsTreeItems: SnippetTreeItem[];
  rootTreeItem: RootTreeItem | null;
  rootTreeItems: RootTreeItem[] = [];

  constructor(userSnippetsService: SnippetsService) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    this.userSnippetsService = userSnippetsService;
    this.userSnippetsTreeItems = [];
    this.rootTreeItem = null;

    this.rebuild();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  rebuild(): void {
    const userCategories: CategoryTreeItem[] = [];
    const frameworkCategories: CategoryTreeItem[] = [];

    const userSnippets: UserSnippets = this.userSnippetsService.getUserSnippets();
    const frameworkSnippets: UserSnippets = this.userSnippetsService.getFrameworkSnippets();

    for (const category in userSnippets) {
      userCategories.push(
        this.convertUserSnippetToCategoryTreeItem(category, "user", userSnippets[category])
      );
    }

    for (const category in frameworkSnippets) {
      if (frameworkSnippets[category].length <= 0) continue;

      frameworkCategories.push(
        this.convertFrameworkSnippetToCategoryTreeItem(category, "framework", frameworkSnippets[category])
      );
    }

    this.rootTreeItems = [
      new RootTreeItem("User Snippets", userCategories, "userSnippetsRoot"),
      new RootTreeItem("Framework Snippets", frameworkCategories, "frameworkSnippetsRoot")
    ];
  }

  getTreeItem(treeItem: RootTreeItem | CategoryTreeItem | SnippetTreeItem): vscode.TreeItem {
    return treeItem;
  }

  getChildren(treeItem?: RootTreeItem | CategoryTreeItem | SnippetTreeItem): (RootTreeItem | CategoryTreeItem | SnippetTreeItem)[] {
    if (!treeItem) {
      return this.rootTreeItems;
    }

    if (treeItem instanceof RootTreeItem) {
      return treeItem.getCategoryTreeItems();
    }

    if (treeItem instanceof CategoryTreeItem) {
      return treeItem.getSnippetTreeItems();
    }

    return [];
  }

  convertUserSnippetToCategoryTreeItem(category: string, root: string, snippets: Snippet[]): CategoryTreeItem {
    return new CategoryTreeItem(category, root, snippets, vscode.TreeItemCollapsibleState.Expanded);
  }

  convertFrameworkSnippetToCategoryTreeItem(category: string, root: string, snippets: Snippet[]): CategoryTreeItem {
    return new CategoryTreeItem(category, root, snippets, vscode.TreeItemCollapsibleState.Collapsed);
  }
}

class RootTreeItem extends vscode.TreeItem {
  categoryTreeItems: CategoryTreeItem[];

  constructor(label: string, categoryTreeItems: CategoryTreeItem[], contextValue?: string) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.categoryTreeItems = categoryTreeItems;
    this.contextValue = contextValue ?? "snippetsRoot";
  }

  getCategoryTreeItems(): CategoryTreeItem[] {
    return this.categoryTreeItems;
  }
}

class CategoryTreeItem extends vscode.TreeItem {
  snippetsPerCategory: Snippet[];
  snippetTreeItems: SnippetTreeItem[];
  root: string;

  constructor(category: string, root: string, snippetsPerCategory: Snippet[], collapsibleState: vscode.TreeItemCollapsibleState) {
    super(category, collapsibleState);
    this.snippetsPerCategory = snippetsPerCategory;
    this.snippetTreeItems = [];
    this.root = root;
    this.contextValue = `categoryTreeItem-${root}`;

    if (this.root === "user") {
      this.command = {
        command: "frank.showUserSnippetsViewPerCategory",
        title: "Show Snippets",
        arguments: [category]
      };
    }

    this.convertSnippetsToSnippetTreeItems();
  }

  convertSnippetsToSnippetTreeItems(): void {
    this.snippetTreeItems = this.snippetsPerCategory.map((snippet, index) =>
      new SnippetTreeItem(snippet.prefix, snippet.body, this.root, this.label as string, index)
    );
  }

  getSnippetTreeItems(): SnippetTreeItem[] {
    return this.snippetTreeItems;
  }
}

class SnippetTreeItem extends vscode.TreeItem {
  prefix: string;
  category: string;
  index: number;
  root: string;
  body: string;

  constructor(prefix: string, body: string, root: string, category: string, index: number) {
    super(`${prefix}`);
    this.id = `${category}:${index}:${prefix}`;
    this.prefix = prefix;
    this.category = category;
    this.index = index;
    this.root = root;
    this.body = body;
    this.contextValue = `snippetTreeItem-${root}`;
    this.tooltip = body;
    this.description = String(index);

    this.command = {
      command: "frank.insertSnippet",
      title: "Insert Snippet",
      arguments: [this.body]
    };
  }
}

export { SnippetsTreeProvider, CategoryTreeItem, SnippetTreeItem };
