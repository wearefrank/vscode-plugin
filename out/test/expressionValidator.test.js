"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert = require("assert");
const vscode = require("vscode");
const expressionValidator_1 = require("../validation/expressionValidator");
suite('ExpressionValidator Test Suite', () => {
    const validator = new expressionValidator_1.ExpressionValidator();
    const DUMMY_RANGE = new vscode.Range(0, 0, 0, 10);
    function makeActiveToken() {
        return { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { } }) };
    }
    function makeCancelledToken() {
        return { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => { } }) };
    }
    // --- JSONPath ---
    test('checkExpression - valid JSONPath produces no diagnostic', async () => {
        const result = await validator.checkExpression('jsonPath', '$.foo.bar', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null);
    });
    test('checkExpression - invalid JSONPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('jsonPath', '!!!invalid!!!', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an invalid JSONPath');
        assert.ok(result.message.includes('Invalid JsonPath expression'), `Unexpected message: ${result.message}`);
        assert.strictEqual(result.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(result.source, 'Frank!Validator');
    });
    test('checkExpression - blank JSONPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('jsonPath', '   ', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an empty JSONPath');
        assert.ok(result.message.includes('cannot be empty'));
    });
    // --- XPath ---
    test('checkExpression - valid XPath produces no diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '/root/node', DUMMY_RANGE, makeActiveToken());
        assert.strictEqual(result, null);
    });
    test('checkExpression - invalid XPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '///bad:::', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an invalid XPath');
        assert.ok(result.message.includes('Invalid XPath expression'), `Unexpected message: ${result.message}`);
        assert.strictEqual(result.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(result.source, 'Frank!Validator');
    });
    test('checkExpression - blank XPath produces an error diagnostic', async () => {
        const result = await validator.checkExpression('xpathExpression', '', DUMMY_RANGE, makeActiveToken());
        assert.ok(result, 'Expected a diagnostic for an empty XPath');
        assert.ok(result.message.includes('cannot be empty'));
    });
    // --- Range and source are preserved ---
    test('checkExpression - diagnostic range and source match what was passed in', async () => {
        const range = new vscode.Range(3, 5, 3, 15);
        const result = await validator.checkExpression('jsonPath', '!!!bad!!!', range, makeActiveToken());
        assert.ok(result);
        assert.deepStrictEqual(result.range, range);
        assert.strictEqual(result.source, 'Frank!Validator');
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
//# sourceMappingURL=expressionValidator.test.js.map