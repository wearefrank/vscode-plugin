import * as vscode from 'vscode';
import * as path from 'path';
import SnippetsService, { Snippet, SnippetsRefreshable } from './snippets-service';

function showSnippetsView(context: vscode.ExtensionContext, category: string, userSnippetsTreeProvider: SnippetsRefreshable, userSnippetsService: SnippetsService): void {
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

    const css = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
            context.extensionUri,
            'resources',
            'css',
            'usersnippets-view-webcontent.css'
        )
    );

    const codiconCss = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
            context.extensionUri,
            'resources',
            'css',
            'codicon.css'
        )
    );

    const script = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(
            context.extensionUri,
            'src',
            'snippets',
            'usersnippets-view-script.js'
        )
    );

    const safeUserSnippets = JSON.stringify(userSnippetsService.getUserSnippets()[category]);

    panel.webview.html = getWebviewContent(safeUserSnippets, category, script, css, codiconCss);

    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'deleteSnippet':
                    deleteSnippet(category, message.snippetIndex, userSnippetsTreeProvider, userSnippetsService);
                    break;
                case 'editSnippet':
                    editSnippet(category, message.snippetIndex, message.snippet, userSnippetsService, userSnippetsTreeProvider);
                    break;
                case 'addSnippet':
                    addSnippet(category, message.snippet, userSnippetsService, userSnippetsTreeProvider);
                    break;
                case 'exportUserSnippets':
                    exportUserSnippets(message.category, userSnippetsService);
                    break;
                case 'changeCategoryOfUserSnippets':
                    changeCategoryOfUserSnippets(category, message.category, userSnippetsService, userSnippetsTreeProvider);
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

function deleteSnippet(category: string, snippetIndex: number, provider: SnippetsRefreshable, userSnippetsService: SnippetsService): void {
    userSnippetsService.deleteUserSnippet(category, snippetIndex);

    provider.rebuild();
    provider.refresh();
}

function editSnippet(category: string, snippetIndex: number, snippet: Snippet, userSnippetsService: SnippetsService, provider: SnippetsRefreshable): void {
    try {
        const userSnippets = userSnippetsService.getUserSnippets();

        userSnippets[category][snippetIndex] = snippet;

        userSnippetsService.setUserSnippets(userSnippets);

        provider.rebuild();
        provider.refresh();
    } catch (err) {
        console.error(err);
    }
}

function addSnippet(category: string, snippet: Snippet, userSnippetsService: SnippetsService, provider: SnippetsRefreshable): void {
    const userSnippets = userSnippetsService.getUserSnippets();

    userSnippets[category].push(snippet);

    userSnippetsService.setUserSnippets(userSnippets);

    provider.rebuild();
    provider.refresh();
}

function exportUserSnippets(category: string, userSnippetsService: SnippetsService): void {
    void userSnippetsService.uploadUserSnippet(category);
}

function changeCategoryOfUserSnippets(oldCategory: string, category: string, userSnippetsService: SnippetsService, provider: SnippetsRefreshable): void {
    userSnippetsService.changeCategoryOfUserSnippets(oldCategory, category);

    provider.rebuild();
    provider.refresh();
}

function copySnippet(snippet: string): void {
    vscode.env.clipboard.writeText(snippet);
    vscode.window.showInformationMessage("Copied snippet to clipboard!");
}

function showError(): void {
    vscode.window.showErrorMessage("Error");
}

function getWebviewContent(safeUserSnippets: string, category: string, script: vscode.Uri, css: vscode.Uri, codiconCss: vscode.Uri): string {
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

export { showSnippetsView };
