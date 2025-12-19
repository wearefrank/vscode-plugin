const vscode = require("vscode");
const fs = require('fs');
const path = require('path');

class StartService {
    constructor() {}

    async getWorkingDirectory(file) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("No active editor");
            return;
        }

        const currentDir = path.dirname(editor.document.uri.fsPath);

        while (true) {
            const matches = await vscode.workspace.findFiles(
                new vscode.RelativePattern(currentDir, file),
                null,
                1
            );

            if (matches.length > 0) {
                return currentDir;
            }

            const parentDir = path.dirname(currentDir);

            if (parentDir === currentDir) {
                vscode.window.showErrorMessage(`No file matching '${file}' found in any parent folder.`);
                return;
            }

            currentDir = parentDir;
        }
    }

    async startWithAnt() {
        const workingDir = await this.getWorkingDirectory("build.xml");

        const term = vscode.window.createTerminal("Frank Ant");

        term.show();

        term.sendText(`cd "${workingDir}"`);
        term.sendText(`../frank-runner/ant.bat`);
    }

    async startWithDocker() {
        const workingDir = await this.getWorkingDirectory("Dockerfile");

        const projectName = path.basename(path.dirname(workingDir));

        var term = vscode.window.createTerminal('cmd');
        term.show();
    
        term.sendText(`cd "${workingDir}"`);
        term.sendText(`docker build -t ${projectName} .`);
        term.sendText(`docker rm ${projectName}-container`);
        term.sendText(`docker run --name ${projectName}-container ${projectName}`);
    }

    async startWithDockerCompose() {
        const workingDir = await this.getWorkingDirectory("compose**.yaml");
    
        var term = vscode.window.createTerminal('cmd');
        term.show();
    
        term.sendText(`cd "${workingDir}"`);
        term.sendText('docker compose -f compose.frank.loc.yaml up --build');
    }
}

module.exports = StartService;