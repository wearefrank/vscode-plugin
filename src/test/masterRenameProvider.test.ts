import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { MasterRenameProvider } from '../rename/masterRenameProvider';

suite('MasterRenameProvider Test Suite', () => {

    const provider = new MasterRenameProvider();

    function createMockDocument(content: string): vscode.TextDocument {
        const lines = content.split('\n');
        return {
            getText: (range?: vscode.Range) => {
                if (!range) return content;
                const line = lines[range.start.line];
                return line.substring(range.start.character, range.end.character);
            },
            lineAt: (n: number) => ({ text: lines[n] }),
            lineCount: lines.length,
            uri: vscode.Uri.parse('untitled:test.xml'),
            getWordRangeAtPosition: (position: vscode.Position, regex?: RegExp) => {
                const line = lines[position.line];
                const searchRegex = new RegExp(regex || /[-\w]+/, 'g');
                let match;
                while ((match = searchRegex.exec(line)) !== null) {
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

    test('prepareRename - routes to FrankRenameProvider for "name" attribute', () => {
        // <Pipe name="TestPipe" />
        // 'T' of "TestPipe" is at index 12
        const doc = createMockDocument(`<Pipe name="TestPipe" />`);
        const position = new vscode.Position(0, 12);

        const result = provider.prepareRename(doc, position, {} as any) as { range: vscode.Range; placeholder: string };

        assert.ok(result, 'Should return a result for a name attribute');
        assert.strictEqual(result.placeholder, 'TestPipe');
    });

    test('prepareRename - routes to SessionKeyRenameProvider for sessionKey attribute', async () => {
        // <Pipe storeResultInSessionKey="myKey" />
        // '<Pipe ' = 6, 'storeResultInSessionKey="' = 25, so 'm' of 'myKey' is at index 31
        const doc = createMockDocument(`<Pipe storeResultInSessionKey="myKey" />`);
        const position = new vscode.Position(0, 31);

        const result = await provider.prepareRename(doc, position, {} as any) as { range: vscode.Range; placeholder: string };

        assert.ok(result, 'Should return a result for a sessionKey attribute');
        assert.strictEqual(result.placeholder, 'myKey');
    });

    test('prepareRename - throws for cursor on tag name (outside any attribute value)', () => {
        // Cursor on 'P' of the Pipe tag — not inside any quoted attribute value
        const doc = createMockDocument(`<Pipe name="TestPipe" />`);
        const position = new vscode.Position(0, 1);

        assert.throws(
            () => provider.prepareRename(doc, position, {} as any),
            /Invalid rename location/
        );
    });

    test('prepareRename - throws for cursor between attributes (whitespace)', () => {
        // Cursor on the space between the closing quote and the next attribute
        // Line: '<Pipe name="A" path="B" />', space at index 14
        const doc = createMockDocument(`<Pipe name="A" path="B" />`);
        const position = new vscode.Position(0, 14);

        assert.throws(
            () => provider.prepareRename(doc, position, {} as any),
            /Invalid rename location/
        );
    });
});
