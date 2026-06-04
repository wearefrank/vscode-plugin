import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as fs from 'fs'; // kept for ffVersionSet / updateStrategySet / getSetFFVersion (called from sync constructor)
import * as path from 'path';
import { exec } from 'child_process';

class StartService {
    context: vscode.ExtensionContext;
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private async exists(p: string): Promise<boolean> {
        try { await fsp.access(p); return true; } catch { return false; }
    }

    // Returns true when projectPath is the workspace root itself or a direct child of one.
    // This prevents deeply-nested demo/example projects (e.g. frank-runner/examples/*)
    // from appearing as startable items alongside real application projects.
    private isShallowProject(projectPath: string): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        return workspaceFolders.some(folder => {
            const rel = path.relative(folder.uri.fsPath, projectPath);
            return rel === '' || (!rel.startsWith('..') && !rel.includes(path.sep));
        });
    }

    async discoverAntProjects(): Promise<string[]> {
        const buildFiles = await vscode.workspace.findFiles('**/build.xml', '**/node_modules/**');
        return buildFiles
            .map(uri => path.dirname(uri.fsPath))
            .filter(p => this.isShallowProject(p));
    }

    async discoverDockerProjects(): Promise<string[]> {
        const [mavenFiles, simpleFiles] = await Promise.all([
            vscode.workspace.findFiles('**/src/main/configurations/**', '**/node_modules/**'),
            vscode.workspace.findFiles('**/configurations/*/Configuration.xml', '**/node_modules/**'),
        ]);

        const projectRoots = new Set<string>();

        const mavenMarker = `${path.sep}src${path.sep}main${path.sep}configurations`;
        for (const file of mavenFiles) {
            const idx = file.fsPath.indexOf(mavenMarker);
            if (idx !== -1) projectRoots.add(file.fsPath.substring(0, idx));
        }

        const simpleMarker = `${path.sep}configurations${path.sep}`;
        for (const file of simpleFiles) {
            const idx = file.fsPath.indexOf(simpleMarker);
            if (idx !== -1) projectRoots.add(file.fsPath.substring(0, idx));
        }

        // Drop sub-paths produced by the simple-layout glob accidentally matching Maven paths.
        const roots = Array.from(projectRoots);
        return roots
            .filter(r => !roots.some(other => other !== r && r.startsWith(other + path.sep)))
            .filter(r => this.isShallowProject(r));
    }

    async detectConfigurationsDir(projectRoot: string): Promise<string> {
        const candidates = ['src/main/configurations', 'configurations'];
        for (const candidate of candidates) {
            if (await this.exists(path.join(projectRoot, candidate))) {
                return candidate;
            }
        }
        return candidates[0];
    }

    async getFrankRunnerPath(workingDir: string): Promise<string | null> {
        let currentDir = workingDir;

        while (true) {
            const potentialRunnerPath = path.join(currentDir, 'frank-runner');
            if (await this.exists(potentialRunnerPath)) {
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

    async createFile(targetDir: string, file: string): Promise<boolean> {
        const newFilePath = path.join(targetDir, file);
        const defaultFilePath = path.join(this.context.extensionPath, 'resources', file);
        let content = await fsp.readFile(defaultFilePath, 'utf8');

        if (file === 'docker-compose.yml') {
            const configsDir = await this.detectConfigurationsDir(targetDir);
            content = content.replace('{{CONFIGURATIONS_DIR}}', `./${configsDir}`);
        }

        await fsp.writeFile(newFilePath, content, 'utf8');
        return true;
    }

    // Walks up from the active editor looking for a project root containing build.xml (Ant).
    async getAntWorkingDirectory(): Promise<string | null> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;

        let currentDir = path.dirname(editor.document.uri.fsPath);
        while (true) {
            if (await this.exists(path.join(currentDir, 'build.xml'))) {
                return currentDir;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }
        return null;
    }

    // Walks up from the active editor looking for a project root containing a known configurations folder.
    async getDockerWorkingDirectory(): Promise<string | null> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;

        let currentDir = path.dirname(editor.document.uri.fsPath);
        while (true) {
            if (
                await this.exists(path.join(currentDir, 'src', 'main', 'configurations')) ||
                await this.exists(path.join(currentDir, 'configurations'))
            ) {
                return currentDir;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }
        return null;
    }

    async getComposeFile(dir: string): Promise<string | null> {
        const isComposeFile = (filename: string) =>
            filename.toLowerCase() == "docker-compose.yaml" || filename.toLowerCase() == "docker-compose.yml";

        const files = await fsp.readdir(dir);
        return files.find(isComposeFile) ?? null;
    }

    isFrameworkFile(file: string) {
        if (file.startsWith('frankframework-webapp')) {
            return true;
        }

        if (file.startsWith('ibis-adapterframework-webapp')) {
            return true;
        }

        return false;
    }

    async toggleUpdate(workingDir: string) {
        const FFOptions: string[] = [];
        FFOptions.push("Highest Online Version");
        FFOptions.push("Highest Stable Online Version");
        for (const file of await this.getLocalFFVersions(workingDir)) {
            FFOptions.push(file.version);
        }
        const ffOption = await vscode.window.showQuickPick(FFOptions, {placeHolder: "Pick a FF! version"});
        if (!ffOption) return;

        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");
        let newLine = ` `;

        switch (ffOption) {
            case "Highest Online Version":
                if (await this.exists(frankRunnerPropertiesFile)) {
                    let frankRunnerProperties = await fsp.readFile(frankRunnerPropertiesFile, "utf8");

                    if (this.ffVersionSet(workingDir) || this.updateStrategySet(workingDir)) {
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*ff\.version=.*$/gm, "")
                            .trim();
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*update\.strategy=.*$/gm, "")
                            .trim();
                        await fsp.writeFile(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                    }
                }
                break;
            case "Highest Stable Online Version":
                newLine = `\nupdate.strategy=stable`;

                if (await this.exists(frankRunnerPropertiesFile)) {
                    let frankRunnerProperties = await fsp.readFile(frankRunnerPropertiesFile, "utf8");

                    if (!this.updateStrategySet(workingDir)) {
                        if (this.ffVersionSet(workingDir)) {
                            frankRunnerProperties = frankRunnerProperties
                                .replace(/^\s*ff\.version=.*$/gm, "")
                                .trim();
                            await fsp.writeFile(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                            await fsp.appendFile(frankRunnerPropertiesFile, newLine, "utf8");
                        } else {
                            await fsp.appendFile(frankRunnerPropertiesFile, newLine, "utf8");
                        }
                    }
                } else {
                    await fsp.writeFile(frankRunnerPropertiesFile, newLine, "utf8");
                }
                break;
            default:
                newLine = `ff.version=${ffOption}`;

                if (await this.exists(frankRunnerPropertiesFile)) {
                    let frankRunnerProperties = await fsp.readFile(frankRunnerPropertiesFile, "utf8");

                    if (this.ffVersionSet(workingDir) || this.updateStrategySet(workingDir)) {
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*ff\.version=.*$/gm, "")
                            .trim();
                        frankRunnerProperties = frankRunnerProperties
                            .replace(/^\s*update\.strategy=.*$/gm, "")
                            .trim();
                        await fsp.writeFile(frankRunnerPropertiesFile, frankRunnerProperties, "utf8");
                        await fsp.appendFile(frankRunnerPropertiesFile, "\n" + newLine, "utf8");
                    } else {
                        await fsp.appendFile(frankRunnerPropertiesFile, "\n" + newLine, "utf8");
                    }
                } else {
                    await fsp.writeFile(frankRunnerPropertiesFile, newLine, "utf8");
                }
        }
    }

    async getLocalFFVersions(workingDir: string) {
        let downloadDir: string;

        if (workingDir.includes(`frank-runner${path.sep}examples`)) {
            downloadDir = path.join(workingDir, "../../download");
        } else {
            downloadDir = path.join(workingDir, "../frank-runner/download");
        }

        if (!await this.exists(downloadDir)) return [];

        const versionRegex = /(\d+(?:\.\d+)*(?:-\d+\.\d+)?)/;
        const files = await fsp.readdir(downloadDir);

        return files
            .filter(f => /^(frankframework|ibis).*\.war$/.test(f))
            .map(f => {
                const match = f.match(versionRegex);
                return { file: f, version: match ? match[1] : "" };
            })
            .filter(e => e.version);
    }

    // The three methods below stay synchronous — they are called from the
    // ProjectTreeItem constructor in start-tree-provider, which cannot be async.
    updateStrategySet(workingDir: string) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");

        if (fs.existsSync(frankRunnerPropertiesFile)) {
            const frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
            return /^\s*update\.strategy=stable.*$/m.test(frankRunnerProperties);
        }

        return false;
    }

    ffVersionSet(workingDir: string) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");

        if (fs.existsSync(frankRunnerPropertiesFile)) {
            const frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
            return /^\s*ff\.version=.*$/m.test(frankRunnerProperties);
        }

        return false;
    }

    getSetFFVersion(workingDir: string) {
        const frankRunnerPropertiesFile = path.join(workingDir, "frank-runner.properties");

        if (fs.existsSync(frankRunnerPropertiesFile)) {
            const frankRunnerProperties = fs.readFileSync(frankRunnerPropertiesFile, "utf8");
            const match = frankRunnerProperties.match(/^\s*ff\.version=.*$/m);
            return match ? match[0].split("=")[1] : "";
        }

        return false;
    }

    private async isDockerAvailable(): Promise<boolean> {
        return new Promise(resolve => {
            exec('docker --version', (error) => resolve(!error));
        });
    }

    async startWithAnt(workingDir: string | null) {
        if (!workingDir) {
            vscode.window.showErrorMessage("No Frank project found. Open a file inside a Frank project (containing build.xml).");
            return;
        }

        const runnerPath = await this.getFrankRunnerPath(workingDir);
        if (!runnerPath) {
            vscode.window.showErrorMessage("Could not locate the frank-runner directory. Ensure it is cloned or added to your workspace.");
            return;
        }

        // STEP 1: Verify the ant launch script exists before opening a terminal
        const antScript = process.platform === 'win32' ? 'ant.bat' : 'ant';
        const antScriptPath = path.join(runnerPath, antScript);
        if (!await this.exists(antScriptPath)) {
            vscode.window.showErrorMessage(`frank-runner found but '${antScript}' is missing. Ensure frank-runner is fully set up at: ${runnerPath}`);
            return;
        }

        // STEP 2: Launch
        const term = vscode.window.createTerminal("Frank Ant");
        term.show();
        term.sendText(`cd "${workingDir}"`);
        if (process.platform === 'win32') {
            term.sendText(`& "${antScriptPath}"`);
        } else {
            term.sendText(`bash "${antScriptPath}"`);
        }
    }

    async startWithDockerCompose(workingDir: string | null) {
        if (!workingDir) {
            vscode.window.showErrorMessage("No Frank project found. Open a file inside a project containing src/main/configurations.");
            return;
        }

        // STEP 1: Verify Docker is installed and reachable
        if (!await this.isDockerAvailable()) {
            vscode.window.showErrorMessage("Docker is not available. Ensure Docker Desktop is installed and running.");
            return;
        }

        // STEP 2: Find or generate docker-compose.yml at the project root
        let composeFileName = await this.getComposeFile(workingDir);
        if (!composeFileName) {
            const choice = await vscode.window.showInformationMessage(
                "No docker-compose file found in the project root. Would you like to generate one?",
                'Yes',
                'Cancel'
            );
            if (choice !== 'Yes') return;

            await this.createFile(workingDir, "docker-compose.yml");
            composeFileName = "docker-compose.yml";
        }

        // STEP 3: Launch docker-compose from the project root
        const term = vscode.window.createTerminal('Frank! Docker Compose');
        term.show();
        term.sendText(`cd "${workingDir}"`);
        term.sendText(`docker-compose -f "${composeFileName}" up`);
    }
}

export default StartService;
