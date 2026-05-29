import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { FrankValidator } from '../validation/frank-validator';
import { ConfigurationIndex } from '../validation/configuration-index';

suite('FrankValidator Test Suite', () => {

    function createMockDocument(content: string): vscode.TextDocument {
        const lines = content.split('\n');
        return {
            languageId: 'xml',
            getText: () => content,
            lineAt: (n: number) => ({ text: lines[n] }),
            lineCount: lines.length,
            uri: vscode.Uri.parse('untitled:test.xml'),
        } as any;
    }

    // Creates a DiagnosticCollection mock that captures whatever is passed to set()
    function createMockCollection(): { collection: vscode.DiagnosticCollection; getCaptured: () => vscode.Diagnostic[] } {
        let captured: vscode.Diagnostic[] = [];
        const collection = {
            set: (_uri: vscode.Uri, diags: vscode.Diagnostic[]) => { captured = diags; },
            delete: () => {},
        } as any;
        return { collection, getCaptured: () => captured };
    }

    function createMockIndex(knownListeners: string[] = []): ConfigurationIndex {
        return { hasJavaListener: (name: string) => knownListeners.includes(name) } as any;
    }

    // --- Pipeline validation ---

    test('validatePipelines - valid Forward path produces no diagnostic', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <Pipe name="Step1" className="EchoPipe" />',
            '            <Exit name="EXIT" state="SUCCESS" />',
            '            <Forward name="success" path="EXIT" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex());

        await validator.validate(createMockDocument(xml));

        assert.strictEqual(getCaptured().length, 0, 'No diagnostics expected when all Forward paths resolve');
    });

    test('validatePipelines - invalid Forward path produces an error diagnostic', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <Pipe name="Step1" className="EchoPipe" />',
            '            <Forward name="success" path="NonExistentPipe" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex());

        await validator.validate(createMockDocument(xml));

        const diags = getCaptured();
        assert.strictEqual(diags.length, 1, 'One diagnostic expected for the invalid Forward path');
        assert.ok(diags[0].message.includes('NonExistentPipe'), 'Diagnostic message should name the invalid path');
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
    });

    test('validatePipelines - forward targeting an Exit name is valid', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <Exit name="SUCCESS" state="SUCCESS" />',
            '            <Forward name="success" path="SUCCESS" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex());

        await validator.validate(createMockDocument(xml));

        assert.strictEqual(getCaptured().length, 0, 'Forwarding to an Exit name should be valid');
    });

    // --- LocalSender / IbisLocalSender validation ---

    test('validateLocalSenders - known javaListener produces no diagnostic', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <LocalSender name="Sender" javaListener="KnownListener" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex(['KnownListener']));

        await validator.validate(createMockDocument(xml));

        assert.strictEqual(getCaptured().length, 0, 'No diagnostics expected for a known javaListener');
    });

    test('validateLocalSenders - unknown javaListener produces an error diagnostic', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <LocalSender name="Sender" javaListener="UnknownListener" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex([]));

        await validator.validate(createMockDocument(xml));

        const diags = getCaptured();
        assert.strictEqual(diags.length, 1, 'One diagnostic expected for an unknown javaListener');
        assert.ok(diags[0].message.includes('UnknownListener'), 'Diagnostic message should name the unknown listener');
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
    });

    test('validateLocalSenders - IbisLocalSender variant is also checked', async () => {
        const xml = [
            '<Configuration>',
            '    <Adapter name="A">',
            '        <Pipeline>',
            '            <IbisLocalSender name="Sender" javaListener="MissingListener" />',
            '        </Pipeline>',
            '    </Adapter>',
            '</Configuration>',
        ].join('\n');

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex([]));

        await validator.validate(createMockDocument(xml));

        const diags = getCaptured();
        assert.strictEqual(diags.length, 1, 'One diagnostic expected for IbisLocalSender with unknown javaListener');
        assert.ok(diags[0].message.includes('MissingListener'));
    });

    // --- General ---

    test('validate - non-XML documents are skipped entirely', async () => {
        const doc = {
            languageId: 'javascript',
            getText: () => 'const x = 1;',
            lineAt: () => ({ text: '' }),
            lineCount: 1,
            uri: vscode.Uri.parse('untitled:test.js'),
        } as any;

        const { collection, getCaptured } = createMockCollection();
        const validator = new FrankValidator(collection, createMockIndex());

        await validator.validate(doc);

        assert.strictEqual(getCaptured().length, 0, 'Non-XML documents should produce no diagnostics');
    });
});
