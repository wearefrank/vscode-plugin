"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class StartService {
    constructor(context) {
        this.context = context;
    }
    async getFrankRunnerPath(workingDir) {
        let currentDir = workingDir;
        while (true) {
            const potentialRunnerPath = path.join(currentDir, 'frank-runner');
            if (fs.existsSync(potentialRunnerPath)) {
                return potentialRunnerPath;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        for (const folder of workspaceFolders) {
            if (folder.name.toLowerCase() === 'frank-runner' || folder.uri.fsPath.endsWith('frank-runner')) {
                return folder.uri.fsPath;
            }
        }
        return null;
    }
    ensureRanProjectsFileExists() {
        const storageDir = this.context.globalStorageUri.fsPath;
        const ranProjectsPath = path.join(storageDir, 'ranProjects.json');
        const ranProjectsBody = {
            "ant": [],
            "dockerCompose": []
        };
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        if (!fs.existsSync(ranProjectsPath)) {
            fs.writeFileSync(ranProjectsPath, JSON.stringify(ranProjectsBody, null, 4), "utf8");
        }
    }
    async promptForConfigurationFolder() {
        // Find all Configuration.xml files in the workspace
        const configFiles = await vscode.workspace.findFiles('**/Configuration.xml', '**/node_modules/**');
        if (configFiles.length === 0) {
            vscode.window.showErrorMessage("No Frank! configurations found in the workspace.");
            return undefined;
        }
        const quickPickItems = configFiles.map(uri => {
            const dirPath = path.dirname(uri.fsPath);
            return {
                label: path.basename(dirPath),
                description: vscode.workspace.asRelativePath(dirPath),
                detail: dirPath
            };
        });
        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: "Select the configuration to run with Docker Compose"
        });
        return selected ? selected.detail : undefined;
    }
    async createFile(targetDir, file) {
        const newFilePath = path.join(targetDir, file);
        const defaultFilePath = path.join(this.context.extensionPath, 'resources', file);
        let newFileContent = fs.readFileSync(defaultFilePath, 'utf8');
        if (file === "docker-compose.yml") {
            const configName = path.basename(targetDir);
            newFileContent = newFileContent.replace(/\{\{CONFIG_NAME\}\}/g, configName);
        }
        fs.writeFileSync(newFilePath, newFileContent, "utf8");
        return true;
    }
    async getWorkingDirectory(file) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            let currentDir = path.dirname(editor.document.uri.fsPath);
            while (true) {
                if (file && fs.existsSync(path.join(currentDir, file))) {
                    return currentDir;
                }
                if (!file && (fs.existsSync(path.join(currentDir, "build.xml")) || fs.existsSync(path.join(currentDir, "Dockerfile")) || this.getComposeFile(currentDir))) {
                    return currentDir;
                }
                const parentDir = path.dirname(currentDir);
                if (parentDir === currentDir)
                    break;
                currentDir = parentDir;
            }
        }
        if (file === "docker-compose.yml") {
            const choice = await vscode.window.showInformationMessage(`No ${file} found in the immediate context. Would you like to generate one for a specific configuration?`, 'Yes', 'Cancel');
            if (choice === 'Yes') {
                const targetDir = await this.promptForConfigurationFolder();
                if (targetDir) {
                    const createdFile = await this.createFile(targetDir, file);
                    return createdFile ? targetDir : null;
                }
            }
            return null;
        }
        return undefined;
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
        ranProjectsJSON[method] = ranProjectsJSON[method].filter((project) => project.path !== workingDir);
        fs.writeFileSync(ranProjectsPath, JSON.stringify(ranProjectsJSON, null, 4), 'utf8');
    }
    async saveRanProject(method, workingDir) {
        const ranProjectsPath = path.join(this.context.globalStorageUri.fsPath, 'ranProjects.json');
        const ranProjects = fs.readFileSync(ranProjectsPath, 'utf8');
        let ranProjectJSON = JSON.parse(ranProjects);
        if (ranProjectJSON[method].length > 0) {
            const alreadyExists = ranProjectJSON[method].some((project) => project.path === workingDir);
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
        return false;
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
                version: match ? match[1] : ""
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
        if (fs.existsSync(frankRunnerPropertiesFile)) {
            let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
            const match = frankRunnerProperties.match(/^\s*ff\.version=.*$/m);
            const setFFversion = match ? match[0].split("=")[1] : "";
            return setFFversion;
        }
        return false;
    }
    async startWithAnt(workingDir, isCurrent) {
        if (isCurrent) {
            workingDir = await this.getWorkingDirectory("build.xml");
        }
        if (!workingDir) {
            return;
        }
        const runnerPath = await this.getFrankRunnerPath(workingDir);
        if (!runnerPath) {
            vscode.window.showErrorMessage("Could not locate the frank-runner directory. Ensure it is cloned or added to your workspace.");
            return;
        }
        const term = vscode.window.createTerminal("Frank Ant");
        term.show();
        term.sendText(`cd "${workingDir}"`);
        const antBatPath = path.join(runnerPath, "ant.bat");
        term.sendText(`& "${antBatPath}"`);
        await this.saveRanProject("ant", workingDir);
    }
    async startWithDockerCompose(workingDir, isCurrent) {
        if (isCurrent) {
            workingDir = await this.getWorkingDirectory("docker-compose.yml");
        }
        if (!workingDir) {
            return;
        }
        const term = vscode.window.createTerminal('Frank! Docker Compose');
        term.show();
        term.sendText(`cd "${workingDir}"`);
        const composeFileName = this.getComposeFile(workingDir) || "docker-compose.yml";
        term.sendText(`docker-compose -f <composeFileName> up`);
        await this.saveRanProject("dockerCompose", workingDir);
    }
}
exports.default = StartService;
//# sourceMappingURL=start-service.js.map