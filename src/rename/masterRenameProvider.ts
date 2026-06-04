import * as vscode from 'vscode';
import { FrankRenameProvider } from './frankRenameProvider';
import { SessionKeyRenameProvider } from './sessionKeyRenameProvider';

export class MasterRenameProvider implements vscode.RenameProvider, vscode.Disposable {

    private frankProvider = new FrankRenameProvider();
    private sessionProvider = new SessionKeyRenameProvider();

    private highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: new vscode.ThemeColor('editor.wordHighlightStrongBorder'),
        borderRadius: '2px',
    });

    private clearHighlightDisposable: vscode.Disposable | undefined;

    private applyHighlights(document: vscode.TextDocument, ranges: vscode.Range[]): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        editor.setDecorations(this.highlightDecorationType, ranges);

        this.clearHighlightDisposable?.dispose();
        // No URI filter: VS Code may fire this with the wrong document reference when
        // focus returns after Escape, so we clear on any selection change.
        this.clearHighlightDisposable = vscode.window.onDidChangeTextEditorSelection(() => {
            this.clearHighlights();
        });
    }

    private clearHighlights(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(this.highlightDecorationType, []);
        }
        this.clearHighlightDisposable?.dispose();
        this.clearHighlightDisposable = undefined;
    }

    dispose(): void {
        this.highlightDecorationType.dispose();
        this.clearHighlightDisposable?.dispose();
    }

    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string; }> {

        const line = document.lineAt(position.line).text;

        const frankRegex = /(?:name|path)\s*=\s*(["'])([^"']+)\1/gi;
        if (this.isCursorInsideAttributeValue(line, position.character, frankRegex)) {
            const result = this.frankProvider.prepareRename(document, position, token);
            const ranges = this.frankProvider.findAffectedRanges(document, position);
            this.applyHighlights(document, ranges);
            return result;
        }

        const sessionKeyRegex = /\b(?:\w*sessionKey)\s*=\s*(["'])([^"']+)\1/gi;
        if (this.isCursorInsideAttributeValue(line, position.character, sessionKeyRegex)) {
            const ranges = this.sessionProvider.findHighlightRanges(document, position);
            this.applyHighlights(document, ranges);
            return this.sessionProvider.prepareRename(document, position, token);
        }

        throw new Error("Invalid rename location: You can only rename 'name', 'path', or '*sessionKey' attributes.");
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | null | undefined> {
        this.clearHighlights();

        const line = document.lineAt(position.line).text;

        const frankRegex = /(?:name|path)\s*=\s*(["'])([^"']+)\1/gi;
        if (this.isCursorInsideAttributeValue(line, position.character, frankRegex)) {
            return this.frankProvider.provideRenameEdits(document, position, newName, token);
        }

        const sessionKeyRegex = /\b(?:\w*sessionKey)\s*=\s*(["'])([^"']+)\1/gi;
        if (this.isCursorInsideAttributeValue(line, position.character, sessionKeyRegex)) {
            return this.sessionProvider.provideRenameEdits(document, position, newName, token);
        }

        return null;
    }

    private isCursorInsideAttributeValue(line: string, charIndex: number, regex: RegExp): boolean {
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(line)) !== null) {
            const quoteType = match[1]; 
            const attributeValue = match[2]; 
            
            const valueStartIndex = match.index + match[0].indexOf(quoteType) + 1;
            const valueEndIndex = valueStartIndex + attributeValue.length;
            
            if (charIndex >= valueStartIndex && charIndex <= valueEndIndex) {
                return true;
            }
        }
        return false;
    }
}