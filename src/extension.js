"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const child_process_1 = require("child_process");
const start_service_1 = require("./start/start-service");
const snippets_service_1 = require("./snippets/snippets-service");
const usersnippets_view_1 = require("./snippets/usersnippets-view");
const flow_view_provider_1 = require("./flow/flow-view-provider");
const snippets_tree_provider_1 = require("./snippets/snippets-tree-provider");
const snippets_dnd_controller_1 = require("./snippets/snippets-dnd-controller");
const start_tree_provider_1 = require("./start/start-tree-provider");
/**
 * @param {vscode.ExtensionContext} context
*/
let targets = null;
let projectNameTrimmed = "skeleton";
let configNameTrimmed = "";
function activate(context) {
    const snippetsService = new snippets_service_1.default(context);
    const snippetsTreeProvider = new snippets_tree_provider_1.SnippetsTreeProvider(snippetsService);
    const snippetsDndController = new snippets_dnd_controller_1.SnippetsDndController(context, snippetsTreeProvider, snippetsService);
    const startService = new start_service_1.default(context);
    const startTreeProvider = new start_tree_provider_1.StartTreeProvider(context, startService);
    vscode.commands.registerCommand('frank.createNewFrank', async function () {
        const items = [
            {
                label: 'Simple Frank'
            },
            {
                label: 'Skeleton',
                description: 'https://github.com/wearefrank/skeleton?tab=readme-ov-file#steps'
            },
            {
                label: 'Project per Config',
                description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#project-per-config'
            },
            {
                label: 'Module per Config',
                description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#module-per-config'
            },
            {
                label: 'Monorepo',
                description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#module-per-config-flattened-aka-monorepo'
            },
            {
                label: 'Foks Monorepo',
                description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#foks-monorepo'
            }
        ];
        const projectType = await vscode.window.showQuickPick(items, { placeHolder: "Pick a project" });
        if (projectType && projectType.description) {
            vscode.env.openExternal(vscode.Uri.parse(projectType.description));
        }
        else if (projectType.label === "Simple Frank") {
            const projectName = await vscode.window.showInputBox({
                placeHolder: 'Give your project a name',
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
            const configName = await vscode.window.showInputBox({
                placeHolder: 'Give your configuration a name',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Name cannot be empty';
                    }
                    return null;
                }
            });
            if (!configName) {
                return;
            }
            configNameTrimmed = configName.trim();
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const rootPath = workspaceFolders[0].uri.fsPath;
            if (!fs.existsSync(path.join(rootPath, "frank-runner"))) {
                await execAsync('git clone https://github.com/wearefrank/frank-runner.git', rootPath);
            }
            const simpleFrankPath = vscode.Uri.file(path.join(context.extensionPath, 'resources/simpleFrank/projectName'));
            const targetDir = vscode.Uri.file(path.join(rootPath, projectNameTrimmed));
            await copyDir(simpleFrankPath, targetDir);
            vscode.window.showTextDocument(vscode.Uri.file(path.join(rootPath, projectNameTrimmed, 'configurations', configNameTrimmed, 'Configuration.xml')));
            vscode.env.openExternal(vscode.Uri.parse("https://github.com/wearefrank/frank-runner?tab=readme-ov-file#project-structure-and-customisation"));
        }
    });
    //Helper function to copy simple frank project to user workspace.
    async function copyDir(source, target) {
        await vscode.workspace.fs.createDirectory(target);
        const entries = await vscode.workspace.fs.readDirectory(source);
        for (const [name, type] of entries) {
            const src = vscode.Uri.joinPath(source, name);
            let dest = vscode.Uri.joinPath(target, name);
            if (name === "configName") {
                dest = vscode.Uri.joinPath(target, configNameTrimmed);
            }
            if (type === vscode.FileType.Directory) {
                await copyDir(src, dest);
            }
            else {
                await vscode.workspace.fs.copy(src, dest, { overwrite: true });
            }
        }
    }
    vscode.commands.registerCommand("frank.openWalkthrough", () => {
        vscode.commands.executeCommand("workbench.action.openWalkthrough", "wearefrank.wearefrank#introduction", false);
    });
    //Helper function for starting a project.
    async function startHandler(item, isCurrent) {
        switch (item.method) {
            case "ant":
                await startService.startWithAnt(item.path, isCurrent);
                break;
            case "docker":
                await startService.startWithDocker(item.path, isCurrent);
                break;
            case "dockerCompose":
                await startService.startWithDockerCompose(item.path, isCurrent);
                break;
        }
        startTreeProvider.rebuild();
        startTreeProvider.refresh();
    }
    ;
    vscode.commands.registerCommand("frank.startCurrent", async function (item) {
        startHandler(item, true);
        startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });
    vscode.commands.registerCommand("frank.startProject", async function (item) {
        startHandler(item, false);
        startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });
    //Deletes project from ran projects list in Frank!Start view.
    vscode.commands.registerCommand("frank.deleteProject", async function (item) {
        await startService.deleteRanProject(item.method, item.path);
        startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });
    //Init start view.
    const startTreeView = vscode.window.createTreeView("startTreeView", {
        treeDataProvider: startTreeProvider
    });
    setStartTreeViewDescription();
    vscode.window.onDidChangeActiveTextEditor(() => {
        setStartTreeViewDescription();
    });
    async function setStartTreeViewDescription() {
        const project = await startService.getWorkingDirectory();
        if (project != undefined) {
            startTreeView.description = path.basename(project);
        }
        else {
            startTreeView.description = "No Project Open in Editor/No Runable File Found";
        }
    }
    vscode.commands.registerCommand("frank.toggleUpdate", async (item) => {
        if (!item || item.method !== "ant") {
            return;
        }
        await startService.toggleUpdate(item.path);
        startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });
    //Load examples from the Frank!Framework Wiki as VS Code Snippets.
    snippetsService.ensureSnippetsFilesExists();
    snippetsService.loadFrankFrameworkSnippets();
    //Init flowchart view.
    const flowViewProvider = new flow_view_provider_1.default(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('flowView', flowViewProvider));
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
        await vscode.commands.executeCommand("workbench.view.extension.flowViewContainer");
    }
    focusFlowView();
    //Init snippets tree view.
    vscode.window.createTreeView("snippetsTreeView", {
        treeDataProvider: snippetsTreeProvider,
        dragAndDropController: snippetsDndController
    });
    vscode.commands.registerCommand('frank.addNewCategoryOfUserSnippets', () => {
        snippetsService.addNewCategoryOfUserSnippets(snippetsTreeProvider);
    });
    vscode.commands.registerCommand("frank.deleteAllUserSnippetByCategory", (item) => {
        snippetsService.deleteAllUserSnippetByCategory(item.label);
        snippetsTreeProvider.rebuild();
        snippetsTreeProvider.refresh();
    });
    vscode.commands.registerCommand('frank.showUserSnippetsViewPerCategory', (category) => {
        (0, usersnippets_view_1.showSnippetsView)(context, category, snippetsTreeProvider, snippetsService);
    });
    vscode.commands.registerCommand("frank.editUserSnippet", (item) => {
        (0, usersnippets_view_1.showSnippetsView)(context, item.category, snippetsTreeProvider, snippetsService);
    });
    vscode.commands.registerCommand("frank.deleteUserSnippet", (item) => {
        snippetsService.deleteUserSnippet(item.category, item.index);
        snippetsTreeProvider.rebuild();
        snippetsTreeProvider.refresh();
    });
    vscode.commands.registerCommand("frank.insertSnippet", async function (body) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor");
        }
        else {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, body);
            });
        }
    });
    vscode.commands.registerCommand('frank.addNewUserSnippet', async function () {
        await snippetsService.addNewUserSnippet(snippetsTreeProvider);
        vscode.window.showInformationMessage("Snippet added!");
    });
    vscode.languages.registerDocumentLinkProvider({ language: 'xml', scheme: 'file' }, {
        provideDocumentLinks(document, _token) {
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
            (0, child_process_1.exec)(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(stderr || error);
                }
                else {
                    resolve(stdout);
                }
            });
        });
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map