const vscode = require("vscode");

class UserSnippetsTreeProvider {
  constructor(context, userSnippetsService) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.userSnippetsService = userSnippetsService;
    this.userSnippetsTreeItems = [];

    this.rebuild();
  }

  refresh() {
    this._onDidChangeTreeData.fire(null);
  }

  rebuild() {
    const snippetsPerNameTreeItems = [];

    let userSnippets = this.userSnippetsService.getUserSnippets();

    for (let name in userSnippets) {
      snippetsPerNameTreeItems.push(
        this.convertUserSnippetsToSnippetNameTreeItems(name, userSnippets[name])                                                                                             
      );
    }

    this.userSnippetsTreeItems = snippetsPerNameTreeItems;
  }

  getTreeItem(snippet) {
    return snippet;
  }

  getChildren(snippet) {
    if (snippet) {
      return snippet.getSnippetTreeItems();
    } else {
      return this.userSnippetsTreeItems;
    }
  }

  convertUserSnippetsToSnippetNameTreeItems(name, userSnippetsPerName) {
    const snippetNameTreeItem = new SnippetNameTreeItem(name, userSnippetsPerName, vscode.TreeItemCollapsibleState.Expanded)
    return snippetNameTreeItem;
  }
}

class SnippetNameTreeItem {
  constructor(name, userSnippetsPerName, collapsibleState) {
    this.label = name;
    this.userSnippetsPerName = userSnippetsPerName;
    this.collapsibleState = collapsibleState;
    this.snippetTreeItems = [];
    this.contextValue = "snippetName";

    this.command = {
      command: "frank.showSnippetsViewPerName",
      title: "Show Snippets",
      arguments: [name]
    };

    this.convertSnippetToSnippetTreeItems();
  }

  convertSnippetToSnippetTreeItems() {
    const arr = [];

    this.userSnippetsPerName.forEach((snippet, index) => {
      arr.push(new SnippetTreeItem(snippet.prefix, this.label, index));
    });

    this.snippetTreeItems = arr;
  }

  getSnippetTreeItems() {
    return this.snippetTreeItems;
  }
}

class SnippetTreeItem extends vscode.TreeItem {
  constructor(prefix, name, index) {
    super(prefix);
    this.id = `${name}:${prefix}:${index}`;
    this.prefix = prefix;
    this.name = name;
    this.index = index;

    this.contextValue = "snippetTreeItem";
  }
}

module.exports = {
  UserSnippetsTreeProvider
};