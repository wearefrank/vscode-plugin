"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTreeItem = exports.StartTreeProvider = void 0;
const vscode = require("vscode");
const path = require("path");
class StartTreeProvider {
    constructor(context, startService) {
        this.startTreeItems = [];
        this.context = context;
        this.startService = startService;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        vscode.window.onDidChangeActiveTextEditor(async () => {
            await this.rebuild();
            this.refresh();
        });
        this.rebuild().then(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire(null);
    }
    async rebuild() {
        const [antPaths, dockerPaths] = await Promise.all([
            this.startService.discoverAntProjects(),
            this.startService.discoverDockerProjects()
        ]);
        const antProjects = antPaths.map((p) => ({ project: path.basename(p), path: p }));
        const dockerProjects = dockerPaths.map((p) => ({ project: path.basename(p), path: p }));
        const antTreeItem = new StartTreeItem('Start with Ant', antProjects, 'ant', vscode.TreeItemCollapsibleState.Expanded, this.startService);
        const dockerComposeTreeItem = new StartTreeItem('Start with Docker Compose', dockerProjects, 'dockerCompose', vscode.TreeItemCollapsibleState.Expanded, this.startService);
        this.startTreeItems = [antTreeItem, dockerComposeTreeItem];
    }
    getTreeItem(item) {
        return item;
    }
    getChildren(element) {
        if (!element) {
            return this.startTreeItems;
        }
        if (element instanceof StartTreeItem) {
            return element.projects.map((p) => new ProjectTreeItem(p.project, p.path, element.method, this.startService));
        }
        return [];
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
    }
}
class ProjectTreeItem extends vscode.TreeItem {
    constructor(project, projectPath, method, startService) {
        super(project);
        this.path = projectPath;
        this.method = method;
        this.startService = startService;
        this.contextValue = `projectTreeItem-${method}`;
        if (method === "ant") {
            this.tooltip = startService.ffVersionSet(projectPath)
                ? `Using Local FF! Version (Download Disabled). Right-Click to Change.\n${projectPath}`
                : `Using Highest Online FF! Version. Right-Click to Change.\n${projectPath}`;
            if (startService.updateStrategySet(projectPath)) {
                this.tooltip = `Using Highest Stable Online FF! Version. Right-Click to Change.\n${projectPath}`;
            }
            this.label = startService.ffVersionSet(projectPath)
                ? `${project} 🗁 ${startService.getSetFFVersion(projectPath)}`
                : `${project} ⭳`;
            if (startService.updateStrategySet(projectPath)) {
                this.label = `${project} [⭳]`;
            }
        }
        if (method === "dockerCompose") {
            this.tooltip = projectPath;
        }
    }
}
exports.ProjectTreeItem = ProjectTreeItem;
//# sourceMappingURL=start-tree-provider.js.map