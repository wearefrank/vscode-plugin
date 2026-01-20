const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const SaxonJS = require('saxon-js');

const StartService = require("./start/start-service.js");
const UserSnippetsService = require("./snippets/usersnippets-service.js");
const { showSnippetsView } = require('./snippets/usersnippets-view.js');
const FlowViewProvider = require('./flow/flow-view-provider.js');
const { UserSnippetsTreeProvider } = require("./snippets/usersnippets-tree-provider.js");
const { UserSnippetsDndController } = require("./snippets/usersnippets-dnd-controller.js")
const { StartTreeProvider } = require("./start/start-tree-provider.js");

/**
 * @param {vscode.ExtensionContext} context
*/

let targets = null;
let projectNameTrimmed = "skeleton";

function activate(context) {
	const userSnippetsService = new UserSnippetsService(context);
	const userSnippetsTreeProvider = new UserSnippetsTreeProvider(context, userSnippetsService);
	const userSnippetsDndController = new UserSnippetsDndController(context, userSnippetsTreeProvider, userSnippetsService);
	const startService = new StartService(context);
	const startTreeProvider = new StartTreeProvider(context, startService);

	vscode.commands.registerCommand('frank.createNewFrank', async function () {
        const projectName = await vscode.window.showInputBox({
            placeHolder: 'Give your project a projectName',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Name cannot be empty';
                }
                return null;
            }
        });

        if (!projectName) {
            return;
        }

        projectNameTrimmed = projectName.trim();

		const workspaceFolders = vscode.workspace.workspaceFolders;
		const rootPath = workspaceFolders[0].uri.fsPath;

		if (!fs.existsSync(path.join(rootPath, "frank-runner"))) {
			await execAsync(
				'git clone https://github.com/wearefrank/frank-runner.git',
				rootPath
			);
		}

        await execAsync(
            `git clone https://github.com/wearefrank/skeleton.git ${projectName}`,
            rootPath
        );

		const skeletonrcJSONPath = path.join(rootPath, projectName, "skeletonrc.json");

		let skeletonrcJSON = JSON.parse(fs.readFileSync(skeletonrcJSONPath, 'utf8'));

		const mappings = {
			"{{ cookiecutter.instance_name }}": projectName.toLowerCase(),
			"{{ cookiecutter.instance_name_lc }}": projectName.toLowerCase(),
			"{{ cookiecutter.configuration_name }}": projectName.toLowerCase()
    	};

		skeletonrcJSON.mappings = mappings;

		fs.writeFileSync(skeletonrcJSONPath, JSON.stringify(skeletonrcJSON, null, 2));
    
		await execAsync(
            `powershell -Command "Remove-Item -Path '.git' -Recurse -Force"`,
  			path.join(rootPath, projectName)
        );

		await execAsync(
            `powershell -Command "node ./skeleton.js"`,
  			path.join(rootPath, projectName)
        );
	});

	async function startHandler(item) {
		switch (item.method) {
			case "ant":
				await startService.startWithAnt(item.path);
				break;
			case "docker":
				await startService.startWithDocker(item.path);
				break;
			case "dockerCompose":
				await startService.startWithDockerCompose(item.path);
				break;
		}

		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	};
	vscode.commands.registerCommand("frank.deleteProject", async function (item) { 
		await startService.deleteRanProject(item.method, item.path);
		
		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	});
	vscode.commands.registerCommand("frank.startCurrent", async function (item) { 
		startHandler(item);
		
		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	});
	vscode.commands.registerCommand("frank.startProject", async function (item) { 
		startHandler(item);

		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	});
	vscode.commands.registerCommand('frank.startAnt', async function () {
		startService.startWithAnt();

		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	});
	vscode.commands.registerCommand('frank.startDocker', async function () {
		startService.startWithDocker();
		
		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	});
	vscode.commands.registerCommand('frank.startDockerCompose', async function () {
		startService.startWithDockerCompose();

		startTreeProvider.rebuild();
        startTreeProvider.refresh();
	});

	vscode.commands.registerCommand('frank.addNewAdapter', async function () {
		const adapter = await vscode.window.showQuickPick(
			["Adapter 1", "Adapter 2", "Adapter 3", "Adapter 4"]
		);
		const editor = vscode.window.activeTextEditor;
		await editor.edit(editBuilder => {
        	editBuilder.insert(editor.selection.active, adapter);
    	});
	})

	//Load examples from the Frank!Framework Wiki as VS Code Snippets.
	userSnippetsService.ensureSnippetsFilesExists();
	userSnippetsService.loadFrankFrameworkSnippets();

	//Init flowchart view
	const flowViewProvider = new FlowViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('flowView', flowViewProvider)
	);
	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.languageId === "xml") {
			flowViewProvider.updateWebview();
		}
	});
	vscode.workspace.onDidSaveTextDocument((document) => {
		if (document.languageId === "xml") {
			flowViewProvider.updateWebview();
		}
	});
	async function focusFlowView() {
		await vscode.commands.executeCommand(
			"workbench.view.extension.flowViewContainer"
		);
	}
	focusFlowView();

	const startTreeView = vscode.window.createTreeView("startTreeView", {
		treeDataProvider: startTreeProvider
	});
	setStartTreeViewDescription();
	vscode.window.onDidChangeActiveTextEditor(() => {
		setStartTreeViewDescription();
	});
	async function setStartTreeViewDescription() {
		const project = await startService.getWorkingDirectory();
		let projectName = "";

		if (project != undefined) {
			startTreeView.description = path.basename(project);
		} else {
			startTreeView.description = "No Project Open in Editor/No Runable File Found";
		}
	}
	vscode.commands.registerCommand("frank.toggleUpdate", async (item) => {
		if (!item || item.method !== "ant") {
			return;
		}

		startService.toggleUpdate(item.path);

		startTreeProvider.rebuild();
    	startTreeProvider.refresh();
	});

	//Init user snippets tree view
	vscode.window.createTreeView("userSnippetsTreeview", {
		treeDataProvider: userSnippetsTreeProvider,
		dragAndDropController: userSnippetsDndController
	});
	vscode.commands.registerCommand('frank.addNewCategoryOfUserSnippets', () => {
		userSnippetsService.addNewCategoryOfUserSnippets(userSnippetsTreeProvider);
	});
	vscode.commands.registerCommand("frank.deleteAllUserSnippetByCategory", (item) => {
		const userSnippets = userSnippetsService.deleteAllUserSnippetByCategory(item.label);

		userSnippetsTreeProvider.rebuild();
		userSnippetsTreeProvider.refresh();
	});
	vscode.commands.registerCommand('frank.showUserSnippetsViewPerCategory', (category) => {
		showSnippetsView(context, category, userSnippetsTreeProvider, userSnippetsService);
	})

	vscode.commands.registerCommand("frank.editUserSnippet", (item) => {
		showSnippetsView(context, item.category, userSnippetsTreeProvider, userSnippetsService);
	});
	vscode.commands.registerCommand("frank.deleteUserSnippet", (item) => {
		const userSnippets = userSnippetsService.deleteUserSnippet(item.category, item.index);

		userSnippetsTreeProvider.rebuild();
		userSnippetsTreeProvider.refresh();
	});

	vscode.commands.registerCommand('frank.addNewUserSnippet', async function () {
		await userSnippetsService.addNewUserSnippet(userSnippetsTreeProvider);

		vscode.window.showInformationMessage("Snippet added!");
	});

	vscode.languages.registerDocumentLinkProvider({ language: 'xml', scheme: 'file' }, {
		provideDocumentLinks(document, token) {
			const links = [];
			const text = document.getText();
			const regex = /\w+/g;
			let match;

			const componentsPath = context.asAbsolutePath('./resources/components.json');
			const components = fs.readFileSync(componentsPath, 'utf8');
			targets = JSON.parse(components);

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

	function execAsync(command, cwd) {
		return new Promise((resolve, reject) => {
			exec(command, { cwd }, (error, stdout, stderr) => {
				if (error) {
					reject(stderr || error);
				} else {
					resolve(stdout);
				}
			});
		});
	}
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
