import * as vscode from 'vscode';
import { DOMParser } from '@xmldom/xmldom';

export class ConfigurationIndex {
    // Map of JavaListener/FrankListener names to their source file URI string
    private listeners: Map<string, string> = new Map();
    // Map of Adapter names to their source file URI string
    private adapters: Map<string, string> = new Map();

    public async buildIndex(): Promise<void> {
        const files = await vscode.workspace.findFiles('**/*.xml', '**/node_modules/**');

        for (const file of files) {
            await this.updateFile(file);
        }
    }

    public async updateFile(uri: vscode.Uri): Promise<void> {
        try {
            // Read the file contents directly from the filesystem to avoid opening editors
            const fileData = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(fileData).replace(/^﻿/, '');

            const parser = new DOMParser({
                locator: {},
                errorHandler: {
                    warning: () => {},
                    error: () => {},
                    fatalError: (err) => console.error(`[DOMParser] Fatal error parsing ${uri.fsPath}:`, err)
                }
            });
            const xmlDoc = parser.parseFromString(text, 'text/xml');

            // Purge old entries for this specific file before adding new ones
            this.removeFile(uri);

            // HTMLCollection is not iterable — convert to Array first
            const javaListeners = Array.from(xmlDoc.getElementsByTagName('JavaListener'));
            const frankListeners = Array.from(xmlDoc.getElementsByTagName('FrankListener'));

            const allListeners: Element[] = [...javaListeners, ...frankListeners];

            for (const listener of allListeners) {
                const name = listener.getAttribute('name');
                if (name) {
                    this.listeners.set(name, uri.toString());
                }
            }

            const adapterElements = Array.from(xmlDoc.getElementsByTagName('Adapter'));
            for (const adapter of adapterElements) {
                const name = adapter.getAttribute('name');
                if (name) {
                    this.adapters.set(name, uri.toString());
                }
            }
        } catch (error) {
            console.error(`Failed to index file: ${uri.fsPath}`, error);
        }
    }

    public removeFile(uri: vscode.Uri): void {
        const uriString = uri.toString();
        for (const [name, storedUri] of this.listeners.entries()) {
            if (storedUri === uriString) {
                this.listeners.delete(name);
            }
        }
        for (const [name, storedUri] of this.adapters.entries()) {
            if (storedUri === uriString) {
                this.adapters.delete(name);
            }
        }
    }

    public hasJavaListener(name: string): boolean {
        return this.listeners.has(name);
    }

    public hasAdapter(name: string): boolean {
        return this.adapters.has(name);
    }
}
