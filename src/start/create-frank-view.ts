import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

// Nested subfolder paths created inside each configuration directory
const CONFIG_SUBFOLDERS = ['XML/XSL', 'XML/XSD', 'JSON/ds', 'JSON/jsonschema'];

const CONFIGURATION_XML = `<Configuration
\txmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
\txsi:noNamespaceSchemaLocation="../FrankConfig.xsd"
\t>
\t<Adapter name="Adapter1a">
\t\t<Receiver name="Receiver1a">
\t\t\t<ApiListener name="Listener1a" uriPattern="service1a"/>
\t\t</Receiver>
\t\t<Pipeline>
\t\t\t<EchoPipe name="HelloWorld" getInputFromFixedValue="Hello World!"/>
\t\t</Pipeline>
\t</Adapter>
</Configuration>`;

// Boilerplate starter files written into each subfolder when the option is enabled
const BOILERPLATE_FILES: Record<string, string> = {
    'XML/XSL/example.xsl': `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
\t<xsl:output method="xml" indent="yes"/>

\t<xsl:template match="/">
\t\t<!-- Transform your XML here -->
\t</xsl:template>
</xsl:stylesheet>`,
    'XML/XSD/example.xsd': `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
\t<!-- Define your XML schema here -->
</xs:schema>`,
    'JSON/ds/example-datasource.json': `{
\t"name": "example",
\t"type": "org.h2.jdbcx.JdbcDataSource",
\t"url": "jdbc:h2:mem:example;NON_KEYWORDS=VALUE;DB_CLOSE_ON_EXIT=FALSE;DB_CLOSE_DELAY=-1;"
}`,
    'JSON/jsonschema/example-schema.json': `{
\t"$schema": "http://json-schema.org/draft-07/schema#",
\t"type": "object",
\t"properties": {}
}`,
};

export function showCreateFrankView(context: vscode.ExtensionContext, template: 'simple' | 'skeleton'): void {
    const panel = vscode.window.createWebviewPanel(
        'createFrank',
        'Create a Frank!',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'resources'))
            ]
        }
    );

    const css = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'resources', 'css', 'create-frank-view-webcontent.css')
    );

    panel.webview.html = getWebviewContent(css.toString(), template);

    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'pickFolder': {
                    const uris = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Select Root Directory',
                        title: 'Choose where to create the Frank project'
                    });
                    if (uris && uris.length > 0) {
                        panel.webview.postMessage({ command: 'folderSelected', path: uris[0].fsPath });
                    }
                    break;
                }
                case 'submit': {
                    await handleSubmit(context, panel, message.frankName, message.rootDir, message.configurations, message.boilerplate, template);
                    break;
                }
            }
        },
        null,
        context.subscriptions
    );
}

async function handleSubmit(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    frankName: string,
    rootDir: string,
    configurations: string[],
    boilerplate: boolean,
    template: 'simple' | 'skeleton'
): Promise<void> {
    const targetProjectDir = path.join(rootDir, frankName);

    if (fs.existsSync(targetProjectDir)) {
        panel.webview.postMessage({ command: 'error', message: `Directory '${frankName}' already exists in the selected location.` });
        return;
    }

    if (template === 'skeleton') {
        await handleSkeletonSubmit(panel, frankName, rootDir, targetProjectDir);
    } else {
        await handleSimpleSubmit(context, panel, frankName, rootDir, targetProjectDir, configurations, boilerplate);
    }
}

async function handleSimpleSubmit(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    frankName: string,
    rootDir: string,
    targetProjectDir: string,
    configurations: string[],
    boilerplate: boolean
): Promise<void> {
    // STEP 1: Clone frank-runner if not present
    try {
        if (!fs.existsSync(path.join(rootDir, 'frank-runner'))) {
            await execAsync('git clone https://github.com/wearefrank/frank-runner.git', rootDir);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to clone frank-runner: ${error}`);
    }

    // STEP 2: Create project root and copy non-configuration template files
    const templateDir = path.join(context.extensionPath, 'resources', 'simpleFrank', 'projectName');
    fs.mkdirSync(targetProjectDir, { recursive: true });

    for (const file of ['.gitignore', 'build.xml', 'restart.bat', 'restart.sh']) {
        const src = path.join(templateDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(targetProjectDir, file));
        }
    }

    // STEP 3: Create configurations directory with one folder per config
    const configurationsDir = path.join(targetProjectDir, 'configurations');
    fs.mkdirSync(configurationsDir);

    for (const configName of configurations) {
        const configDir = path.join(configurationsDir, configName);
        fs.mkdirSync(configDir);
        fs.writeFileSync(path.join(configDir, 'Configuration.xml'), CONFIGURATION_XML, 'utf8');

        for (const subfolder of CONFIG_SUBFOLDERS) {
            fs.mkdirSync(path.join(configDir, subfolder), { recursive: true });
        }

        if (boilerplate) {
            for (const [relativePath, content] of Object.entries(BOILERPLATE_FILES)) {
                fs.writeFileSync(path.join(configDir, relativePath), content, 'utf8');
            }
        }
    }

    // STEP 4: Add project and frank-runner to workspace
    const targetProjectDirUri = vscode.Uri.file(targetProjectDir);
    const frankRunnerDirUri = vscode.Uri.file(path.join(rootDir, 'frank-runner'));
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const nextIndex = workspaceFolders.length;

    const isPathCoveredByWorkspace = (targetPath: string): boolean =>
        workspaceFolders.some(folder => {
            const relativePath = path.relative(folder.uri.fsPath, targetPath);
            return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
        });

    const foldersToAdd: { uri: vscode.Uri; name?: string }[] = [];
    if (!isPathCoveredByWorkspace(targetProjectDirUri.fsPath)) {
        foldersToAdd.push({ uri: targetProjectDirUri, name: frankName });
    }
    if (!isPathCoveredByWorkspace(frankRunnerDirUri.fsPath)) {
        foldersToAdd.push({ uri: frankRunnerDirUri, name: 'frank-runner' });
    }
    if (foldersToAdd.length > 0) {
        vscode.workspace.updateWorkspaceFolders(nextIndex, 0, ...foldersToAdd);
    }

    // STEP 5: Open first configuration file and close the panel
    const firstConfigPath = vscode.Uri.file(
        path.join(configurationsDir, configurations[0], 'Configuration.xml')
    );
    vscode.window.showTextDocument(firstConfigPath);
    panel.dispose();
    vscode.window.showInformationMessage(
        'Frank project created! Check the frank-runner docs for project structure and customisation.',
        'Open Docs'
    ).then(choice => {
        if (choice === 'Open Docs') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/wearefrank/frank-runner?tab=readme-ov-file#project-structure-and-customisation'));
        }
    });
}

async function handleSkeletonSubmit(
    panel: vscode.WebviewPanel,
    frankName: string,
    rootDir: string,
    targetProjectDir: string
): Promise<void> {
    // STEP 1: Clone the frank-skeleton repo into the target directory
    try {
        await execAsync(`git clone https://github.com/wearefrank/skeleton.git "${frankName}"`, rootDir);
    } catch (error) {
        panel.webview.postMessage({ command: 'error', message: `Failed to clone frank-skeleton: ${error}` });
        return;
    }

    // STEP 2: Remove .git so the user starts with a clean repo
    const gitDir = path.join(targetProjectDir, '.git');
    if (fs.existsSync(gitDir)) {
        fs.rmSync(gitDir, { recursive: true, force: true });
    }

    // STEP 3: Add project to workspace
    const targetProjectDirUri = vscode.Uri.file(targetProjectDir);
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const nextIndex = workspaceFolders.length;

    const alreadyInWorkspace = workspaceFolders.some(folder => {
        const relativePath = path.relative(folder.uri.fsPath, targetProjectDir);
        return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    });

    if (!alreadyInWorkspace) {
        vscode.workspace.updateWorkspaceFolders(nextIndex, 0, { uri: targetProjectDirUri, name: frankName });
    }

    panel.dispose();
    vscode.window.showInformationMessage(
        'Frank Skeleton project created! Check the skeleton repo for next steps.',
        'Open Repo'
    ).then(choice => {
        if (choice === 'Open Repo') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/wearefrank/skeleton'));
        }
    });
}

function execAsync(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) { reject(stderr || error); }
            else { resolve(stdout); }
        });
    });
}

function getWebviewContent(css: string, template: 'simple' | 'skeleton'): string {
    const isSkeleton = template === 'skeleton';
    const configurationsHidden = isSkeleton ? ' style="display:none"' : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${css}">
    <title>Create a Frank!</title>
</head>
<body>
    <div class="container">
        <h1>Create a Frank!</h1>

        <div id="error-banner" class="error-banner hidden"></div>

        <div class="form-group">
            <label for="frankName">Frank Name <span class="required">*</span></label>
            <input type="text" id="frankName" placeholder="my-frank-project" autocomplete="off" />
        </div>

        <div class="form-group">
            <label for="rootDir">Root Directory <span class="required">*</span></label>
            <div class="dir-picker">
                <input type="text" id="rootDir" placeholder="Select a folder..." readonly />
                <button class="secondary-button" id="browseBtn" type="button">Browse...</button>
            </div>
        </div>

        <div class="form-group" id="configurations-group"${configurationsHidden}>
            <label>Configurations <span class="required">*</span></label>
            <div id="configurations-list"></div>
            <button class="add-button" id="addConfigBtn" type="button">+ Add Configuration</button>
        </div>

        <div class="form-group"${configurationsHidden}>
            <label class="checkbox-label">
                <input type="checkbox" id="boilerplateCheck" />
                Generate boilerplate files
            </label>
            <span class="hint">Creates starter XSL, XSD, datasource, and JSON schema files in each configuration's subfolders</span>
        </div>

        <div class="actions">
            <button class="primary-button" id="createBtn" type="button">Create Frank!</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const isSkeleton = ${isSkeleton};

        let configCount = 0;

        function addConfig(defaultValue = '') {
            configCount++;
            const list = document.getElementById('configurations-list');
            const item = document.createElement('div');
            item.className = 'config-item';
            item.dataset.id = configCount;
            item.innerHTML = \`
                <input type="text" class="config-name" placeholder="my-configuration" autocomplete="off" value="\${defaultValue}" />
                <button class="remove-button" type="button" title="Remove configuration">✕</button>
            \`;
            item.querySelector('.remove-button').addEventListener('click', () => {
                item.remove();
                updateRemoveButtons();
            });
            list.appendChild(item);
            updateRemoveButtons();
            item.querySelector('.config-name').focus();
        }

        function updateRemoveButtons() {
            const items = document.querySelectorAll('.config-item');
            items.forEach(item => {
                item.querySelector('.remove-button').disabled = items.length === 1;
            });
        }

        function showError(message) {
            const banner = document.getElementById('error-banner');
            banner.textContent = message;
            banner.classList.remove('hidden');
            banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function clearError() {
            document.getElementById('error-banner').classList.add('hidden');
        }

        document.getElementById('browseBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'pickFolder' });
        });

        document.getElementById('addConfigBtn').addEventListener('click', () => addConfig());

        document.getElementById('createBtn').addEventListener('click', () => {
            clearError();

            const frankName = document.getElementById('frankName').value.trim();
            const rootDir = document.getElementById('rootDir').value.trim();
            const configInputs = document.querySelectorAll('.config-name');
            const configurations = Array.from(configInputs)
                .map(input => input.value.trim())
                .filter(v => v.length > 0);

            if (!frankName) { showError('Frank Name is required.'); return; }
            if (!rootDir) { showError('Root Directory is required.'); return; }
            if (!isSkeleton && configurations.length === 0) { showError('At least one configuration name is required.'); return; }

            const boilerplate = document.getElementById('boilerplateCheck').checked;

            document.getElementById('createBtn').disabled = true;
            document.getElementById('createBtn').textContent = 'Creating...';

            vscode.postMessage({ command: 'submit', frankName, rootDir, configurations, boilerplate });
        });

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'folderSelected') {
                document.getElementById('rootDir').value = msg.path;
            } else if (msg.command === 'error') {
                showError(msg.message);
                document.getElementById('createBtn').disabled = false;
                document.getElementById('createBtn').textContent = 'Create Frank!';
            }
        });

        // Initialize with one configuration input
        if (!isSkeleton) { addConfig(); }
    </script>
</body>
</html>`;
}
