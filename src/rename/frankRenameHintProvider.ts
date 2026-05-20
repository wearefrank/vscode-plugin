import * as vscode from 'vscode';

export class FrankRenameHintProvider {
    private hintDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' Press F2 to rename',
            color: new vscode.ThemeColor('editorGhostText.foreground'),
            margin: '0 0 0 5px',
            fontStyle: 'italic'
        }
    });

    public register(context: vscode.ExtensionContext) {
        const selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;

            // We only do this in XML files
            if (editor.document.languageId !== 'xml') return;

            // If the user selects multiple lines, do not show a hint
            if (!event.selections[0].isSingleLine) {
                editor.setDecorations(this.hintDecorationType, []);
                return;
            }

            const position = event.selections[0].active;
            const lineText = editor.document.lineAt(position.line).text;

            // Quick, lightweight check: are we on a name= or path= attribute?
            const regex = /(?:name|path|[sS]essionKey)=["']([^"']+)["']/g;
            let match;
            let showHint = false;

            while ((match = regex.exec(lineText)) !== null) {
                const attributeValue = match[1];
                const valueStartIndex = match.index + match[0].indexOf(attributeValue);
                const valueEndIndex = valueStartIndex + attributeValue.length;

                if (position.character >= valueStartIndex && position.character <= valueEndIndex) {
                    showHint = true;
                    break;
                }
            }

            if (showHint) {
                const range = new vscode.Range(
                    position.line, lineText.length,
                    position.line, lineText.length
                );
                editor.setDecorations(this.hintDecorationType, [range]);
            } else {
                editor.setDecorations(this.hintDecorationType, []);
            }
        });

        context.subscriptions.push(selectionChangeListener);
    }
}
