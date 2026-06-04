import * as vscode from 'vscode';
import * as path from 'path';
import StartService from './start-service';

interface Project {
    project: string;
    path: string;
}

class StartTreeProvider {
    context: vscode.ExtensionContext;
    startService: StartService;
    _onDidChangeTreeData: vscode.EventEmitter<null>;
    onDidChangeTreeData: vscode.Event<null>;
    startTreeItems: StartTreeItem[] = [];

    constructor(context: vscode.ExtensionContext, startService: StartService) {
        this.context = context;
        this.startService = startService;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        vscode.window.onDidChangeActiveTextEditor(async () => {
            await this.rebuild();
            this.refresh();
        });

        void this.rebuild().then(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
    }

    async rebuild(): Promise<void> {
        const [antPaths, dockerPaths] = await Promise.all([
            this.startService.discoverAntProjects(),
            this.startService.discoverDockerProjects()
        ]);

        const antProjects: Project[] = antPaths.map((p) => ({ project: path.basename(p), path: p }));
        const dockerProjects: Project[] = dockerPaths.map((p) => ({ project: path.basename(p), path: p }));

        const antTreeItem = new StartTreeItem('Start with Ant', antProjects, 'ant', vscode.TreeItemCollapsibleState.Expanded, this.startService);
        const dockerComposeTreeItem = new StartTreeItem('Start with Docker Compose', dockerProjects, 'dockerCompose', vscode.TreeItemCollapsibleState.Expanded, this.startService);

        this.startTreeItems = [antTreeItem, dockerComposeTreeItem];
    }

    getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
        return item;
    }

    getChildren(element?: StartTreeItem | ProjectTreeItem): (StartTreeItem | ProjectTreeItem)[] {
        if (!element) {
            return this.startTreeItems;
        }

        if (element instanceof StartTreeItem) {
            return element.projects.map(
                (p) => new ProjectTreeItem(p.project, p.path, element.method, this.startService)
            );
        }

        return [];
    }
}

class StartTreeItem extends vscode.TreeItem {
    projects: Project[];
    method: string;
    startService: StartService;

    constructor(label: string, projects: Project[], method: string, collapsibleState: vscode.TreeItemCollapsibleState, startService: StartService) {
        super(label, collapsibleState);
        this.projects = projects;
        this.method = method;
        this.contextValue = `startTreeItem-${method}`;
        this.startService = startService;
    }
}

class ProjectTreeItem extends vscode.TreeItem {
    path: string;
    method: string;
    startService: StartService;

    constructor(project: string, projectPath: string, method: string, startService: StartService) {
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

export { StartTreeProvider, ProjectTreeItem };
