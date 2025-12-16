const vscode = require("vscode");

class UserSnippetsDndController {
  constructor(context, userSnippetsTreeProvider, userSnippetsService) {
    this.context = context;
    this.userSnippetsTreeProvider = userSnippetsTreeProvider;
    this.userSnippetsService = userSnippetsService;
    this.dragMimeTypes = ["application/vnd.code.tree.userSnippetsTreeview"];
    this.dropMimeTypes = ["application/vnd.code.tree.userSnippetsTreeview"];
  }

  async handleDrag(sourceItems, dataTransfer, token) {
    const payload = sourceItems.map(item => ({
      index: item.index,
      parent: item.name
    }));

    dataTransfer.set(
      "application/vnd.code.tree.userSnippetsTreeview",
      new vscode.DataTransferItem(JSON.stringify(payload))
    );
  }

  async handleDrop(target, dataTransfer, token) {
    const dataItem = dataTransfer.get("application/vnd.code.tree.userSnippetsTreeview");
    
    const payload = JSON.parse(dataItem.value); 

    if (target?.contextValue === "snippetName") {
      let targetParent = target.label;

      payload.forEach(snippetTreeItem =>  {
        let userSnippets = this.userSnippetsService.getUserSnippets();

        let oldParent = snippetTreeItem.parent;
        let snippet = userSnippets[oldParent][snippetTreeItem.index];

        try {
          this.userSnippetsService.deleteUserSnippet(oldParent, snippetTreeItem.index);

          userSnippets = this.userSnippetsService.getUserSnippets();
        
          userSnippets[targetParent].push(snippet);

          this.userSnippetsService.setUserSnippets(userSnippets);
        } catch (err) {
            console.error(err);
        }
      });
    }

    this.userSnippetsTreeProvider.rebuild();
    this.userSnippetsTreeProvider.refresh();
  }

  dispose() {}
}

module.exports = {
  UserSnippetsDndController
};