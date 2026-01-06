const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const StartService = require("./start-service.js");
const UserSnippetsService = require("./snippets/usersnippets-service.js");
const { showSnippetsView } = require('./snippets/usersnippets-view.js');
const FlowWebViewProvider = require('./flow/flow-view-provider.js');
const { UserSnippetsTreeProvider } = require("./snippets/usersnippets-tree-provider.js");
const { UserSnippetsDndController } = require("./snippets/usersnippets-dnd-controller.js")
const SaxonJS = require('saxon-js');

/**
 * @param {vscode.ExtensionContext} context
*/

let targets = null;
let projectName = "skeleton";

function activate(context) {
	const userSnippetsService = new UserSnippetsService(context);
	const userSnippetsTreeProvider = new UserSnippetsTreeProvider(context, userSnippetsService);
	const userSnippetsDndController = new UserSnippetsDndController(context, userSnippetsTreeProvider, userSnippetsService);
	const startService = new StartService(context);

	userSnippetsService.ensureSnippetsFilesExists();
	userSnippetsService.loadFrankFrameworkSnippets();

	const flowWebViewProvider = new FlowWebViewProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('flowWebView', flowWebViewProvider)
	);

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.languageId === "xml") {
			flowWebViewProvider.updateWebview();
		}
	});

	vscode.workspace.onDidSaveTextDocument((document) => {
		if (document.languageId === "xml") {
			flowWebViewProvider.updateWebview();
		}
	});

	vscode.window.createTreeView("userSnippetsTreeview", {
		treeDataProvider: userSnippetsTreeProvider,
		dragAndDropController: userSnippetsDndController
	});

	vscode.commands.registerCommand('frank.addNameOfUserSnippets', (name) => {
		userSnippetsService.addNameOfUserSnippets(userSnippetsTreeProvider);
	})

	vscode.commands.registerCommand('frank.showSnippetsViewPerName', (name) => {
		showSnippetsView(context, name, userSnippetsTreeProvider, userSnippetsService);
	})

	vscode.commands.registerCommand("frank.editUserSnippet", (item) => {
		showSnippetsView(context, item.name, userSnippetsTreeProvider, userSnippetsService);
	});

	vscode.commands.registerCommand("frank.deleteUserSnippet", (item) => {
		const userSnippets = userSnippetsService.deleteUserSnippet(item.name, item.index);

		userSnippetsTreeProvider.rebuild();
		userSnippetsTreeProvider.refresh();
	});

	vscode.commands.registerCommand("frank.exportUserSnippets", (item) => {
		userSnippetsService.uploadUserSnippet(item.name, item.index);
	});

	vscode.commands.registerCommand("frank.deleteAllUserSnippetByName", (item) => {
		const userSnippets = userSnippetsService.deleteAllUserSnippetByName(item.label);

		userSnippetsTreeProvider.rebuild();
		userSnippetsTreeProvider.refresh();
	});

	vscode.commands.registerCommand("frank.changeName", (item) => {
		const userSnippets = userSnippetsService.changeName(item.label, "AAA");

		userSnippetsTreeProvider.rebuild();
		userSnippetsTreeProvider.refresh();
	});

	vscode.commands.registerCommand('frank.createNewFrank', async function () {
        const name = await vscode.window.showInputBox({
            placeHolder: 'Give your project a name',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Name cannot be empty';
                }
                return null;
            }
        });

        if (!name) {
            return;
        }

        projectName = name.trim();

        const term = vscode.window.createTerminal('cmd');
        term.show();

		const workspaceFolders = vscode.workspace.workspaceFolders;

		const rootPath = workspaceFolders[0].uri.fsPath;
		const targetPath = path.join(rootPath, "frank-runner");

		if (!fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
			term.sendText('git clone https://github.com/wearefrank/frank-runner.git');
		}
        
        term.sendText(`git clone https://github.com/wearefrank/skeleton.git ${projectName}`);
        term.sendText(`Remove-Item -Path "${projectName}/.git" -Recurse -Force`);
    });

	vscode.commands.registerCommand('frank.startAnt', async function () {
		startService.startWithAnt();
	});

	vscode.commands.registerCommand('frank.startDocker', async function () {
		startService.startWithDocker();
	});

	vscode.commands.registerCommand('frank.startDockerCompose', async function () {
		startService.startWithDockerCompose();
	});

	vscode.commands.registerCommand('frank.createNewAdapter', async function () {
		let name = await vscode.window.showQuickPick(
			["Adapter 1", "Adapter 2", "Adapter 3", "Adapter 4"]
		);
		const editor = vscode.window.activeTextEditor;
		await editor.edit(editBuilder => {
        	editBuilder.insert(editor.selection.active, name);
    	});
	})

	vscode.commands.registerCommand('frank.addUserSnippet', async function () {
		await userSnippetsService.addUserSnippet(userSnippetsTreeProvider);

		vscode.window.showInformationMessage("Snippet added!");
	});

	vscode.languages.registerDocumentLinkProvider({ language: 'xml', scheme: 'file' }, {
		provideDocumentLinks(document, token) {
			const links = [];
			const text = document.getText();
			const regex = /\w+/g;
			let match;

			const filePath = context.asAbsolutePath('./resources/components.json');
			const data = fs.readFileSync(filePath, 'utf8');
			targets = JSON.parse(data);

			while ((match = regex.exec(text)) !== null) {
				for (const i in targets) {
					for (const j in targets[i]) {
						if (targets[i][j].includes(match[0])) {
							const start = document.positionAt(match.index);
							const end = document.positionAt(match.index + match[0].length);
							links.push(new vscode.DocumentLink(new vscode.Range(start, end), vscode.Uri.parse(`https://frankdoc.frankframework.org/#/${i}/${j}/${match[0]}`)));
						}
					}
				}
			}

			return links;
		}
	});
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
