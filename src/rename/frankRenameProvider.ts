import * as vscode from 'vscode';
import { DOMParser } from '@xmldom/xmldom';

type LocatedElement = Element & { lineNumber: number };

export class FrankRenameProvider implements vscode.RenameProvider {
    
    findAffectedRanges(document: vscode.TextDocument, position: vscode.Position): vscode.Range[] {
        const wordRange = document.getWordRangeAtPosition(position, /[^"']+/);
        if (!wordRange) return [];

        const oldName = document.getText(wordRange);
        const text = document.getText();
        const ranges: vscode.Range[] = [];

        const parser = new DOMParser({
            locator: {},
            errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} }
        });
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const pipelines = xmlDoc.getElementsByTagName('Pipeline');
        let targetPipeline: Element | null = null;

        // STEP 1: Detect in which Pipeline the cursor (position.line) is located
        for (let i = 0; i < pipelines.length; i++) {
            const pipeline = pipelines[i];
            const elements = pipeline.getElementsByTagName('*');

            for (let j = 0; j < elements.length; j++) {
                const el = elements[j];
                const nameAttr = el.getAttribute('name');
                const pathAttr = el.getAttribute('path');

                if (nameAttr === oldName || pathAttr === oldName) {
                    const startLine = (el as LocatedElement).lineNumber - 1;

                    if (position.line >= startLine && position.line <= startLine + 20) {
                        targetPipeline = pipeline;
                        break;
                    }
                }
            }
            if (targetPipeline) break;
        }

        if (!targetPipeline) return [];

        // STEP 2: Collect all elements in THIS pipeline that need to be adjusted
        const elementsToRename: { node: Element, attr: string }[] = [];
        const allElements = targetPipeline.getElementsByTagName('*');

        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            if (el.getAttribute('name') === oldName) {
                elementsToRename.push({ node: el, attr: 'name' });
            }
            if (el.getAttribute('path') === oldName) {
                elementsToRename.push({ node: el, attr: 'path' });
            }
        }

        // STEP 3: Resolve each element to its text range in the document
        for (const item of elementsToRename) {
            const startLine = (item.node as LocatedElement).lineNumber - 1;
            if (startLine < 0 || startLine >= document.lineCount) continue;

            // Since tags and attributes can span multiple lines in Frank! configs,
            // we scan downwards from the start tag for a limited number of lines.
            // A limit of 10 lines prevents unnecessarily deep scanning of the document.
            for (let currentLine = startLine; currentLine <= startLine + 10 && currentLine < document.lineCount; currentLine++) {
                const lineText = document.lineAt(currentLine).text;

                // Explicitly search for the attribute assignment to prevent false positives
                // (e.g., matching a random string inside a comment or description)
                const searchStringDouble = `${item.attr}="${oldName}"`;
                const searchStringSingle = `${item.attr}='${oldName}'`;

                let startIndex = lineText.indexOf(searchStringDouble);
                const offset = item.attr.length + 2; // Compensate for the attribute name and ="

                if (startIndex === -1) {
                    startIndex = lineText.indexOf(searchStringSingle);
                }

                if (startIndex !== -1) {
                    const startPos = new vscode.Position(currentLine, startIndex + offset);
                    const endPos = new vscode.Position(currentLine, startIndex + offset + oldName.length);
                    ranges.push(new vscode.Range(startPos, endPos));
                    break;
                }
            }
        }

        return ranges;
    }

    provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.WorkspaceEdit> {
        const ranges = this.findAffectedRanges(document, position);

        if (ranges.length === 0) {
            vscode.window.showInformationMessage("Rename action canceled: Cursor is not within a recognizable <Pipeline> scope.");
            return null;
        }

        const edit = new vscode.WorkspaceEdit();
        for (const range of ranges) {
            edit.replace(document.uri, range, newName);
        }
        return edit;
    }

    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string; }> {
        const line = document.lineAt(position.line).text;
        
        // Strict validation: Ensure we are on a line that contains name= or path=
        if (!line.includes('name=') && !line.includes('path=')) {
            throw new Error("Invalid rename: You can only rename the 'name' attribute of Pipes or the 'path' attribute of Forwards.");
        }
        
        const regex = /(?:name|path)=["']([^"']+)["']/g;
        let match;

        while ((match = regex.exec(line)) !== null) {
            const attributeValue = match[1];
            const valueStartIndex = match.index + match[0].indexOf(attributeValue);
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

        throw new Error("Place the cursor explicitly inside the quotes of a 'name' or 'path' attribute.");
    }
}