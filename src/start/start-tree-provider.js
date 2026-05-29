"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTreeItem = exports.StartTreeProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class StartTreeProvider {
    constructor(context, startService) {
        this.context = context;
        this.startService = startService;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        vscode.window.onDidChangeActiveTextEditor(async () => {
            this.rebuild();
            this.refresh();
        });
        this.rebuild();
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire(null);
    }
    rebuild() {
        this.startService.ensureRanProjectsFileExists();
        const ranProjectsPath = path.join(this.context.globalStorageUri.fsPath, 'ranProjects.json');
        const ranProjects = fs.readFileSync(ranProjectsPath, 'utf8');
        let ranProjectJSON = JSON.parse(ranProjects);
        let existingProjectsAnt = [];
        let existingProjectsDocker = [];
        let existingProjectsDockerCompose = [];
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        for (const project of ranProjectJSON.ant ?? []) {
            if (this.isInWorkspace(project.path, workspaceFolders)) {
                existingProjectsAnt.push(project);
            }
        }
        for (const project of ranProjectJSON.docker ?? []) {
            if (this.isInWorkspace(project.path, workspaceFolders)) {
                existingProjectsDocker.push(project);
            }
        }
        for (const project of ranProjectJSON.dockerCompose ?? []) {
            if (this.isInWorkspace(project.path, workspaceFolders)) {
                existingProjectsDockerCompose.push(project);
            }
        }
        const antTreeItem = new StartTreeItem(`Start with Ant`, existingProjectsAnt, "ant", vscode.TreeItemCollapsibleState.Expanded, this.startService);
        const dockerTreeItem = new StartTreeItem("Start with Docker", existingProjectsDocker, "docker", vscode.TreeItemCollapsibleState.Expanded, this.startService);
        const dockerComposeTreeItem = new StartTreeItem("Start with Docker Compose", existingProjectsDockerCompose, "dockerCompose", vscode.TreeItemCollapsibleState.Expanded, this.startService);
        this.startTreeItems = [antTreeItem, dockerTreeItem, dockerComposeTreeItem];
    }
    getTreeItem(snippet) {
        return snippet;
    }
    getChildren(element) {
        if (!element) {
            return this.startTreeItems;
        }
        if (element instanceof StartTreeItem) {
            return element.projects.map(p => new ProjectTreeItem(p.project, p.path, element.method, this.startService));
        }
        return [];
    }
    isInWorkspace(projectPath, workspaceFolders) {
        return workspaceFolders.some(folder => projectPath.startsWith(folder.uri.fsPath));
    }
}
exports.StartTreeProvider = StartTreeProvider;
class StartTreeItem extends vscode.TreeItem {
    constructor(label, projects, method, collapsibleState, startService) {
        super(label, collapsibleState);
        this.projects = projects;
        this.method = method;
        this.contextValue = `startTreeItem-${method}`;
        this.startService = startService;
        this.path = "";
        this.setPath();
        if (method == "ant") {
            this.updateDescription();
        }
    }
    async setPath() {
        let workingDir = await this.startService.getWorkingDirectory();
        this.path = workingDir;
    }
    async updateDescription() {
        let workingDir = await this.startService.getWorkingDirectory();
        if (!workingDir) {
            return;
        }
        this.tooltip = this.startService.ffVersionSet(workingDir)
            ? `Using Local FF! Version (Download Disabled). Right-Click to Change.`
            : `Using Highest Online FF! Version. Right-Click to Change.`;
        if (this.startService.updateStrategySet(workingDir)) {
            this.tooltip = "Using Highest Stable Online FF! Version. Right-Click to Change.";
        }
        this.description = this.startService.ffVersionSet(workingDir)
            ? `${path.basename(workingDir)} 🗁 ${this.startService.getSetFFVersion(workingDir)}`
            : `${path.basename(workingDir)} ⭳`;
        if (this.startService.updateStrategySet(workingDir)) {
            this.description = `${path.basename(workingDir)} [⭳]`;
        }
    }
}
class ProjectTreeItem extends vscode.TreeItem {
    constructor(project, path, method, startService) {
        super(project);
        this.path = path;
        this.method = method;
        this.startService = startService;
        this.contextValue = `projectTreeItem-${method}`;
        if (method === "ant") {
            this.tooltip = startService.ffVersionSet(path)
                ? `Using Local FF! Version (Download Disabled). Right-Click to Change.`
                : `Using Highest Online FF! Version. Right-Click to Change.`;
            if (startService.updateStrategySet(path)) {
                this.tooltip = "Using Highest Stable Online FF! Version. Right-Click to Change.";
            }
            this.label = startService.ffVersionSet(path)
                ? `${project} 🗁 ${startService.getSetFFVersion(path)}`
                : `${project} ⭳`;
            if (startService.updateStrategySet(path)) {
                this.label = `${project} [⭳]`;
            }
        }
    }
}
exports.ProjectTreeItem = ProjectTreeItem;
//# sourceMappingURL=start-tree-provider.js.map