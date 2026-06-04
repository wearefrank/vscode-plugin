import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from "child_process";
import * as he from 'he';
import format from 'xml-formatter';

export interface Snippet {
    prefix: string;
    body: string;
    description: string;
}

export type UserSnippets = Record<string, Snippet[]>;

export interface SnippetsRefreshable {
    rebuild(): void;
    refresh(): void;
}

class SnippetsService {
    context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    getUserSnippetsPath(): string {
        return path.join(this.context.globalStorageUri.fsPath,'../../snippets/usersnippets.code-snippets');
    }

    getFrameworkSnippetsPath(): string {
        return path.join(this.context.globalStorageUri.fsPath,'../../snippets/frankframework.code-snippets');
    }

    ensureSnippetsFilesExists(): void {
        const storagePaths = [];
        storagePaths.push(this.getUserSnippetsPath());
        storagePaths.push(this.getFrameworkSnippetsPath());

        storagePaths.forEach(storagePath => {
            const dir = path.dirname(storagePath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (!fs.existsSync(storagePath)) {
                fs.writeFileSync(storagePath, "{}", "utf8");
            }
        });
    }

    getUserSnippets(): UserSnippets {
        const userSnippetsStoragePath =  this.getUserSnippetsPath();

        try {
            const userSnippets = JSON.parse(fs.readFileSync(userSnippetsStoragePath, 'utf8'));

            return userSnippets;
        } catch (err) {
            console.error(err);
            return {};
        }
    }

    setUserSnippets(userSnippets: UserSnippets): void {
        const userSnippetsStoragePath =  this.getUserSnippetsPath();

        try {
            fs.writeFileSync(userSnippetsStoragePath, JSON.stringify(userSnippets, null, 4), 'utf8');
        } catch (err) {
            console.error(err);
        }
    }

    getFrameworkSnippets(): UserSnippets {
        const frameworkSnippetsStoragePath = this.getFrameworkSnippetsPath();

        try {
            const frameworkSnippets = JSON.parse(fs.readFileSync(frameworkSnippetsStoragePath, 'utf8'));

            return frameworkSnippets;
        } catch (err) {
            console.error(err);
            return {};
        }
    }

    async addNewUserSnippet(provider: SnippetsRefreshable): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return;
        }

        const selection = editor.selection;
        const body = editor.document.getText(selection);

        const category = await vscode.window.showInputBox({
            placeHolder: 'Give a name for the category of your new snippet.',
            prompt: "Category is required",
            validateInput: (value) => {
                if (!value || value.trim() === "") {
                    return "Category cannot be empty";
                }
                return null;
            }
        });

        if (!category) {
            return;
        }

        try {
            const userSnippets = this.getUserSnippets();

            let snippetsByCategory = userSnippets[category];

            if (snippetsByCategory === undefined) {
                snippetsByCategory = [];
            }

            const newSnippetBody: Snippet = {
                "prefix": category,
                "body": body,
                "description": category
            };

            snippetsByCategory.push(newSnippetBody);
            userSnippets[category] = snippetsByCategory;

            this.setUserSnippets(userSnippets);

            provider.rebuild();
            provider.refresh();
        } catch (err) {
            console.error(err);
        }
    }

    deleteUserSnippet(category: string, snippetIndex: number): void {
        try {
            const userSnippets = this.getUserSnippets();

            userSnippets[category].splice(snippetIndex, 1);

            this.setUserSnippets(userSnippets);
        } catch (err) {
            console.error(err);
        }
    }

    deleteAllUserSnippetByCategory(category: string): void {
        try {
            const userSnippets = this.getUserSnippets();

            delete userSnippets[category];

            this.setUserSnippets(userSnippets);
        } catch (err) {
            console.error(err);
        }
    }

    changeCategoryOfUserSnippets(oldCategory: string, category: string): void {
        const userSnippets = this.getUserSnippets();

        if (Object.keys(userSnippets).includes(category)) {
            vscode.window.showErrorMessage("error");
            return;
        }

        if (oldCategory != category) {
            try {
                userSnippets[category] = userSnippets[oldCategory];

                delete userSnippets[oldCategory];

                this.setUserSnippets(userSnippets);
            } catch (err) {
                console.error(err);
            }
        }
    }

    async addNewCategoryOfUserSnippets(provider: SnippetsRefreshable): Promise<void> {
        const userSnippets = this.getUserSnippets();

        const category = await vscode.window.showInputBox({
            placeHolder: 'Give your new category a name',
            prompt: "Category is required",
            validateInput: (value) => {
                if (!value || value.trim() === "") {
                    return "Category cannot be empty";
                }
                return null;
            }
        });

        if (!category) {
            return;
        }

        userSnippets[category] = [];

        this.setUserSnippets(userSnippets);

        provider.rebuild();
        provider.refresh();
    }

    async uploadUserSnippet(category: string): Promise<void> {
        const storagePath = this.context.globalStorageUri.fsPath;
        const targetDir = path.join(storagePath, "frankframework.wiki");
        const targetPath = path.join(targetDir, `${category}.md`)

        try {
            exec(`git reset --hard`, { cwd: targetDir}, (_err) => {
                exec(`git clean -fd`, { cwd: targetDir}, (_err) => {
                    exec(`git pull`, { cwd: targetDir }, async (err) => {
                        if (err) {
                            console.error(err);
                            vscode.window.showErrorMessage("error");
                            return;
                        }

                        const newFileText = "Replace all text in this file with your content.\n\nPlease make sure you use the right format:\n````xml\n<example/>\n\t<example>\n</example>\n```\n\nSave to add this file as a page to the Frank!Framework Wiki.";

                        if (!fs.existsSync(targetPath)) {
                            const choice = await vscode.window.showInformationMessage(
                                'Page doesn\'t exist in the current wiki, create a new page?',
                                'Yes',
                                'Cancel'
                            );

                            if (choice === 'Yes') {
                                try {
                                    fs.writeFileSync(targetPath, newFileText, "utf8");
                                } catch (err) {
                                    console.error(err);
                                }
                            } else {
                                return;
                            }
                        }

                        const doc = await vscode.workspace.openTextDocument(targetPath);
                        await vscode.window.showTextDocument(doc);

                        const saveListener = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
                            if (savedDoc.uri.fsPath === targetPath) {
                                exec(`git add . `, { cwd: targetDir }, (err) => {
                                    if (err) {
                                        vscode.window.showErrorMessage("error");
                                        return;
                                    }
                                    exec(`git commit -m "Updated ${category}.md"`, { cwd: targetDir }, (err) => {
                                        if (err) {
                                            console.error(err);
                                            vscode.window.showErrorMessage("error");
                                            return;
                                        }
                                        exec(`git push`, { cwd: targetDir }, (err) => {
                                            if (err) {
                                                console.error(err);
                                                vscode.window.showErrorMessage("error");
                                                return;
                                            }

                                            vscode.window.showInformationMessage("Snippet exported! You can close the file it won\'t make changes again.");
                                        });
                                    });
                                });

                                saveListener.dispose();
                            }
                        });
                    });
                });
            });

        } catch (err) {
            console.error(err);
        }
    }

    prettifyXml(xml: string): string {
        try {
            return format(xml, {
                indentation: '    ',
                collapseContent: true,
                lineSeparator: '\n'
            });
        } catch {
            return xml;
        }
    }

    extractSnippets(targetDir: string): void {
        const snippetsStoragePath =  path.join(this.context.globalStorageUri.fsPath, '../../snippets/frankframework.code-snippets');

        const regex = new RegExp(
        '```xml([\\s\\S]*?)```|' +
        '<pre>([\\s\\S]*?)</pre>|' +
        '(^\\s*<(\\w+)[^>]*>[\\s\\S]*?</\\4>)',
        'gm'
        );

        const snippets: UserSnippets = {};

        try {
            const files = fs.readdirSync(targetDir);

            for (const file of files) {
                const filePath = path.join(targetDir, file);
                const category = file.replace(/.md|.asciidoc/g, "");
                const snippetsPerFile: Snippet[] = [];

                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const matches = content.matchAll(regex);

                    for (const match of matches) {
                        const xmlBlock = match[1] || match[2] || match[3] || match[4];

                        if (xmlBlock) {
                            const decodedBody = he.decode(xmlBlock.trim()).replace("<pre>", "").replace("</pre>", "");

                            const prettyBody = this.prettifyXml(decodedBody);

                            const snippet: Snippet = {
                                "prefix": category,
                                "body": prettyBody,
                                "description": category
                            };

                            snippetsPerFile.push(snippet);
                        }
                    }
                    snippets[category] = snippetsPerFile;
                } catch (err) {
                    console.error(err);
                }
            }
            fs.writeFileSync(snippetsStoragePath, JSON.stringify(snippets, null, 4), 'utf8');
        } catch (err) {
            console.error(err);
        }
    }

    loadFrankFrameworkSnippets(): void {
        const storagePath = this.context.globalStorageUri.fsPath;
        fs.mkdirSync(storagePath, { recursive: true });

        const repoUrl = "https://github.com/frankframework/frankframework.wiki.git";
        const targetDir = path.join(storagePath, "frankframework.wiki");

        fs.rmSync(targetDir, { recursive: true, force: true });

        exec(`git clone "${repoUrl}" "${targetDir}"`, { cwd: storagePath }, (err) => {
            if (err) {
                console.error(err);
            }

            this.extractSnippets(targetDir);
        });
    }
}

export default SnippetsService;
