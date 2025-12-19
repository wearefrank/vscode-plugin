const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function showSnippetsView(context, name, userSnippetsTreeProvider, userSnippetsService) {
    const panel = vscode.window.createWebviewPanel(
        'frankSnippets',
        'Frank! Snippets',
        vscode.ViewColumn.One,
        {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'resources')),
            vscode.Uri.file(path.join(context.extensionPath, 'src'))
        ]
    });

    const scriptPath = vscode.Uri.file(
        path.join(context.extensionPath, 'src/snippets', 'usersnippets-view-script.js')
    );
    const scriptUri = panel.webview.asWebviewUri(scriptPath);

    const cssPath = vscode.Uri.file(
        path.join(context.extensionPath, 'resources/css', 'usersnippets-view-webcontent.css')
    );
    const cssUri = panel.webview.asWebviewUri(cssPath);

    const codiconCss = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'resources/css', 'codicon.css')
    );

    const codiconFont = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'resources/css', 'codicon.ttf')
    );

    const safeUserSnippets = JSON.stringify(userSnippetsService.getUserSnippets()[name]);

    panel.webview.html = getWebviewContent(safeUserSnippets, name, scriptUri, cssUri, codiconCss, codiconFont);

    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'deleteSnippet':
                    deleteSnippet(context, name, message.snippetIndex, userSnippetsTreeProvider, userSnippetsService);
                    break;
                case 'editSnippet':
                    editSnippet(context, name, message.snippetIndex, message.snippet, userSnippetsService, userSnippetsTreeProvider);
                    break;
                case 'addSnippet':
                    addSnippet(context, name, message.snippet, userSnippetsService, userSnippetsTreeProvider);
                    break;
                case 'exportUserSnippets':
                    exportUserSnippets(context, message.name, userSnippetsService);
                    break;
                case 'changeNameOfUserSnippets':
                    changeNameOfUserSnippets(context, name, message.newName, userSnippetsService, userSnippetsTreeProvider);
                    break;
                case 'copySnippet':
                    copySnippet(message.snippet);
                    break;
                case 'showError':
                    showError();
                    break;
            }
        },
        null,
        context.subscriptions
    );
}

function deleteSnippet(context, name, snippetIndex, userSnippetsTreeProvider, userSnippetsService) {
    userSnippetsService.deleteUserSnippet(name, snippetIndex);

    userSnippetsTreeProvider.rebuild();
    userSnippetsTreeProvider.refresh();
}

function editSnippet(context, name, snippetIndex, snippet, userSnippetsService, userSnippetsTreeProvider) {
    try {
        const userSnippets = userSnippetsService.getUserSnippets();
        
        userSnippets[name][snippetIndex] = snippet;
        
        userSnippetsService.setUserSnippets(userSnippets);

        userSnippetsTreeProvider.rebuild();
        userSnippetsTreeProvider.refresh();
    } catch (err) {
        console.error(err);
    }
}

function addSnippet(context, name, snippet, userSnippetsService, userSnippetsTreeProvider) {
    const userSnippets = userSnippetsService.getUserSnippets();

    userSnippets[name].push(snippet);

    userSnippetsService.setUserSnippets(userSnippets);

    userSnippetsTreeProvider.rebuild();
    userSnippetsTreeProvider.refresh();
}

function exportUserSnippets(context, name, userSnippetsService) {
    userSnippetsService.uploadUserSnippet(name);
}

function changeNameOfUserSnippets(context, oldName, newName, userSnippetsService, userSnippetsTreeProvider) {
    userSnippetsService.changeNameOfUserSnippets(oldName, newName);

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

function getWebviewContent(safeUserSnippets, name, scriptUri, cssUri, codiconCss, codiconFont) {
    return `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link href="${codiconCss}" rel="stylesheet">

            <style>
            @font-face {
                font-family: 'codicon';
                src: url('${codiconFont}') format('truetype');
            }
            </style>

            <link rel="stylesheet" href="${cssUri}">
        </head>
        <body>
            <div id="snippetsContainer"></div>

            <script>const safeUserSnippets = ${safeUserSnippets}</script>
            <script>const name = "${name}"</script>
            <script src="${scriptUri}"></script>
        </body>
    </html>`;
}

module.exports = {
    showSnippetsView
};
