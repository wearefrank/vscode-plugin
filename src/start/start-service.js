"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class StartService {
    constructor(context) {
        this.context = context;
    }
    ensureRanProjectsFileExists() {
        const storageDir = this.context.globalStorageUri.fsPath;
        const ranProjectsPath = path.join(storageDir, 'ranProjects.json');
        const ranProjectsBody = {
            "ant": [],
            "docker": [],
            "dockerCompose": []
        };
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        if (!fs.existsSync(ranProjectsPath)) {
            fs.writeFileSync(ranProjectsPath, JSON.stringify(ranProjectsBody, null, 4), "utf8");
        }
    }
    async createFile(workspaceRoot, file) {
        const newFilePath = path.join(workspaceRoot, file);
        const defaultFilePath = path.join(this.context.extensionPath, 'resources', file);
        let newFile = fs.readFileSync(defaultFilePath, 'utf8');
        if (file === "compose.frank.yaml") {
            if (workspaceRoot.toLowerCase().endsWith('\\frank-runner')) {
                vscode.window.showErrorMessage("Please add the compose.frank.yaml manually.");
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
            return;
        }
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
            return undefined;
        }
        let workspaceRoot = workspaceFolder.uri.fsPath;
        let currentDir = path.dirname(editor.document.uri.fsPath);
        let lastDir = currentDir;
        while (true) {
            if (!file) {
                if (fs.existsSync(path.join(currentDir, "build.xml")) || fs.existsSync(path.join(currentDir, "Dockerfile")) || this.getComposeFile(currentDir) != null) {
                    return currentDir;
                }
            }
            else if (file != "compose.frank.yaml") {
                if (fs.existsSync(path.join(currentDir, file))) {
                    return currentDir;
                }
            }
            else if (this.getComposeFile(currentDir) != null) {
                return currentDir;
            }
            if (path.normalize(currentDir).endsWith(path.normalize("frank-runner/examples"))) {
                workspaceRoot = currentDir;
            }
            if (currentDir === workspaceRoot) {
                if (!file) {
                    return undefined;
                }
                const choice = await vscode.window.showInformationMessage(`${file} doesn\'t exist in the current project. Create it?`, 'Yes', 'Cancel');
                if (choice === 'Yes') {
                    const createdFile = await this.createFile(lastDir, file);
                    return createdFile ? lastDir : null;
                }
                else {
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
    getComposeFile(dir) {
        const isComposeFile = (filename) => filename.toLowerCase().includes("compose") &&
            (filename.endsWith(".yml") || filename.endsWith(".yaml"));
        const files = fs.readdirSync(dir);
        const composeFile = files.find(isComposeFile);
        if (composeFile) {
            return composeFile;
        }
        return null;
    }
    async deleteRanProject(method, workingDir) {
        const ranProjectsPath = path.join(this.context.globalStorageUri.fsPath, 'ranProjects.json');
        const ranProjectsFile = await fs.readFileSync(ranProjectsPath, 'utf8');
        let ranProjectsJSON = JSON.parse(ranProjectsFile);
        ranProjectsJSON[method] = ranProjectsJSON[method].filter(project => project.path !== workingDir);
        fs.writeFileSync(ranProjectsPath, JSON.stringify(ranProjectsJSON, null, 4), 'utf8');
    }
    async saveRanProject(method, workingDir) {
        const ranProjectsPath = path.join(this.context.globalStorageUri.fsPath, 'ranProjects.json');
        const ranProjects = fs.readFileSync(ranProjectsPath, 'utf8');
        let ranProjectJSON = JSON.parse(ranProjects);
        if (ranProjectJSON[method].length > 0) {
            const alreadyExists = ranProjectJSON[method].some(project => project.path === workingDir);
            if (alreadyExists) {
                return;
            }
        }
        const newRanProjectBody = {
            project: path.basename(workingDir),
            path: workingDir
        };
        ranProjectJSON[method].push(newRanProjectBody);
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
    async toggleUpdate(workingDir) {
        const FFOptions = [];
        FFOptions.push("Highest Online Version");
        FFOptions.push("Highest Stable Online Version");
        for (let file of this.getLocalFFVersions(workingDir)) {
            FFOptions.push(file.version);
        }
        const ffOption = await vscode.window.showQuickPick(FFOptions, { placeHolder: "Pick a FF! version" });
        if (!ffOption)
            return;
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");
        let newLine = ` `;
        switch (ffOption) {
            case "Highest Online Version":
                if (fs.existsSync(frankRunnerPropertiesFile)) {
                    let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
                    if (this.ffVersionSet(workingDir) || this.updateStrategySet(workingDir)) {
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*ff\.version=.*$/gm, "")
                            .trim();
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*update\.strategy=.*$/gm, "")
                            .trim();
                        fs.writeFileSync(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                    }
                }
                break;
            case "Highest Stable Online Version":
                newLine = `\nupdate.strategy=stable`;
                if (fs.existsSync(frankRunnerPropertiesFile)) {
                    let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
                    if (!this.updateStrategySet(workingDir)) {
                        if (this.ffVersionSet(workingDir)) {
                            frankRunnerProperties = frankRunnerProperties
                                .replace(/^\s*ff\.version=.*$/gm, "")
                                .trim();
                            fs.writeFileSync(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                            fs.appendFileSync(frankRunnerPropertiesFile, newLine, "utf8");
                        }
                        else {
                            fs.appendFileSync(frankRunnerPropertiesFile, newLine, "utf8");
                        }
                    }
                }
                else {
                    fs.writeFileSync(frankRunnerPropertiesFile, newLine, "utf8");
                }
                break;
            default:
                newLine = `ff.version=${ffOption}`;
                if (fs.existsSync(frankRunnerPropertiesFile)) {
                    let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
                    if (this.ffVersionSet(workingDir) || this.updateStrategySet(workingDir)) {
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*ff\.version=.*$/gm, "")
                            .trim();
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*update\.strategy=.*$/gm, "")
                            .trim();
                        fs.writeFileSync(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                        fs.appendFileSync(frankRunnerPropertiesFile, "\n" + newLine, "utf8");
                    }
                    else {
                        fs.appendFileSync(frankRunnerPropertiesFile, "\n" + newLine, "utf8");
                    }
                }
                else {
                    fs.writeFileSync(frankRunnerPropertiesFile, newLine, "utf8");
                }
        }
    }
    getLocalFFVersions(workingDir) {
        let downloadDir;
        if (workingDir.includes("frank-runner\\examples")) {
            downloadDir = path.join(workingDir, "../../download");
        }
        else {
            downloadDir = path.join(workingDir, "../frank-runner/download");
        }
        if (!fs.existsSync(downloadDir))
            return [];
        const versionRegex = /(\d+(?:\.\d+)*(?:-\d+\.\d+)?)/;
        return fs.readdirSync(downloadDir)
            .filter(f => /^(frankframework|ibis).*\.war$/.test(f))
            .map(f => {
            const match = f.match(versionRegex);
            return {
                file: f,
                version: match[1]
            };
        })
            .filter(e => e.version);
    }
    updateStrategySet(workingDir) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");
        if (fs.existsSync(frankRunnerPropertiesFile)) {
            let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
            const hasActiveStableStrategy = /^\s*update\.strategy=stable.*$/m.test(frankRunnerProperties);
            return hasActiveStableStrategy;
        }
        return false;
    }
    ffVersionSet(workingDir) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");
        if (fs.existsSync(frankRunnerPropertiesFile)) {
            let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
            const hasActiveFFVersion = /^\s*ff\.version=.*$/m.test(frankRunnerProperties);
            return hasActiveFFVersion;
        }
        return false;
    }
    getSetFFVersion(workingDir) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");
        let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
        const setFFversion = frankRunnerProperties.match(/^\s*ff\.version=.*$/m)[0].split("=")[1];
        return setFFversion;
    }
    async startWithAnt(workingDir, isCurrent) {
        if (isCurrent) {
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
        }
        else {
            term.sendText(`../frank-runner/ant.bat`);
        }
        await this.saveRanProject("ant", workingDir);
    }
    async startWithDocker(workingDir, isCurrent) {
        if (isCurrent) {
            workingDir = await this.getWorkingDirectory("Dockerfile");
        }
        if (!workingDir) {
            return;
        }
        const projectName = path.basename(workingDir).toLocaleLowerCase();
        var term = vscode.window.createTerminal('cmd');
        term.show();
        term.sendText(`cd "${workingDir}"`);
        term.sendText(`docker build -t ${projectName} .`);
        term.sendText(`docker rm ${projectName}-container`);
        term.sendText(`docker run --name ${projectName}-container ${projectName}`);
        await this.saveRanProject("docker", workingDir);
    }
    async startWithDockerCompose(workingDir, isCurrent) {
        if (isCurrent) {
            workingDir = await this.getWorkingDirectory("compose.frank.yaml");
        }
        if (!workingDir) {
            return;
        }
        const term = vscode.window.createTerminal('cmd');
        term.show();
        term.sendText(`cd "${workingDir}"`);
        term.sendText(`docker compose -f ${this.getComposeFile(workingDir)} --build`);
        await this.saveRanProject("dockerCompose", workingDir);
    }
}
exports.default = StartService;
//# sourceMappingURL=start-service.js.map