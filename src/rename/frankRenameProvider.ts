import * as vscode from 'vscode';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';

type LocatedElement = Element & { lineNumber: number };

export class FrankRenameProvider implements vscode.RenameProvider {

    findAffectedRanges(document: vscode.TextDocument, position: vscode.Position): vscode.Range[] {
        const wordRange = document.getWordRangeAtPosition(position, /[^"']+/);
        if (!wordRange) return [];

        const oldName = document.getText(wordRange);
        const text = document.getText();

        const parser = new DOMParser({
            locator: {},
            errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} }
        });
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const pipelines = xmlDoc.getElementsByTagName('Pipeline');
        let targetPipeline: Element | null = null;

        // STEP 1: Find the pipeline whose line range contains the cursor
        for (let i = 0; i < pipelines.length; i++) {
            const pipeline = pipelines[i];
            const elements = pipeline.getElementsByTagName('*');

            const pipelineStartLine = (pipeline as LocatedElement).lineNumber - 1;
            let pipelineEndLine = pipelineStartLine;
            for (let j = 0; j < elements.length; j++) {
                const elLine = (elements[j] as LocatedElement).lineNumber - 1;
                if (elLine > pipelineEndLine) { pipelineEndLine = elLine; }
            }

            // +5 buffer covers the closing </Pipeline> tag lines
            if (position.line < pipelineStartLine || position.line > pipelineEndLine + 5) {
                continue;
            }

            for (let j = 0; j < elements.length; j++) {
                const el = elements[j];
                if (el.getAttribute('name') === oldName || el.getAttribute('path') === oldName) {
                    targetPipeline = pipeline;
                    break;
                }
            }
            if (targetPipeline) break;
        }

        // Fallback for files without a <Pipeline> wrapper (e.g. PipelinePart)
        if (!targetPipeline) {
            const allElements = xmlDoc.getElementsByTagName('*');
            const hasPipeWithName = Array.from(allElements).some(el =>
                el.tagName?.toLowerCase().includes('pipe') && el.getAttribute('name') === oldName
            );
            if (!hasPipeWithName) return [];
            return this.collectRanges(document, Array.from(allElements), oldName);
        }

        // STEP 2: Collect all name= and path= matches in this pipeline
        return this.collectRanges(document, Array.from(targetPipeline.getElementsByTagName('*')), oldName);
    }

    private collectRanges(document: vscode.TextDocument, elements: Element[], oldName: string): vscode.Range[] {
        const ranges: vscode.Range[] = [];
        const elementsToRename: { node: Element; attr: string }[] = [];

        for (const el of elements) {
            if (el.getAttribute('name') === oldName) {
                elementsToRename.push({ node: el, attr: 'name' });
            }
            if (el.getAttribute('path') === oldName) {
                elementsToRename.push({ node: el, attr: 'path' });
            }
        }

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
                const offset = item.attr.length + 2;

                let startIndex = lineText.indexOf(searchStringDouble);
                if (startIndex === -1) startIndex = lineText.indexOf(searchStringSingle);

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

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | null> {
        const ranges = this.findAffectedRanges(document, position);

        if (ranges.length === 0) {
            vscode.window.showInformationMessage("Rename action canceled: Cursor is not within a recognizable <Pipeline> scope.");
            return null;
        }

        const edit = new vscode.WorkspaceEdit();
        for (const range of ranges) {
            edit.replace(document.uri, range, newName);
        }

        const wordRange = document.getWordRangeAtPosition(position, /[^"']+/);
        if (wordRange) {
            const oldName = document.getText(wordRange);
            await this.addCrossFileEdits(document, oldName, newName, edit);
        }

        return edit;
    }

    // Find all XML files that <Include> the current file and update any
    // path="oldName" forwards in them, so renames propagate across includes.
    private async addCrossFileEdits(
        document: vscode.TextDocument,
        oldName: string,
        newName: string,
        edit: vscode.WorkspaceEdit
    ): Promise<void> {
        const currentFileName = path.basename(document.uri.fsPath);
        const escapedFileName = currentFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const includePattern = new RegExp(`<Include\\s+ref=["'][^"']*${escapedFileName}["']`, 'i');
        const forwardPattern = new RegExp(`\\bpath=(["'])(${escapedName})\\1`, 'g');

        const allXmlFiles = await vscode.workspace.findFiles('**/*.xml', '**/node_modules/**');

        for (const fileUri of allXmlFiles) {
            if (fileUri.fsPath === document.uri.fsPath) continue;

            try {
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const fileText = Buffer.from(fileData).toString('utf8');

                if (!includePattern.test(fileText)) continue;
                if (!fileText.includes(oldName)) continue;

                const doc = await vscode.workspace.openTextDocument(fileUri);
                forwardPattern.lastIndex = 0;
                let match;
                while ((match = forwardPattern.exec(fileText)) !== null) {
                    const quoteChar = match[1];
                    const valueStart = match.index + match[0].indexOf(quoteChar) + 1;
                    edit.replace(
                        fileUri,
                        new vscode.Range(doc.positionAt(valueStart), doc.positionAt(valueStart + oldName.length)),
                        newName
                    );
                }
            } catch {
                // skip unreadable files
            }
        }
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
