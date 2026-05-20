import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

import StartService from "./start/start-service";
import SnippetsService from "./snippets/snippets-service";
import { showSnippetsView } from './snippets/usersnippets-view';
import FlowViewProvider from './flow/flow-view-provider';
import { SnippetsTreeProvider } from "./snippets/snippets-tree-provider";
import { SnippetsDndController } from "./snippets/snippets-dnd-controller";
import { StartTreeProvider } from "./start/start-tree-provider";
import { FrankValidator } from './validation/frank-validator';
import { ConfigurationIndex } from './validation/configuration-index';
import { SessionKeyDefinitionProvider } from './navigation/sessionKeyDefinitionProvider';
import { MasterRenameProvider } from './rename/masterRenameProvider';
import { FrankRenameHintProvider } from './rename/frankRenameHintProvider';
import { PipeReferenceProvider } from './references/pipeReferenceProvider';
import { showCreateFrankView } from './start/create-frank-view';

let targets: Record<string, Record<string, string[]>> = {};
let projectNameTrimmed = "skeleton";
let configNameTrimmed = "";

export async function activate(context: vscode.ExtensionContext) {


    const config = vscode.workspace.getConfiguration('frank');

    const configurationIndex = new ConfigurationIndex();
    await configurationIndex.buildIndex();

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('frank-framework');
    context.subscriptions.push(diagnosticCollection);

    const frankValidator = new FrankValidator(diagnosticCollection, configurationIndex);

    const snippetsService = new SnippetsService(context);
    const snippetsTreeProvider = new SnippetsTreeProvider(snippetsService);
    const snippetsDndController = new SnippetsDndController(context, snippetsTreeProvider, snippetsService);

    const startService = new StartService(context);
    const startTreeProvider = new StartTreeProvider(context, startService);

    const flowViewProvider = new FlowViewProvider(context);

    const documentSelector: vscode.DocumentSelector = { language: 'xml', scheme: 'file' };

    const sessionKeyProvider = new SessionKeyDefinitionProvider();
    const frankRenameHintProvider = new FrankRenameHintProvider();
    const pipeReferenceProvider = new PipeReferenceProvider();

    let validationTimeout: NodeJS.Timeout | undefined;
    let validationCancellationTokenSource: vscode.CancellationTokenSource | undefined;

    const triggerValidation = (document: vscode.TextDocument) => {
        if (document.languageId !== 'xml') return;
        if (!config.get('enableValidation')) return;

        if (validationTimeout) {
            clearTimeout(validationTimeout);
        }

        if (validationCancellationTokenSource) {
            validationCancellationTokenSource.cancel();
            validationCancellationTokenSource.dispose();
        }

        validationCancellationTokenSource = new vscode.CancellationTokenSource();
        const token = validationCancellationTokenSource.token;

        validationTimeout = setTimeout(async () => {
            try {
                await frankValidator.validate(document, token);
            } catch (err) {
                console.error("FrankValidator failed:", err);
            }
        }, 300);
    };

    if (config.get('enableRename')) {
        frankRenameHintProvider.register(context);
        context.subscriptions.push(
            vscode.languages.registerRenameProvider({ language: 'xml' }, new MasterRenameProvider())
        );
    }

    if (config.get('enableGoToDefinition')) {
        context.subscriptions.push(
            vscode.languages.registerDefinitionProvider(documentSelector, sessionKeyProvider)
        );
    }

    if (config.get('enableFindReferences')) {
        context.subscriptions.push(
            vscode.languages.registerReferenceProvider(documentSelector, pipeReferenceProvider)
        );
    }

    if (config.get('enableFlowVisualization')) {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('flowView', flowViewProvider)
        );
    }

    const startTreeView = vscode.window.createTreeView("startTreeView", {
        treeDataProvider: startTreeProvider
    });

    if (config.get('enableSnippets')) {
        vscode.window.createTreeView("snippetsTreeView", {
            treeDataProvider: snippetsTreeProvider,
            dragAndDropController: snippetsDndController
        });
    }

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async doc => {
            if (doc.languageId === 'xml') {
                await configurationIndex.updateFile(doc.uri);

                if (config.get('enableValidation')) {
                    vscode.workspace.textDocuments.forEach(openDoc => {
                        if (openDoc.languageId === 'xml') {
                            triggerValidation(openDoc);
                        }
                    });
                }

                if (config.get('enableFlowVisualization')) {
                    flowViewProvider.updateWebview();
                }
            }
        }),

        vscode.workspace.onDidDeleteFiles(event => {
            event.files.forEach(uri => configurationIndex.removeFile(uri));
        }),

        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'xml' && config.get('enableValidation')) {
                triggerValidation(e.document);
            }
        }),

        vscode.workspace.onDidCloseTextDocument(doc => frankValidator.clear(doc)),

        vscode.window.onDidChangeActiveTextEditor(() => {
            setStartTreeViewDescription();
            if (config.get('enableFlowVisualization')) {
                flowViewProvider.updateWebview();
            }
        }),

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('frank')) {
                vscode.window.showInformationMessage(
                    'Frank!Framework settings changed. Reload the window to apply.',
                    'Reload Window'
                ).then(selection => {
                    if (selection === 'Reload Window') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }
        })
    );

    // Load components.json once — used by the document link provider
    try {
        const componentsPath = context.asAbsolutePath('./resources/components.json');
        const components = fs.readFileSync(componentsPath, 'utf8');
        targets = JSON.parse(components);
    } catch (err) {
        console.error("Failed to load components.json:", err);
    }

    vscode.commands.registerCommand('frank.createNewFrank', async function () {
        const items = [
            { label: 'Simple Frank' },
            { label: 'Skeleton', description: 'https://github.com/wearefrank/skeleton?tab=readme-ov-file#steps' },
            { label: 'Project per Config', description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#project-per-config' },
            { label: 'Module per Config', description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#module-per-config' },
            { label: 'Monorepo', description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#module-per-config-flattened-aka-monorepo' },
            { label: 'Foks Monorepo', description: 'https://github.com/wearefrank/frank-runner?tab=readme-ov-file#foks-monorepo' }
        ];

        const projectType = await vscode.window.showQuickPick(items as vscode.QuickPickItem[], {placeHolder: "Pick a project"});
        
        if (projectType?.label === "Simple Frank") {
            showCreateFrankView(context, 'simple');
        } else if (projectType?.label === "Skeleton") {
            showCreateFrankView(context, 'skeleton');
        } else if (projectType && projectType.description) {
            vscode.env.openExternal(vscode.Uri.parse(projectType.description));
        }
    });

    vscode.commands.registerCommand("frank.openWalkthrough", () => {
        vscode.commands.executeCommand("workbench.action.openWalkthrough", "wearefrank.wearefrank#introduction", false);
    });

    vscode.commands.registerCommand("frank.startCurrent", async function (item) {
        await startHandler(item, true);
        await startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });

    vscode.commands.registerCommand("frank.startProject", async function (item) {
        await startHandler(item, false);
        await startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });

    vscode.commands.registerCommand("frank.deleteProject", async function (item) {
        await startService.deleteRanProject(item.method, item.path);
        await startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });

    vscode.commands.registerCommand("frank.toggleUpdate", async (item) => {
        if (!item || item.method !== "ant") return;
        await startService.toggleUpdate(item.path);
        startTreeProvider.rebuild();
        startTreeProvider.refresh();
    });

    if (config.get('enableSnippets')) {
        vscode.commands.registerCommand('frank.addNewCategoryOfUserSnippets', () => {
            snippetsService.addNewCategoryOfUserSnippets(snippetsTreeProvider);
        });

        vscode.commands.registerCommand("frank.deleteAllUserSnippetByCategory", (item) => {
            snippetsService.deleteAllUserSnippetByCategory(item.label);
            snippetsTreeProvider.rebuild();
            snippetsTreeProvider.refresh();
        });

        vscode.commands.registerCommand('frank.showUserSnippetsViewPerCategory', (category) => {
            showSnippetsView(context, category, snippetsTreeProvider, snippetsService);
        });

        vscode.commands.registerCommand("frank.editUserSnippet", (item) => {
            showSnippetsView(context, item.category, snippetsTreeProvider, snippetsService);
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
            } else {
                await editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, body);
                });
            }
        });

        vscode.commands.registerCommand('frank.addNewUserSnippet', async function () {
            await snippetsService.addNewUserSnippet(snippetsTreeProvider);
            vscode.window.showInformationMessage("Snippet added!");
        });
    }

    async function copyDir(source: vscode.Uri, target: vscode.Uri): Promise<void> {
        await vscode.workspace.fs.createDirectory(target);
        const entries = await vscode.workspace.fs.readDirectory(source);

        for (const [name, type] of entries) {
            const src = vscode.Uri.joinPath(source, name);
            let dest = vscode.Uri.joinPath(target, name);
            
            if (name === "configName") dest = vscode.Uri.joinPath(target, configNameTrimmed);

            if (type === vscode.FileType.Directory) {
                await copyDir(src, dest);
            } else {
                await vscode.workspace.fs.copy(src, dest, { overwrite: true });
            }
        }
    }

    async function setStartTreeViewDescription() {
        const project = await startService.getWorkingDirectory();
        startTreeView.description = project ? path.basename(project) : "No Project Open in Editor/No Runable File Found";
    }

    async function startHandler(item: { method: 'ant' | 'dockerCompose'; path: string }, isCurrent: boolean): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (config.get('enableValidation') && editor && editor.document.languageId === 'xml') {
            frankValidator.validate(editor.document);
            const diagnostics = diagnosticCollection.get(editor.document.uri);
            const hasErrors = diagnostics && diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error);

            if (hasErrors) {
                const selection = await vscode.window.showErrorMessage(
                    "Configuration contains semantic errors (e.g., missing forwards). The application may fail to start.",
                    "Start Anyway", "Cancel"
                );
                if (selection !== "Start Anyway") return;
            }
        }

        switch (item.method) {
            case "ant": await startService.startWithAnt(item.path, isCurrent); break;
            case "dockerCompose": await startService.startWithDockerCompose(item.path, isCurrent); break;
        }
    }

    function execAsync(command: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) reject(stderr || error);
                else resolve(stdout);
            });
        });
    }

    if (config.get('enableDocumentLinks')) {
        context.subscriptions.push(vscode.languages.registerDocumentLinkProvider({ language: 'xml', scheme: 'file' }, {
            provideDocumentLinks(document, token) {
                const links: vscode.DocumentLink[] = [];
                const text = document.getText();
                const regex = /\w+/g;
                let match;

                while ((match = regex.exec(text)) !== null) {
                    if (token.isCancellationRequested) break;

                    targetLoop: for (const i in targets) {
                        for (const j in targets[i]) {
                            if (targets[i][j].includes(match[0])) {
                                const start = document.positionAt(match.index);
                                const end = document.positionAt(match.index + match[0].length);
                                links.push(new vscode.DocumentLink(new vscode.Range(start, end), vscode.Uri.parse(`https://frankdoc.frankframework.org/#/${i}/${j}/${match[0]}`)));
                                break targetLoop;
                            }
                        }
                    }
                }
                return links;
            }
        }));
    }

    setStartTreeViewDescription();
    if (config.get('enableSnippets')) {
        snippetsService.ensureSnippetsFilesExists();
        snippetsService.loadFrankFrameworkSnippets();
    }
    if (config.get('enableFlowVisualization')) {
        vscode.commands.executeCommand("workbench.view.extension.flowViewContainer");
    }

    if (config.get('enableValidation') && vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'xml') {
        triggerValidation(vscode.window.activeTextEditor.document);
    }
}

export function deactivate() {}