import * as vscode from 'vscode';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { ConfigurationIndex } from './configuration-index';
import { ExpressionValidator } from './expressionValidator';

interface LocatableNode extends Element {
    lineNumber: number;
}

export class FrankValidator {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private index: ConfigurationIndex;
    private expressionValidator: ExpressionValidator;
    private fileExistsFn: (uri: vscode.Uri) => Promise<void>;

    constructor(
        collection: vscode.DiagnosticCollection,
        index: ConfigurationIndex,
        fileExistsFn: (uri: vscode.Uri) => Promise<void> = async (uri) => { await vscode.workspace.fs.stat(uri); }
    ) {
        this.diagnosticCollection = collection;
        this.index = index;
        this.expressionValidator = new ExpressionValidator();
        this.fileExistsFn = fileExistsFn;
    }

    public async validate(document: vscode.TextDocument, token?: vscode.CancellationToken) {
        if (document.languageId !== 'xml') return;

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // 1. Yield to the event loop before running the heavy DOM parser
        await new Promise(resolve => setTimeout(resolve, 0));
        if (token?.isCancellationRequested) return;

        const parser = new DOMParser({
            locator: {},
            errorHandler: {
                warning: () => {},
                error: () => {},
                fatalError: () => {}
            }
        });
        
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        this.validatePipelines(xmlDoc, document, diagnostics);
        this.validateLocalSenders(xmlDoc, document, diagnostics);
        
        await this.validateExpressions(xmlDoc, document, diagnostics, token);
        await this.validateSchemaReferences(xmlDoc, document, diagnostics, token);

        if (token?.isCancellationRequested) return;

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private async validateExpressions(xmlDoc: Document, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[], token?: vscode.CancellationToken) {
        const cts = token ? null : new vscode.CancellationTokenSource();
        const actualToken = token ?? cts!.token;

        try {
            const elements = xmlDoc.getElementsByTagName('*');
            const attributesToCheck = ['jsonPath', 'jsonPathExpression', 'xpathExpression', 'elementXPathExpression'];

            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];

                for (const attrName of attributesToCheck) {
                    const attrValue = el.getAttribute(attrName);
                    if (attrValue) {
                        if (actualToken.isCancellationRequested) return;

                        const elementLineNumber = (el as unknown as LocatableNode).lineNumber - 1;
                        if (elementLineNumber < 0 || elementLineNumber >= document.lineCount) continue;

                        const searchStringDouble = `${attrName}="${attrValue}"`;
                        const searchStringSingle = `${attrName}='${attrValue}'`;
                        const QUOTE_OFFSET = attrName.length + 2;

                        let startIndex = -1;
                        let attrLineNumber = elementLineNumber;
                        for (let offset = 0; offset <= 10; offset++) {
                            const searchLine = elementLineNumber + offset;
                            if (searchLine >= document.lineCount) break;
                            const text = document.lineAt(searchLine).text;
                            startIndex = text.indexOf(searchStringDouble);
                            if (startIndex === -1) startIndex = text.indexOf(searchStringSingle);
                            if (startIndex !== -1) { attrLineNumber = searchLine; break; }
                        }

                        const lineText = document.lineAt(attrLineNumber).text;
                        const startCharacter = startIndex !== -1 ? startIndex + QUOTE_OFFSET : 0;
                        const endCharacter = startIndex !== -1 ? startIndex + QUOTE_OFFSET + attrValue.length : lineText.length;

                        const range = new vscode.Range(attrLineNumber, startCharacter, attrLineNumber, endCharacter);

                        const diagnostic = await this.expressionValidator.checkExpression(attrName, attrValue, range, actualToken);
                        if (diagnostic) {
                            diagnostics.push(diagnostic);
                        }
                    }
                }
            }
        } finally {
            cts?.dispose();
        }
    }

    private async validateSchemaReferences(xmlDoc: Document, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[], token?: vscode.CancellationToken) {
        const dir = path.dirname(document.uri.fsPath);
        const elements = xmlDoc.getElementsByTagName('*');

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            const schemaValue = el.getAttribute('schema');
            if (!schemaValue) continue;
            if (token?.isCancellationRequested) return;

            const schemaUri = vscode.Uri.file(path.join(dir, schemaValue));

            try {
                await this.fileExistsFn(schemaUri);
            } catch {
                const elementLineNumber = (el as unknown as LocatableNode).lineNumber - 1;
                if (elementLineNumber < 0 || elementLineNumber >= document.lineCount) continue;

                const searchStringDouble = `schema="${schemaValue}"`;
                const searchStringSingle = `schema='${schemaValue}'`;
                const QUOTE_OFFSET = 'schema'.length + 2;

                let startIndex = -1;
                let attrLineNumber = elementLineNumber;
                for (let offset = 0; offset <= 10; offset++) {
                    const searchLine = elementLineNumber + offset;
                    if (searchLine >= document.lineCount) break;
                    const text = document.lineAt(searchLine).text;
                    startIndex = text.indexOf(searchStringDouble);
                    if (startIndex === -1) startIndex = text.indexOf(searchStringSingle);
                    if (startIndex !== -1) { attrLineNumber = searchLine; break; }
                }

                const lineText = document.lineAt(attrLineNumber).text;
                const startCharacter = startIndex !== -1 ? startIndex + QUOTE_OFFSET : 0;
                const endCharacter = startIndex !== -1 ? startIndex + QUOTE_OFFSET + schemaValue.length : lineText.length;

                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(attrLineNumber, startCharacter, attrLineNumber, endCharacter),
                    `Schema file not found: ${schemaValue}`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = 'Frank!Validator';
                diagnostics.push(diagnostic);
            }
        }
    }

    private validatePipelines(xmlDoc: Document, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]) {
        const pipelines = xmlDoc.getElementsByTagName('Pipeline');

        for (let i = 0; i < pipelines.length; i++) {
            const pipeline = pipelines[i];
            const validTargets = new Set<string>();

            const allElements = pipeline.getElementsByTagName('*');
            for (let j = 0; j < allElements.length; j++) {
                const tagName = allElements[j].tagName;
                if (tagName && tagName.toLowerCase().includes('pipe')) {
                    const name = allElements[j].getAttribute('name');
                    if (name) validTargets.add(name);
                }
            }

            const exits = pipeline.getElementsByTagName('Exit');
            for (let j = 0; j < exits.length; j++) {
                const name = exits[j].getAttribute('name');
                if (name) validTargets.add(name);
            }

            const forwards = pipeline.getElementsByTagName('Forward');
            for (let k = 0; k < forwards.length; k++) {
                const forward = forwards[k];
                const path = forward.getAttribute('path');
                
                if (path && !validTargets.has(path)) {
                    const lineNumber = (forward as unknown as LocatableNode).lineNumber - 1;
                    this.addDiagnostic(
                        document, 
                        diagnostics, 
                        lineNumber, 
                        `path="${path}"`, 
                        `Invalid Forward: The path '${path}' does not exist in this Pipeline.`
                    );
                }
            }
        }
    }

    private validateLocalSenders(xmlDoc: Document, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]) {
        const senderTags = ['LocalSender', 'IbisLocalSender'];

        senderTags.forEach(tagName => {
            const senders = xmlDoc.getElementsByTagName(tagName);
            
            for (let i = 0; i < senders.length; i++) {
                const sender = senders[i];
                const targetListener = sender.getAttribute('javaListener');
                
                if (targetListener && !this.index.hasJavaListener(targetListener)) {
                    const lineNumber = (sender as unknown as LocatableNode).lineNumber - 1;
                    this.addDiagnostic(
                        document, 
                        diagnostics, 
                        lineNumber, 
                        `javaListener="${targetListener}"`, 
                        `Invalid target: The JavaListener '${targetListener}' is not defined in the workspace.`
                    );
                }
            }
        });
    }

    private addDiagnostic(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[], lineNumber: number,
         searchString: string, message: string) {
        if (lineNumber < 0 || lineNumber >= document.lineCount) return;

        const lineText = document.lineAt(lineNumber).text;
        const startIndex = lineText.indexOf(searchString);
        
        const startCharacter = startIndex !== -1 ? startIndex : 0;
        const endCharacter = startIndex !== -1 ? startIndex + searchString.length : lineText.length;

        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(lineNumber, startCharacter, lineNumber, endCharacter),
            message,
            vscode.DiagnosticSeverity.Error
        ));
    }

    public clear(document: vscode.TextDocument) {
        this.diagnosticCollection.delete(document.uri);
    }
}