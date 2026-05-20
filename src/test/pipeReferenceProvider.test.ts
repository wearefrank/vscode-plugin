import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { PipeReferenceProvider } from '../references/pipeReferenceProvider';

suite('PipeReferenceProvider Test Suite', () => {

    const provider = new PipeReferenceProvider();
    const cancelToken = { isCancellationRequested: false } as vscode.CancellationToken;

    // Full document mock with working offsetAt/positionAt to support Pipeline scoping
    function createMockDocument(content: string): vscode.TextDocument {
        const lines = content.split('\n');
        const lineOffsets: number[] = [];
        let offset = 0;
        for (const line of lines) {
            lineOffsets.push(offset);
            offset += line.length + 1; // +1 for the \n
        }

        return {
            getText: () => content,
            lineAt: (n: number) => ({ text: lines[n] }),
            lineCount: lines.length,
            uri: vscode.Uri.parse('untitled:test.xml'),
            offsetAt: (pos: vscode.Position) => lineOffsets[pos.line] + pos.character,
            positionAt: (off: number) => {
                let line = 0;
                for (let i = 0; i < lineOffsets.length; i++) {
                    if (lineOffsets[i] <= off) { line = i; } else { break; }
                }
                return new vscode.Position(line, off - lineOffsets[line]);
            }
        } as any;
    }

    test('provideReferences - finds all references within the same Pipeline', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <Pipe name="MyPipe" className="EchoPipe" />',
            '            <Forward name="success" path="MyPipe" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const doc = createMockDocument(xml);
        // Line 3: '            <Pipe name="MyPipe" ...'
        // 12 spaces + '<Pipe name="' (12 chars) = index 24 for 'M' of 'MyPipe'
        const position = new vscode.Position(3, 24);

        const locations = await provider.provideReferences(doc, position, { includeDeclaration: true }, cancelToken);

        // Should find name="MyPipe" on line 3 and path="MyPipe" on line 4
        assert.strictEqual(locations.length, 2, 'Should find references in both name and path attributes within the Pipeline');
    });

    test('provideReferences - does not include references from a different Pipeline', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <Pipe name="SharedName" />',
            '        </Pipeline>',
            '    </Adapter>',
            '    <Adapter name="B">',
            '        <Pipeline>',
            '            <Pipe name="SharedName" />',
            '            <Forward name="next" path="SharedName" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const doc = createMockDocument(xml);
        // Line 3: '            <Pipe name="SharedName" />'
        // 12 spaces + '<Pipe name="' (12 chars) = index 24 for 'S' of 'SharedName'
        const position = new vscode.Position(3, 24);

        const locations = await provider.provideReferences(doc, position, { includeDeclaration: true }, cancelToken);

        // Only the name="SharedName" in Adapter A's Pipeline should be included
        assert.strictEqual(locations.length, 1, 'Should only find references within the same Pipeline scope');
    });

    test('provideReferences - returns empty array for an untracked attribute', async () => {
        // className is not one of name/path/firstPipe/nextPipe
        const doc = createMockDocument(`<Pipe className="EchoPipe" />`);
        const position = new vscode.Position(0, 17);

        const locations = await provider.provideReferences(doc, position, { includeDeclaration: true }, cancelToken);

        assert.strictEqual(locations.length, 0, 'Should return empty array for untracked attributes');
    });

    test('provideReferences - returns empty array when cursor is outside any Pipeline element', async () => {
        // No <Pipeline> wrapper around the Pipe — pipelineStart will be -1
        const doc = createMockDocument(`<Pipe name="OrphanPipe" />`);
        // 'O' of 'OrphanPipe' is at index 12
        const position = new vscode.Position(0, 12);

        const locations = await provider.provideReferences(doc, position, { includeDeclaration: true }, cancelToken);

        assert.strictEqual(locations.length, 0, 'Should return empty array when no Pipeline wraps the cursor position');
    });
});
