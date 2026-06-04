import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExpressionValidator } from '../validation/expressionValidator';

suite('ExpressionValidator Test Suite', () => {

    const validator = new ExpressionValidator();
    const DUMMY_RANGE = new vscode.Range(0, 0, 0, 10);

    function makeActiveToken(): vscode.CancellationToken {
        return { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as unknown as vscode.CancellationToken;
    }

    function makeCancelledToken(): vscode.CancellationToken {
        return { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) } as unknown as vscode.CancellationToken;
    }

    // --- JSONPath ---

    test('checkExpression - valid JSONPath produces no diagnostic', async () => {
        const result = await validator.checkExpression('jsonPath', '$.foo.bar', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null);
    });

    test('checkExpression - invalid JSONPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('jsonPath', '!!!invalid!!!', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an invalid JSONPath');
        assert.ok(result!.message.includes('Invalid JsonPath expression'), `Unexpected message: ${result!.message}`);
        assert.strictEqual(result!.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(result!.source, 'Frank!Validator');
    });

    test('checkExpression - blank JSONPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('jsonPath', '   ', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an empty JSONPath');
        assert.ok(result!.message.includes('cannot be empty'));
    });

    // --- XPath ---

    test('checkExpression - valid XPath produces no diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '/root/node', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null);
    });

    test('checkExpression - XPath with namespace prefix produces no diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', 'soapenv:Envelope/soapenv:Body', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null, 'Namespace-qualified XPath should not produce a false positive');
    });

    test('checkExpression - XPath with variable reference produces no diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '//*[@id=$myParam]', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null, 'XPath with $variable should not produce a false positive');
    });

    test('checkExpression - invalid XPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '///bad:::', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an invalid XPath');
        assert.ok(result!.message.includes('Invalid XPath expression'), `Unexpected message: ${result!.message}`);
        assert.strictEqual(result!.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(result!.source, 'Frank!Validator');
    });

    test('checkExpression - blank XPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an empty XPath');
        assert.ok(result!.message.includes('cannot be empty'));
    });

    // --- Range and source are preserved ---

    test('checkExpression - diagnostic range and source match what was passed in', async () => {
        const range = new vscode.Range(3, 5, 3, 15);
        const result = await validator.checkExpression('jsonPath', '!!!bad!!!', range, makeActiveToken());
        assert.ok(result);
        assert.deepStrictEqual(result!.range, range);
        assert.strictEqual(result!.source, 'Frank!Validator');
    });

    // --- Attribute aliases ---

    test('checkExpression - jsonPathExpression alias validates as JSONPath', async () => {
        const valid = await validator.checkExpression('jsonPathExpression', '$.foo.bar', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(valid, null);
        const invalid = await validator.checkExpression('jsonPathExpression', '!!!bad!!!', DUMMY_RANGE, makeActiveToken());
        assert.ok(invalid, 'Expected diagnostic for invalid jsonPathExpression');
    });

    test('checkExpression - elementXPathExpression alias validates as XPath', async () => {
        const valid = await validator.checkExpression('elementXPathExpression', '/lines/*', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(valid, null);
        const invalid = await validator.checkExpression('elementXPathExpression', '///bad:::', DUMMY_RANGE, makeActiveToken());
        assert.ok(invalid, 'Expected diagnostic for invalid elementXPathExpression');
    });

    // --- Unknown attribute ---

    test('checkExpression - unknown attribute name produces no diagnostic', async () => {
        const result = await validator.checkExpression('unknownAttr', 'anything', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null);
    });

    // --- Cancellation ---

    test('checkExpression - cancelled token short-circuits JSONPath validation', async () => {
        const result = await validator.checkExpression('jsonPath', '!!!invalid!!!', DUMMY_RANGE, makeCancelledToken());
        assert.strictEqual(result, null, 'Cancelled token should short-circuit validation');
    });

    test('checkExpression - cancelled token short-circuits XPath validation', async () => {
        const result = await validator.checkExpression('xpathExpression', '///bad:::', DUMMY_RANGE, makeCancelledToken());
        assert.strictEqual(result, null, 'Cancelled token should short-circuit validation');
    });
});
