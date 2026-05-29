"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnippetsDndController = void 0;
const vscode = require("vscode");
class SnippetsDndController {
    constructor(context, snippetsTreeProvider, snippetsService) {
        this.context = context;
        this.snippetsTreeProvider = snippetsTreeProvider;
        this.snippetsService = snippetsService;
        this.dragMimeTypes = ["application/vnd.code.tree.snippetsTreeview"];
        this.dropMimeTypes = ["application/vnd.code.tree.snippetsTreeview"];
    }
    async handleDrag(sourceItems, dataTransfer, _token) {
        const draggableItems = sourceItems.filter(item => item.contextValue === "snippetTreeItem-user");
        const payload = draggableItems.map(item => ({
            index: item.index,
            parent: item.category,
            contextValue: item.contextValue
        }));
        dataTransfer.set("application/vnd.code.tree.snippetsTreeview", new vscode.DataTransferItem(JSON.stringify(payload)));
    }
    async handleDrop(target, dataTransfer, _token) {
        const dataItem = dataTransfer.get("application/vnd.code.tree.snippetsTreeview");
        const payload = JSON.parse(dataItem.value);
        if (target?.contextValue === "categoryTreeItem-user") {
            let targetParent = target.label;
            payload.forEach(snippetTreeItem => {
                let userSnippets = this.snippetsService.getUserSnippets();
                let oldParent = snippetTreeItem.parent;
                let snippet = userSnippets[oldParent][snippetTreeItem.index];
                try {
                    this.snippetsService.deleteUserSnippet(oldParent, snippetTreeItem.index);
                    userSnippets = this.snippetsService.getUserSnippets();
                    userSnippets[targetParent].push(snippet);
                    this.snippetsService.setUserSnippets(userSnippets);
                }
                catch (err) {
                    console.error(err);
                }
            });
        }
        this.snippetsTreeProvider.rebuild();
        this.snippetsTreeProvider.refresh();
    }
    dispose() { }
}
exports.SnippetsDndController = SnippetsDndController;
//# sourceMappingURL=snippets-dnd-controller.js.map