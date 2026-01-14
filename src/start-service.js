const vscode = require("vscode");
const fs = require('fs');
const path = require('path');

const { ProjectTreeItem } = require("./start/start-tree-provider.js");

class StartService {
    constructor(context) {
        this.context = context;
    }

    ensureRanProjectsFileExists() {
        const storageDir = this.context.globalStorageUri.fsPath;
        const ranProjectsPath = path.join(storageDir, 'ranProjects.json');

        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        if (!fs.existsSync(ranProjectsPath)) {
            fs.writeFileSync(ranProjectsPath, "{}", "utf8");
        }
    }

    async createFile(workspaceRoot, file) {
        const newFilePath = path.join(workspaceRoot, file)

        const defaultFilePath = path.join(this.context.extensionPath, 'resources', file)
        let newFile = fs.readFileSync(defaultFilePath, 'utf8');

        if (file === "compose.frank.loc.yaml") {
            if (workspaceRoot.toLowerCase().endsWith('\\frank-runner')) {
                vscode.window.showErrorMessage("Please add the compose.frank.loc.yaml manually.");
                return false;
            }

            const skeletonrcJSONPath = path.join(workspaceRoot, "skeletonrc.json");

            if (fs.existsSync(skeletonrcJSONPath)) {
                const skeletonrcJSON = JSON.parse(fs.readFileSync(skeletonrcJSONPath, 'utf8'));

                newFile = newFile.replace("placeholder", skeletonrcJSON.mappings["{{ cookiecutter.instance_name_lc }}"]);
            }
        }
        
        fs.writeFileSync(newFilePath, newFile, "utf8");

        return true;
    }

    async getWorkingDirectory(file) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("No active editor, open a file of the project you want to run in the editor.");
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
            editor.document.uri
        );

        const workspaceRoot = workspaceFolder.uri.fsPath;

        let currentDir = path.dirname(editor.document.uri.fsPath);
        let lastDir = currentDir;

        while (true) {
            let matches = await vscode.workspace.findFiles(
                new vscode.RelativePattern(currentDir, file),
                null,
                1
            );

            if (matches.length > 0) {
                return currentDir;
            }

            let parentDir = path.dirname(currentDir);

            if (currentDir === workspaceRoot) {
                 const choice = await vscode.window.showInformationMessage(
                    'File doesn\'t exist in the current project, create new file?',
                    'Yes',
                    'Cancel'
                );
                
                if (choice === 'Yes') {
                    try {
                        const createdFile = await this.createFile(lastDir, file);

                        if (createdFile) {
                            return lastDir;
                        } else {
                            return null;
                        }
                    } catch (err) {
                        return null;
                    }
                } else {
                    return null;
                }
            }

            lastDir = currentDir;
            currentDir = parentDir;
        }
    }

    async saveRanProject(method, workingDir) {
        const ranProjectsPath = path.join(this.context.globalStorageUri.fsPath, 'ranProjects.json');

        const ranProjects = fs.readFileSync(ranProjectsPath, 'utf8');
        let ranProjectJSON = JSON.parse(ranProjects);

        const newRanProjectBody = {
            project: path.basename(workingDir),
            path: workingDir
        };

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor");
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) return;

        const workspaceRootBasename = path.basename(workspaceFolder.uri.fsPath);

        if (!ranProjectJSON[workspaceRootBasename]) {
            ranProjectJSON[workspaceRootBasename] = [{}];
        }

        const workspaceEntry = ranProjectJSON[workspaceRootBasename][0];

        if (!Array.isArray(workspaceEntry[method])) {
            workspaceEntry[method] = [];
        }

        const exists = workspaceEntry[method].some(
            ({ project, path }) =>
                project === newRanProjectBody.project &&
                path === newRanProjectBody.path
        );

        if (!exists) {
            workspaceEntry[method].push(newRanProjectBody);
        }

        fs.writeFileSync(ranProjectsPath, JSON.stringify(ranProjectJSON, null, 4), "utf8");
    }

    isFrameworkFile(file) {
        if (file.startsWith('frankframework-webapp')) {
            return true;
        }

        if (file.startsWith('ibis-adapterframework-webapp')) {
            return true;
        }
    }

    updateOrNot(workingDir) {
        if (this.context.globalState.get('frank.updateEnabled')){
            if (fs.existsSync(path.join(workingDir, "frank-runner.properties"))) {
                let frankRunnerProperties = fs.readFileSync(path.join(workingDir, "frank-runner.properties"), 'utf8');

                frankRunnerProperties = frankRunnerProperties.replace(/ff\.version=.*/, "");

                fs.writeFileSync(path.join(workingDir, "frank-runner.properties"), frankRunnerProperties, "utf8");
            }
        } else {
            let  frankFrameworkFiles = [];

            if (workingDir.includes('frank-runner\\examples')) {
                frankFrameworkFiles = fs.readdirSync(path.join(workingDir, "../../download")).filter(this.isFrameworkFile);
            } else {
                frankFrameworkFiles = fs.readdirSync(path.join(workingDir, "../frank-runner/download")).filter(this.isFrameworkFile);
            }

            if (frankFrameworkFiles.lentgh > 0){
                const ffVersion = frankFrameworkFiles[0].split("-")[2] + "-" + frankFrameworkFile[0].split("-")[3];
            }

            const match = frankFrameworkFiles[0].match(/(\d+(?:\.\d+)*-\d+\.\d+)\.war$/);
            const ffVersion = match?.[1];

            if (fs.existsSync(path.join(workingDir, "frank-runner.properties"))) {
                const frankRunnerProperties = fs.readFileSync(path.join(workingDir, "frank-runner.properties"), 'utf8');

                const ffVersionSet = frankRunnerProperties.search(/ff\.version=.*/);

                if (ffVersionSet === -1) {
                    fs.appendFileSync(path.join(workingDir, "frank-runner.properties"), "\nff.version=" + ffVersion, "utf8");
                }
            } else {
                fs.writeFileSync(path.join(workingDir, "frank-runner.properties"), "ff.version=" + ffVersion, "utf8");
            }
        }
    }

    async startWithAnt(workingDir) {
        if (workingDir == null) {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage("No active editor");
                return;
            }

            workingDir = await this.getWorkingDirectory("build.xml");
        }

        if (!workingDir) {
            return;
        }

        this.updateOrNot(workingDir);
        
        const term = vscode.window.createTerminal("Frank Ant");

        term.show();

        term.sendText(`cd "${workingDir}"`);

        if (workingDir.includes('frank-runner\\examples')) {
            term.sendText(`../../ant.bat`);
        } else {
            term.sendText(`../frank-runner/ant.bat`);
        }

        await this.saveRanProject("ant", workingDir);
    }

    async startWithDocker(workingDir) {
        if (workingDir == null) {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage("No active editor");
                return;
            }

            workingDir = await this.getWorkingDirectory("Dockerfile");
        }

        if (!workingDir) {
            return;
        }

        const projectName = path.basename(workingDir);

        var term = vscode.window.createTerminal('cmd');
        term.show();
    
        term.sendText(`cd "${workingDir}"`);
        term.sendText(`docker build -t ${projectName} .`);
        term.sendText(`docker rm ${projectName}-container`);
        term.sendText(`docker run --name ${projectName}-container ${projectName}`);
        
        await this.saveRanProject("docker", workingDir);
    }

    async startWithDockerCompose(workingDir) {
        if (workingDir == null) {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage("No active editor");
                return;
            }

            workingDir = await this.getWorkingDirectory("compose.frank.loc.yaml");
        }

        if (!workingDir) {
            return;
        }

        var term = vscode.window.createTerminal('cmd');
        term.show();
    
        term.sendText(`cd "${workingDir}"`);
        term.sendText('docker compose -f compose.frank.loc.yaml up --build');

        await this.saveRanProject("dockerCompose", workingDir);
    }
}

module.exports = StartService;