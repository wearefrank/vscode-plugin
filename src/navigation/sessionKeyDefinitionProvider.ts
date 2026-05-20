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

        const definitionRegex = new RegExp(`(?:storeResultInSessionKey|rootElementSessionKey|reasonSessionKey)\\s*=\\s*["'](${clickedWord})["']|<PutInSessionPipe[^>]*sessionKey\\s*=\\s*["'](${clickedWord})["']`, 'g');

        const locations: vscode.Location[] = [];

        // We ignore 'node_modules' or 'target' folders to keep it fast.
        const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '{**/node_modules/**,**/target/**}');

        for (const fileUri of xmlFiles) {
            if (token.isCancellationRequested) {
                break;
            }

            try {
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const fileText = Buffer.from(fileData).toString('utf8');

                // Performance optimization: Quick check if the clicked word is even in this file
                if (!fileText.includes(clickedWord)) {
                    continue;
                }

                definitionRegex.lastIndex = 0;
                let match;
                let doc: vscode.TextDocument | null = null;

                while ((match = definitionRegex.exec(fileText)) !== null) {
                    // only open document on match — positionAt without slowing the IDE
                    if (!doc) {
                        doc = await vscode.workspace.openTextDocument(fileUri);
                    }

                    const startPos = doc.positionAt(match.index);
                    const endPos = doc.positionAt(match.index + match[0].length);

                    // Check if the found definition isn't the exact place we already clicked
                    if (fileUri.fsPath !== document.uri.fsPath || startPos.line !== position.line) {
                        locations.push(new vscode.Location(fileUri, new vscode.Range(startPos, endPos)));
                    }
                }
            } catch (error) {
                console.error(`Failed to read file ${fileUri.fsPath}:`, error);
            }
        }

        return locations;
    }
}
