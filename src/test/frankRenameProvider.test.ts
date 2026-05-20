import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { FrankRenameProvider } from '../rename/frankRenameProvider';

suite('FrankRenameProvider Test Suite', () => {

    const provider = new FrankRenameProvider();

    // A simplified mock for TextDocument
    function createMockDocument(content: string): vscode.TextDocument {
        const lines = content.split('\n');
        return {
            getText: (range?: vscode.Range) => {
                if (!range) return content;
                // Simple range extraction for test purposes
                const line = lines[range.start.line];
                return line.substring(range.start.character, range.end.character);
            },
            lineAt: (line: number) => ({ text: lines[line] }),
            lineCount: lines.length,
            positionAt: (offset: number) => new vscode.Position(0, 0), // Dummy implementation
            uri: vscode.Uri.parse('untitled:test.xml'),
            // Mock getWordRangeAtPosition
            getWordRangeAtPosition: (position: vscode.Position, regex?: RegExp) => {
                const line = lines[position.line];
                let match;
                const searchRegex = regex || /[-\w]+/;
                const globalRegex = new RegExp(searchRegex, 'g');
                while ((match = globalRegex.exec(line)) !== null) {
                    const start = match.index;
                    const end = start + match[0].length;
                    if (position.character >= start && position.character <= end) {
                        return new vscode.Range(position.line, start, position.line, end);
                    }
                }
                return undefined;
            }
        } as any;
    }

    test('prepareRename - Valid cursor position on "name" attribute', () => {
        const xml = `<Pipe name="TestPipe" />`;
        const doc = createMockDocument(xml);
        // Set the cursor on the 'T' of "TestPipe" (index 12)
        const position = new vscode.Position(0, 12); 

        const result = provider.prepareRename!(doc, position, {} as any) as { range: vscode.Range, placeholder: string };
        
        assert.ok(result, "Result should not be null");
        assert.strictEqual(result.placeholder, "TestPipe", "Placeholder must be the exact attribute value");
    });

    test('prepareRename - Invalid cursor position (outside quotes)', () => {
        const xml = `<Pipe name="TestPipe" />`;
        const doc = createMockDocument(xml);
        // Set cursor on the 'P' of the Pipe tag itself
        const position = new vscode.Position(0, 2); 

        assert.throws(() => {
            provider.prepareRename!(doc, position, {} as any);
        }, /Place the cursor explicitly inside the quotes/);
    });

    test('provideRenameEdits - Respect scope and handle multi-line correctly', () => {
        // A test configuration with two adapters and multi-line tags
        const xml = `
        <Configuration>
            <Adapter name="Adapter1">
                <Pipeline>
                    <Pipe 
                        name="TargetPipe" 
                        className="Dummy" />
                    <Forward path="TargetPipe" />
                </Pipeline>
            </Adapter>
            <Adapter name="Adapter2">
                <Pipeline>
                    <Pipe name="TargetPipe" />
                    <Forward path="TargetPipe" />
                </Pipeline>
            </Adapter>
        </Configuration>`.trim();

        const doc = createMockDocument(xml);
        // Line 4 is '                        name="TargetPipe" ' (24 spaces + name="...)
        // 'TargetPipe' starts at index 30; cursor at 32 lands on 'r', inside the value
        const position = new vscode.Position(4, 32);

        const edit = provider.provideRenameEdits(doc, position, "NieuwePipeNaam", {} as any) as vscode.WorkspaceEdit;
        
        assert.ok(edit, "WorkspaceEdit should not be null");
        
        const changes = edit.entries();
        assert.strictEqual(changes.length, 1, "Only one file should be modified");
        
        const editsForFile = changes[0][1];
        assert.strictEqual(editsForFile.length, 2, "There must be exactly 2 changes: 1 Pipe and 1 Forward in Adapter1");

        // Check if the edits are on the correct lines (Adapter1), 
        // line 4 (the Pipe) and line 6 (the Forward)
        assert.strictEqual(editsForFile[0].range.start.line, 4, "Pipe name in Adapter1 must be modified");
        assert.strictEqual(editsForFile[1].range.start.line, 6, "Forward path in Adapter1 must be modified");
    });
});