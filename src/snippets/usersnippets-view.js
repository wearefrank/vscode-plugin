"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showSnippetsView = showSnippetsView;
const vscode = require("vscode");
const path = require("path");
function showSnippetsView(context, category, userSnippetsTreeProvider, userSnippetsService) {
    const panel = vscode.window.createWebviewPanel('frankSnippets', 'Frank! Snippets', vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'resources')),
            vscode.Uri.file(path.join(context.extensionPath, 'src'))
        ]
    });
    const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'css', 'usersnippets-view-webcontent.css'));
    const codiconCss = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'css', 'codicon.css'));
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'src', 'snippets', 'usersnippets-view-script.js'));
    const safeUserSnippets = JSON.stringify(userSnippetsService.getUserSnippets()[category]);
    panel.webview.html = getWebviewContent(safeUserSnippets, category, script, css, codiconCss);
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'deleteSnippet':
                deleteSnippet(context, category, message.snippetIndex, userSnippetsTreeProvider, userSnippetsService);
                break;
            case 'editSnippet':
                editSnippet(context, category, message.snippetIndex, message.snippet, userSnippetsService, userSnippetsTreeProvider);
                break;
            case 'addSnippet':
                addSnippet(context, category, message.snippet, userSnippetsService, userSnippetsTreeProvider);
                break;
            case 'exportUserSnippets':
                exportUserSnippets(context, message.category, userSnippetsService);
                break;
            case 'changeCategoryOfUserSnippets':
                changeCategoryOfUserSnippets(context, category, message.category, userSnippetsService, userSnippetsTreeProvider);
                break;
            case 'copySnippet':
                copySnippet(message.snippet);
                break;
            case 'showError':
                showError();
                break;
        }
    }, null, context.subscriptions);
}
function deleteSnippet(context, category, snippetIndex, userSnippetsTreeProvider, userSnippetsService) {
    userSnippetsService.deleteUserSnippet(category, snippetIndex);
    userSnippetsTreeProvider.rebuild();
    userSnippetsTreeProvider.refresh();
}
function editSnippet(context, category, snippetIndex, snippet, userSnippetsService, userSnippetsTreeProvider) {
    try {
        const userSnippets = userSnippetsService.getUserSnippets();
        userSnippets[category][snippetIndex] = snippet;
        userSnippetsService.setUserSnippets(userSnippets);
        userSnippetsTreeProvider.rebuild();
        userSnippetsTreeProvider.refresh();
    }
    catch (err) {
        console.error(err);
    }
}
function addSnippet(context, category, snippet, userSnippetsService, userSnippetsTreeProvider) {
    const userSnippets = userSnippetsService.getUserSnippets();
    userSnippets[category].push(snippet);
    userSnippetsService.setUserSnippets(userSnippets);
    userSnippetsTreeProvider.rebuild();
    userSnippetsTreeProvider.refresh();
}
function exportUserSnippets(context, category, userSnippetsService) {
    userSnippetsService.uploadUserSnippet(category);
}
function changeCategoryOfUserSnippets(context, oldCategory, category, userSnippetsService, userSnippetsTreeProvider) {
    userSnippetsService.changeCategoryOfUserSnippets(oldCategory, category);
    userSnippetsTreeProvider.rebuild();
    userSnippetsTreeProvider.refresh();
}
function copySnippet(snippet) {
    vscode.env.clipboard.writeText(snippet);
    vscode.window.showInformationMessage("Copied snippet to clipboard!");
}
function showError() {
    vscode.window.showErrorMessage("Error");
}
function getWebviewContent(safeUserSnippets, category, script, css, codiconCss) {
    return `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="${codiconCss}">
            <link rel="stylesheet" href="${css}">
        </head>
        <body>
            <div id="snippetsContainer"></div>

            <script>const safeUserSnippets = ${safeUserSnippets}</script>
            <script>const category = "${category}"</script>
            <script src="${script}"></script>
        </body>
    </html>`;
}
//# sourceMappingURL=usersnippets-view.js.map