const vscode = require("vscode");
const fs = require('fs');
const path = require('path');

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

        for (let folder of workspaceFolders) {
            if (ranProjectJSON.hasOwnProperty(folder.uri.fsPath)) {
                if (ranProjectJSON[folder.uri.fsPath][0].hasOwnProperty("ant")) {
                    let existingProjectAnt = ranProjectJSON[folder.uri.fsPath][0].ant;
                    existingProjectsAnt.push(...existingProjectAnt);
                }
                
                if (ranProjectJSON[folder.uri.fsPath][0].hasOwnProperty("docker")) {
                    let existingProjectDocker = ranProjectJSON[folder.uri.fsPath][0].docker;
                    existingProjectsDocker.push(...existingProjectDocker);
                }

                if (ranProjectJSON[folder.uri.fsPath][0].hasOwnProperty("dockerCompose")) {
                    let existingProjectDockerCompose = ranProjectJSON[folder.uri.fsPath][0].dockerCompose;
                    existingProjectsDockerCompose.push(...existingProjectDockerCompose);
                }
            }
        }

        const antTreeItem = new StartTreeItem(`Start with Ant`, existingProjectsAnt, "ant", vscode.TreeItemCollapsibleState.Expanded);
        const dockerTreeItem = new StartTreeItem("Start with Docker", existingProjectsDocker, "docker", vscode.TreeItemCollapsibleState.Expanded);
        const dockerComposeTreeItem = new StartTreeItem("Start with Docker Compose", existingProjectsDockerCompose, "dockerCompose", vscode.TreeItemCollapsibleState.Expanded);

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
            return element.projects.map(
                p => new ProjectTreeItem(p.project, p.path, element.method)
            );
        }

        return [];
    }
}

class StartTreeItem extends vscode.TreeItem {
    constructor(label, projects, method, collapsibleState) {
        super(label, collapsibleState);
        this.projects = projects;
        this.method = method;
        this.contextValue = `startTreeItem`;

    }
}

class ProjectTreeItem extends vscode.TreeItem {
    constructor(project, path, method) {
        super(project);
        this.path = path;
        this.method = method;
        this.contextValue = `projectTreeItem-${method}`;

        if (method === "ant") {
            this.doUpdate = this.ffVersionSet();

            this.tooltip = this.doUpdate
                ? `Using Highest Online FF! Version. Right-Click to Toggle.`
                : `Using Highest Local FF! Version (Download Disabled). Right-Click to Toggle.`;

            this.label = this.doUpdate
                ? `${project} ⭳`
                : `${project} 🖫`;
        }
    }

    ffVersionSet() {
        const frankRunnerPropertiesFile = path.join(this.path, "frank-runner.properties");

        if (!fs.existsSync(frankRunnerPropertiesFile)) {
            return true;
        }
        let frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");

        const hasActiveFFVersion = /^\s*ff\.version=.*$/m.test(frankRunnerProperties);

        return hasActiveFFVersion;
    }
}

module.exports = {
  StartTreeProvider,
  ProjectTreeItem
};