const vscode = require("vscode");
const fs = require('fs');
const path = require('path');

const { ProjectTreeItem } = require("./start-tree-provider.js");

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
        if(!editor) {
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
            return undefined;
        }
        const workspaceRoot = workspaceFolder.uri.fsPath;

        let currentDir = path.dirname(editor.document.uri.fsPath);
        let lastDir = currentDir;

        const isComposeFile = (filename) =>
            filename.toLowerCase().includes("compose") &&
            (filename.endsWith(".yml") || filename.endsWith(".yaml"));

        while (true) {
            if (file) {
                const matches = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(currentDir, file),
                    null,
                    1
                );

                if (matches.length > 0) {
                    return currentDir;
                }
            } else {
                if (fs.existsSync(path.join(currentDir, "build.xml"))) {
                    return currentDir;
                }

                if (fs.existsSync(path.join(currentDir, "Dockerfile"))) {
                    return currentDir;
                }

                const files = fs.readdirSync(currentDir);
                if (files.some(isComposeFile)) {
                    return currentDir;
                }
            }

            if (currentDir === workspaceRoot) {
                if (!file) {
                    return undefined;
                }

                 const choice = await vscode.window.showInformationMessage(
                    `${file} doesn\'t exist in the current project. Create it?`,
                    'Yes',
                    'Cancel'
                );
                
                if (choice === 'Yes') {
                    const createdFile = await this.createFile(lastDir, file);
                    return createdFile ? lastDir: null;
                } else {
                    return null;
                }
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                return undefined;
            }

            lastDir = currentDir;
            currentDir = parentDir;
        }
    }

    async deleteRanProject(method, workingDir) {
        const ranProjectsPath = path.join(this.context.globalStorageUri.fsPath, 'ranProjects.json');
        const ranProjectsFile = await fs.readFileSync(ranProjectsPath, 'utf8');
        let ranProjectsJSON = JSON.parse(ranProjectsFile);

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor");
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) return;

        const workspaceRootBasename = workspaceFolder.uri.fsPath;

        ranProjectsJSON[workspaceRootBasename][0][method] = ranProjectsJSON[workspaceRootBasename][0][method].filter(
            project => project.path !== workingDir
        );

        fs.writeFileSync(ranProjectsPath, JSON.stringify(ranProjectsJSON, null, 4), "utf8");
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

        const workspaceRootBasename = workspaceFolder.uri.fsPath;

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

    toggleUpdate(workingDir) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");

        if (fs.existsSync(frankRunnerPropertiesFile)) {
            let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");

            const hasActiveFFVersion = /^\s*ff\.version=.*$/m.test(frankRunnerProperties);

            if (hasActiveFFVersion) {
                frankRunnerProperties = frankRunnerProperties
                .replace(/^\s*ff\.version=.*$/gm, "")
                .trim();

                fs.writeFileSync(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                return;
            } else {
                const ffVersion = this.getLocalFFVersion(workingDir);
                if (!ffVersion) return;

                const newLine = `ff.version=${ffVersion}`;

                if (fs.existsSync(frankRunnerPropertiesFile)) {
                    fs.appendFileSync(frankRunnerPropertiesFile, "\n" + newLine, "utf8");
                } 
            }
        } else {
            const ffVersion = this.getLocalFFVersion(workingDir);
            if (!ffVersion) return;

            const newLine = `ff.version=${ffVersion}`;
            
            fs.writeFileSync(frankRunnerPropertiesFile, newLine, "utf8");
        }
    }

    getLocalFFVersion(workingDir) {
        let downloadDir;

        if (workingDir.includes("frank-runner\\examples")) {
            downloadDir = path.join(workingDir, "../../download");
        } else {
            downloadDir = path.join(workingDir, "../frank-runner/download");
        }

        if (!fs.existsSync(downloadDir)) return null;

        const files = fs.readdirSync(downloadDir)
            .filter(f => f.match(/frankframework.*\.war$/));

        const match = files[0]?.match(/(\d+(?:\.\d+)*-\d+\.\d+)/);
        return match?.[1] ?? null;
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