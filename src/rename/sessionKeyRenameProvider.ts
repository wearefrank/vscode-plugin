import * as vscode from 'vscode';

export class SessionKeyRenameProvider implements vscode.RenameProvider {
    
    async prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Range | { range: vscode.Range; placeholder: string; } | undefined> {
    
    const line = document.lineAt(position.line).text;
    
    const sessionKeyRegex = /\b(?:\w*sessionKey)\s*=\s*(["'])([^"']+)\1/gi;
    let match;
    
    while ((match = sessionKeyRegex.exec(line)) !== null) {
        const quoteType = match[1];
        const attributeValue = match[2];
        
        const valueStartIndex = match.index + match[0].indexOf(quoteType) + 1;
        const valueEndIndex = valueStartIndex + attributeValue.length;
        
        if (position.character >= valueStartIndex && position.character <= valueEndIndex) {
            const startPos = new vscode.Position(position.line, valueStartIndex);
            const endPos = new vscode.Position(position.line, valueEndIndex);
            
            return {
                range: new vscode.Range(startPos, endPos),
                placeholder: attributeValue
            };
        }
    }
}

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | null | undefined> {
        
        const wordRange = document.getWordRangeAtPosition(position, /[^"']+/);
        if (!wordRange) return null;

        const oldName = document.getText(wordRange);
        const edit = new vscode.WorkspaceEdit();

        const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '{**/node_modules/**,**/target/**}');

        // Group 1: The quote (' or ")
        // Group 2: The exact session key value (oldName)
        const renameRegex = new RegExp(`\\b(?:\\w*sessionKey)\\s*=\\s*(["'])(${oldName})\\1`, 'gi');

        for (const fileUri of xmlFiles) {
            if (token.isCancellationRequested) {
                break;
            }

            try {
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const fileText = Buffer.from(fileData).toString('utf8');

                if (!fileText.includes(oldName)) {
                    continue;
                }

                let match;
                renameRegex.lastIndex = 0;
                let doc: vscode.TextDocument | null = null;

                while ((match = renameRegex.exec(fileText)) !== null) {
                    
                    if (!doc) {
                        doc = await vscode.workspace.openTextDocument(fileUri);
                    }

                    const quoteType = match[1];
                    
                    const valueStartOffset = match.index + match[0].indexOf(quoteType) + 1;
                    const valueEndOffset = valueStartOffset + oldName.length;

                    const startPos = doc.positionAt(valueStartOffset);
                    const endPos = doc.positionAt(valueEndOffset);

                    edit.replace(fileUri, new vscode.Range(startPos, endPos), newName);
                }
            } catch (error) {
                console.error(`Failed to process workspace edit for file ${fileUri.fsPath}:`, error);
            }
        }

        return edit;
    }
}