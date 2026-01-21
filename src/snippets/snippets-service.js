const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require("child_process");
const he = require('he');
const format = require('xml-formatter');

class SnippetsService {
    constructor(context) {
        this.context = context;
    }

    getUserSnippetsPath() {
        return path.join(this.context.globalStorageUri.fsPath,'../../snippets/usersnippets.code-snippets');
    }

    getFrameworkSnippetsPath() {
        return path.join(this.context.globalStorageUri.fsPath,'../../snippets/frankframework.code-snippets');
    }

    ensureSnippetsFilesExists() {
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

    getUserSnippets() {
        const userSnippetsStoragePath =  this.getUserSnippetsPath();

        try {
            const userSnippets = JSON.parse(fs.readFileSync(userSnippetsStoragePath, 'utf8'));

            return userSnippets;
        } catch (err) {
            console.error(err);
            return {};
        }
    }

    setUserSnippets(userSnippets) {
        const userSnippetsStoragePath =  this.getUserSnippetsPath();

        try {
            fs.writeFileSync(userSnippetsStoragePath, JSON.stringify(userSnippets, null, 4), 'utf8');
        } catch (err) {
            console.log(err);
        }
    }

    getFrameworkSnippets() {
        const frameworkSnippetsStoragePath = this.getFrameworkSnippetsPath();

        try {
            const frameworkSnippets = JSON.parse(fs.readFileSync(frameworkSnippetsStoragePath, 'utf8'));

            return frameworkSnippets;
        } catch (err) {
            console.error(err);
            return {};
        }
    }

    setFrameworkSnippets(frameworkSnippets) {
        const frameworkSnippetsStoragePath =  this.getFrameworkSnippetsPath();

        try {
            fs.writeFileSync(frameworkSnippetsStoragePath, JSON.stringify(frameworkSnippets, null, 4), 'utf8');
        } catch (err) {
            console.log(err);
        }
    }

    async addNewUserSnippet(userSnippetsTreeProvider) {
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
    
            const newSnippetBody = {
                "prefix": category,
                "body": body,
                "description": category
            };

            snippetsByCategory.push(newSnippetBody);
            userSnippets[category] = snippetsByCategory;
    
            this.setUserSnippets(userSnippets);

            userSnippetsTreeProvider.rebuild();
            userSnippetsTreeProvider.refresh();
        } catch (err) {
            console.log(err);
        }
    }

    deleteUserSnippet(category, snippetIndex) {
        try {
            const userSnippets = this.getUserSnippets();

            userSnippets[category].splice(snippetIndex, 1);

            this.setUserSnippets(userSnippets);
        } catch (err) {
            console.log(err);
        }
    }

    deleteAllUserSnippetByCategory(category) {
        try {
            const userSnippets = this.getUserSnippets();

            delete userSnippets[category];

            this.setUserSnippets(userSnippets);
        } catch (err) {
            console.log(err);
        }
    }

    changeCategoryOfUserSnippets(oldCategory, category) {
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
                console.log(err);
            }
        }
    }

    async addNewCategoryOfUserSnippets(userSnippetsTreeProvider) {
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

        userSnippetsTreeProvider.rebuild();
        userSnippetsTreeProvider.refresh();
    }

    async uploadUserSnippet(category) {    
        const storagePath = this.context.globalStorageUri.fsPath;
        const targetDir = path.join(storagePath, "frankframework.wiki");
        const targetPath = path.join(targetDir, `${category}.md`)

        try {
            exec(`git reset --hard`, { cwd: targetDir}, (err) => {
                exec(`git clean -fd`, { cwd: targetDir}, (err) => {
                    exec(`git pull`, { cwd: targetDir }, async (err) => {
                        if (err) {
                            console.log(err);
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
                                    console.log(err);
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
                                            console.log(err);
                                            vscode.window.showErrorMessage("error");
                                            return;
                                        }
                                        exec(`git push`, { cwd: targetDir }, (err) => {
                                            if (err) {
                                                console.log(err);
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
            console.log(err);
        }
    }

    prettifyXml(xml) {
        try {
            return format(xml, {
                indentation: '    ',
                collapseContent: true,
                lineSeparator: '\n'
            });
        } catch {
            return xml;
        }
    };

    extractSnippets(targetDir) {
        const snippetsStoragePath =  path.join(this.context.globalStorageUri.fsPath, '../../snippets/frankframework.code-snippets');

        const regex = new RegExp(
        '```xml([\\s\\S]*?)```|' +
        '<pre>([\\s\\S]*?)</pre>|' +
        '(^\\s*<(\\w+)[^>]*>[\\s\\S]*?</\\4>)',
        'gm'
        );

        const snippets = {}
        
        try {
            const files = fs.readdirSync(targetDir);

            for (const file of files) {
                const filePath = path.join(targetDir, file);
                const category = file.replace(/.md|.asciidoc/g, "");
                const snippetsPerFile = [];
                
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const matches = content.matchAll(regex);

                    for (const match of matches) {
                        const xmlBlock = match[1] || match[2] || match[3] || match[4];

                        if (xmlBlock) {
                            const decodedBody = he.decode(xmlBlock.trim()).replace("<pre>", "").replace("</pre>", "");
                
                            const prettyBody = this.prettifyXml(decodedBody);

                            const snippet = {
                                "prefix": category,
                                "body": prettyBody,
                                "description": category
                            }

                            snippetsPerFile.push(snippet)
                        }
                    }
                    snippets[category] = snippetsPerFile;
                } catch (err) {
                    console.log(err);
                }
            } 
            fs.writeFileSync(snippetsStoragePath, JSON.stringify(snippets, null, 4), 'utf8');
        } catch (err) {
            console.log(err);
        }
    }

    loadFrankFrameworkSnippets() {
        const storagePath = this.context.globalStorageUri.fsPath;
        fs.mkdirSync(storagePath, { recursive: true });

        const repoUrl = "https://github.com/frankframework/frankframework.wiki.git";
        const targetDir = path.join(storagePath, "frankframework.wiki");

        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.rmSync(targetDira, { recursive: true, force: true });

        exec(`git clone "${repoUrl}" "${targetDir}"`, { cwd: storagePath }, (err) => {
            if (err) {
                console.log(err);
            }

            this.extractSnippets(targetDir);
        });
    };
}

module.exports = SnippetsService;