import * as vscode from 'vscode';

export class SessionKeyDefinitionProvider implements vscode.DefinitionProvider {

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | null> {

        const wordRange = document.getWordRangeAtPosition(position, /[-\w]+/);
        if (!wordRange) {
            return null;
        }
        const clickedWord = document.getText(wordRange);

        const regexSource = `(?:storeResultInSessionKey|rootElementSessionKey|reasonSessionKey)\\s*=\\s*["'](${clickedWord})["']|<PutInSessionPipe[^>]*sessionKey\\s*=\\s*["'](${clickedWord})["']`;

        const locations: vscode.Location[] = [];

        // We ignore 'node_modules' or 'target' folders to keep it fast.
        const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '{**/node_modules/**,**/target/**}');

        const CONCURRENCY = 10;
        for (let i = 0; i < xmlFiles.length; i += CONCURRENCY) {
            if (token.isCancellationRequested) break;

            const batch = xmlFiles.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(async (fileUri) => {
                const found: vscode.Location[] = [];
                try {
                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                    const fileText = Buffer.from(fileData).toString('utf8');

                    // Performance optimization: Quick check if the clicked word is even in this file
                    if (!fileText.includes(clickedWord)) return found;

                    // Each parallel task needs its own regex instance to avoid shared lastIndex state
                    const regex = new RegExp(regexSource, 'g');
                    let match;
                    let doc: vscode.TextDocument | null = null;

                    while ((match = regex.exec(fileText)) !== null) {
                        // only open document on match — positionAt without slowing the IDE
                        if (!doc) {
                            doc = await vscode.workspace.openTextDocument(fileUri);
                        }

                        const startPos = doc.positionAt(match.index);
                        const endPos = doc.positionAt(match.index + match[0].length);

                        // Check if the found definition isn't the exact place we already clicked
                        if (fileUri.fsPath !== document.uri.fsPath || startPos.line !== position.line) {
                            found.push(new vscode.Location(fileUri, new vscode.Range(startPos, endPos)));
                        }
                    }
                } catch (error) {
                    console.error(`Failed to read file ${fileUri.fsPath}:`, error);
                }
                return found;
            }));

            for (const result of batchResults) {
                locations.push(...result);
            }
        }

        return locations;
    }
}
