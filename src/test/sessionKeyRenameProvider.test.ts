import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { SessionKeyRenameProvider } from '../rename/sessionKeyRenameProvider';

suite('SessionKeyRenameProvider Test Suite', () => {

    const provider = new SessionKeyRenameProvider();

    function createMockDocument(lines: string[]): vscode.TextDocument {
        return {
            lineAt: (n: number) => ({ text: lines[n] }),
            lineCount: lines.length,
            uri: vscode.Uri.parse('untitled:test.xml'),
        } as any;
    }

    test('prepareRename - valid cursor inside sessionKey value returns range and placeholder', async () => {
        // <Pipe sessionKey="mySessionValue" />
        // '<Pipe ' = 6, 'sessionKey="' = 12, so 'm' of 'mySessionValue' is at index 18
        const doc = createMockDocument([`<Pipe sessionKey="mySessionValue" />`]);
        const position = new vscode.Position(0, 18);

        const result = await provider.prepareRename(doc, position, {} as any) as { range: vscode.Range; placeholder: string };

        assert.ok(result, 'Should return a result for a sessionKey attribute');
        assert.strictEqual(result.placeholder, 'mySessionValue');
    });

    test('prepareRename - storeResultInSessionKey variant is also recognized', async () => {
        // <Pipe storeResultInSessionKey="storedKey" />
        // '<Pipe ' = 6, 'storeResultInSessionKey="' = 25, so 's' of 'storedKey' is at index 31
        const doc = createMockDocument([`<Pipe storeResultInSessionKey="storedKey" />`]);
        const position = new vscode.Position(0, 31);

        const result = await provider.prepareRename(doc, position, {} as any) as { range: vscode.Range; placeholder: string };

        assert.ok(result, 'Should return a result for a storeResultInSessionKey attribute');
        assert.strictEqual(result.placeholder, 'storedKey');
    });

    test('prepareRename - cursor outside value quotes returns undefined', async () => {
        // Cursor on 'P' of Pipe tag — not inside any attribute value
        const doc = createMockDocument([`<Pipe sessionKey="myKey" />`]);
        const position = new vscode.Position(0, 1);

        const result = await provider.prepareRename(doc, position, {} as any);

        assert.strictEqual(result, undefined, 'Should return undefined when cursor is outside the value quotes');
    });

    test('prepareRename - returned range covers exactly the attribute value', async () => {
        // <Pipe sessionKey="abc" />
        // Value 'abc' starts at index 18, ends at index 21
        const doc = createMockDocument([`<Pipe sessionKey="abc" />`]);
        const position = new vscode.Position(0, 18);

        const result = await provider.prepareRename(doc, position, {} as any) as { range: vscode.Range; placeholder: string };

        assert.ok(result);
        assert.strictEqual(result.range.start.character, 18, 'Range should start at the first character of the value');
        assert.strictEqual(result.range.end.character, 21, 'Range should end after the last character of the value');
    });
});
