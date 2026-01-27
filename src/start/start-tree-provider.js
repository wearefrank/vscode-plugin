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
            return element.projects.map(
                p => new ProjectTreeItem(p.project, p.path, element.method, this.startService)
            );
        }

        return [];
    }
}

class StartTreeItem extends vscode.TreeItem {
    constructor(label, projects, method, collapsibleState, startService, workingDir) {
        super(label, collapsibleState);
        this.projects = projects;
        this.method = method;
        this.contextValue = `startTreeItem-${method}`;
        this.startService = startService;
        this.path = "";
        // this.a = await startService.getWorkingDirectory();


        // if (method === "ant") {
        //     this.tooltip = this.startService.ffVersionSet(this.a)
        //         ? `Using Local FF! Version (Download Disabled). Right-Click to Change.`
        //         : `Using Highest Online FF! Version. Right-Click to Change.`;
            
        //     if (this.startService.updateStrategySet(this.a)) {
        //         this.tooltip = "Using Highest Stable Online FF! Version. Right-Click to Change."
        //     }
            
        //     this.label = this.startService.ffVersionSet(this.a)
        //         ? `${path.basename(this.a)} 🗁 ${this.startService.getSetFFVersion(this.a)}`
        //         : `${path.basename(this.a)} ⭳`;

        //     if (this.startService.updateStrategySet(this.a)) {
        //         this.label = `${path.basename(this.a)} [⭳]`
        //     }
        // }
        if (method === "ant"){
            this.set();
        }
    
    }

    async set() {
        console.log("a");
        let a = await this.startService.getWorkingDirectory();
        console.log(a);
        this.path = a;
    
        this.tooltip = this.startService.ffVersionSet(a)
            ? `Using Local FF! Version (Download Disabled). Right-Click to Change.`
            : `Using Highest Online FF! Version. Right-Click to Change.`;
        
        if (this.startService.updateStrategySet(a)) {
            this.tooltip = "Using Highest Stable Online FF! Version. Right-Click to Change."
        }
        
        this.description = this.startService.ffVersionSet(a)
            ? `${path.basename(a)} 🗁 ${this.startService.getSetFFVersion(a)}`
            : `${path.basename(a)} ⭳`;

        if (this.startService.updateStrategySet(a)) {
            this.description = `${path.basename(a)} [⭳]`
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
                this.tooltip = "Using Highest Stable Online FF! Version. Right-Click to Change."
            }
            
            this.label = startService.ffVersionSet(path)
                ? `${project} 🗁 ${startService.getSetFFVersion(path)}`
                : `${project} ⭳`;

            if (startService.updateStrategySet(path)) {
                this.label = `${project} [⭳]`
            }
        }
    }
}

module.exports = {
  StartTreeProvider,
  ProjectTreeItem
};