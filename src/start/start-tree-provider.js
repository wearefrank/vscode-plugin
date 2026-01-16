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
            await this.rebuild();
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

    getChildren(snippet) {
        if (snippet) {
            return snippet.getProjectTreeItems();
        } else {
            return this.startTreeItems;
        }
    }
}

class StartTreeItem extends vscode.TreeItem {
    constructor(label, projects, method, collapsibleState) {
        super(label, collapsibleState);
        this.projects = projects;
        this.method = method;
        this.projectTreeItems = [];
        this.contextValue = `startTreeItem-${method}`;

        this.convertSnippetToSnippetTreeItems();
    }

    convertSnippetToSnippetTreeItems() {
        const arr = [];

        this.projects.forEach((project) => {
            arr.push(new ProjectTreeItem(project.project, project.path, this.method));
        });

        this.projectTreeItems = arr;
    }

    getProjectTreeItems() {
        return this.projectTreeItems;
    }

    setProjectTreeItems(projectTreeItems) {
        this.projectTreeItems = projectTreeItems;
    }
}

class ProjectTreeItem extends vscode.TreeItem {
    constructor(project, path, method) {
        super(project);
        this.path = path;
        this.method = method;
        this.contextValue = "projectTreeItem";
    }
}

module.exports = {
  StartTreeProvider,
  ProjectTreeItem
};