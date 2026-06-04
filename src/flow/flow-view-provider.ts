import * as vscode from 'vscode';
import * as path from 'path';
import * as SaxonJS from 'saxon-js';
import { JSDOM, XmlParser, XmlSerializer, XmlElement } from "jsdom";
import { buildFlowGraph, FlowGraph } from './layout-builder';

interface AdapterGraph {
    name: string;
    graph: FlowGraph | null;
    error: string | null;
}

type WebviewState =
    | { kind: 'empty' }
    | { kind: 'error'; message: string }
    | { kind: 'graph'; adapters: AdapterGraph[] };

interface WebviewMessage {
    type: string;
    pipeName?: string;
    adapterName?: string;
}

export default class FlowViewProvider implements vscode.WebviewViewProvider {
    context: vscode.ExtensionContext;
    webView: vscode.WebviewView | null = null;

    // Cached heavy resources — computed once per extension lifetime
    private canonicalizeSef: string | null = null;
    private mermaidSef: string | null = null;
    private paramsXdm: unknown = null;
    private domParser: XmlParser | null = null;
    private xmlSerializer: XmlSerializer | null = null;

    private htmlSet = false;
    private lastState: WebviewState = { kind: 'empty' };

    constructor(context: vscode.ExtensionContext) {
      this.context = context;
    }

    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void {
      this.webView = webviewView;
      this.webView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this.context.extensionUri],
      };

      const jsdomWindow = new JSDOM().window;
      (global as Record<string, unknown>).DOMParser = jsdomWindow.DOMParser;
      (global as Record<string, unknown>).document = jsdomWindow.document;
      this.domParser = new jsdomWindow.DOMParser();
      this.xmlSerializer = new jsdomWindow.XMLSerializer();

      this.htmlSet = false;

      this.webView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
        if (!msg || typeof msg !== 'object') {
          return;
        }
        if (msg.type === 'ready') {
          this.postState();
        } else if (msg.type === 'navigate' && typeof msg.pipeName === 'string') {
          void this.navigateToPipe(msg.pipeName, typeof msg.adapterName === 'string' ? msg.adapterName : undefined);
        }
      });

      void this.updateWebview();
    }

    async updateWebview() {
      if (!this.webView) {
        return;
      }

      if (!this.htmlSet) {
        this.webView.webview.html = this.getWebviewShellHtml();
        this.htmlSet = true;
      }

      this.lastState = await this.computeState();
      this.postState();
    }

    private postState() {
      if (!this.webView) {
        return;
      }
      this.webView.webview.postMessage({ type: 'state', state: this.lastState });
    }

    private async computeState(): Promise<WebviewState> {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.document.languageId !== "xml" || editor.document.fileName.endsWith(".xsd")) {
        return { kind: 'empty' };
      }

      let config = editor.document.getText();
      if (!config) {
        return { kind: 'empty' };
      }

      const dir = path.dirname(editor.document.fileName);
      config = await this.resolveIncludesAndEntities(config, dir);

      const parser = new (global as { DOMParser: new () => XmlParser }).DOMParser();
      const xml = parser.parseFromString(config, "text/xml");

      const parserErrors = xml.getElementsByTagName("parsererror");
      if (parserErrors.length > 0) {
        return { kind: 'error', message: String(parserErrors[0].textContent) };
      }

      const FRANK_ROOT_ELEMENTS = new Set(['configuration', 'module', 'adapter']);
      const rootName = xml.documentElement.nodeName.toLowerCase();
      if (!FRANK_ROOT_ELEMENTS.has(rootName)) {
        return { kind: 'empty' };
      }

      if (!this.canonicalizeSef) {
        this.canonicalizeSef = convertXSLtoSEF(this.context, "canonicalize");
      }
      if (!this.mermaidSef) {
        this.mermaidSef = convertXSLtoSEF(this.context, "adapter2mermaid");
      }

      try {
        if (!this.paramsXdm) {
          const paramsPath = path.join(this.context.extensionPath, "resources/flow/xml/params.xml");
          const paramsBuffer = await vscode.workspace.fs.readFile(vscode.Uri.file(paramsPath));
          const paramsContent = Buffer.from(paramsBuffer).toString('utf8');
          this.paramsXdm = await SaxonJS.getResource({ type: "xml", text: paramsContent });
        }

        const canonicalizedXml = SaxonJS.transform({
          stylesheetText: this.canonicalizeSef,
          sourceText: config,
          destination: "serialized"
        });

        const canonDoc = this.domParser!.parseFromString(canonicalizedXml.principalResult, "text/xml");
        const adapterNodes: XmlElement[] = Array.from(canonDoc.getElementsByTagName("adapter"));

        if (adapterNodes.length === 0) {
          return { kind: 'empty' };
        }

        const adapters: AdapterGraph[] = [];
        for (const adapterNode of adapterNodes) {
          const name = adapterNode.getAttribute("name") || "Adapter";
          const adapterXml = this.xmlSerializer!.serializeToString(adapterNode);
          try {
            const mermaid = SaxonJS.transform({
              stylesheetText: this.mermaidSef,
              sourceText: adapterXml,
              destination: "serialized",
              stylesheetParams: { frankElements: this.paramsXdm as Record<string, unknown> }
            });
            const graph = buildFlowGraph(mermaid.principalResult);
            adapters.push({ name, graph, error: null });
          } catch (innerErr) {
            const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
            console.error(`[WeAreFrank!] Layout failed for adapter "${name}":`, innerErr);
            adapters.push({ name, graph: null, error: message });
          }
        }

        return { kind: 'graph', adapters };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[WeAreFrank!] Flow processing failed:", error);
        return { kind: 'error', message: `Internal transformation error.\n\nDetails:\n${message}` };
      }
    }

    // Resolve SYSTEM entities and <Include> tags iteratively so that included
    // files' own includes/entities are also expanded (transitive resolution).
    // Strip XML comments first so patterns inside example comments are ignored.
    private async resolveIncludesAndEntities(config: string, dir: string): Promise<string> {
      config = config.replace(/^﻿/, '');
      const MAX_PASSES = 10;
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const configWithoutComments: string = config.replace(/<!--[\s\S]*?-->/g, '');
        let changed = false;

        const entityMatches: RegExpMatchArray[] = [...configWithoutComments.matchAll(/<!ENTITY\s+([\w.-]+)\s+SYSTEM\s+["']([^"']+)["']\s*>/gi)];
        for (const match of entityMatches) {
          const entityName: string = match[1];
          const relativePath: string = match[2];
          try {
            const entityUri = vscode.Uri.file(path.join(dir, relativePath));
            const fileData = await vscode.workspace.fs.readFile(entityUri);
            let entityContent = Buffer.from(fileData).toString('utf8');
            entityContent = entityContent.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/gi, '');
            const before: string = config;
            config = config.replace(new RegExp(`&${entityName};`, 'g'), () => entityContent);
            if (config !== before) { changed = true; }
          } catch (error) {
            const errorMsg = `Unable to load entity '&${entityName};'. File '${relativePath}' is missing or unreadable.`;
            console.error(`[WeAreFrank!] ${errorMsg}`, error);
            vscode.window.showWarningMessage(`WeAreFrank! Flow: ${errorMsg}`);
          }
        }

        const includeMatches: RegExpMatchArray[] = [...configWithoutComments.matchAll(/<Include\s+ref=["']([^"']+)["']\s*(?:\/>|>\s*<\/Include>)/gi)];
        for (const match of includeMatches) {
          const fullMatch: string = match[0];
          const relativePath: string = match[1];
          try {
            const includeUri = vscode.Uri.file(path.join(dir, relativePath));
            const fileData = await vscode.workspace.fs.readFile(includeUri);
            let includeContent = Buffer.from(fileData).toString('utf8');
            includeContent = includeContent.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/gi, '');
            config = config.replace(fullMatch, () => includeContent);
            changed = true;
          } catch (error) {
            const errorMsg = `Unable to resolve Include reference. File '${relativePath}' is missing or unreadable.`;
            console.error(`[WeAreFrank!] ${errorMsg}`, error);
            vscode.window.showWarningMessage(`Frank!Flow: ${errorMsg}`);
          }
        }

        if (!changed) { break; }
      }
      return config;
    }

    private async navigateToPipe(pipeName: string, adapterName?: string) {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "xml") {
        return;
      }

      const text = editor.document.getText();
      const match = findPipeInDocument(text, pipeName, adapterName);
      if (match) {
        revealMatch(editor, match);
        return;
      }

      // Pipe not in active document — search included files
      const dir = path.dirname(editor.document.fileName);
      const found = await findPipeInIncludes(text, dir, pipeName);
      if (found) {
        const doc = await vscode.workspace.openTextDocument(found.uri);
        const includeEditor = await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.Beside,
          preserveFocus: true,
        });
        revealMatch(includeEditor, found.match, true);
        return;
      }

      vscode.window.showInformationMessage(`Frank!Flow: '${pipeName}' not found in the active document.`);
    }

    private getWebviewShellHtml(): string {
      const webview = this.webView!.webview;
      const nonce = getNonce();

      const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, 'out', 'flow', 'webview', 'webview.js')
      );
      const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, 'out', 'flow', 'webview', 'webview.css')
      );

      const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource} data:`,
        `script-src 'nonce-${nonce}'`,
      ].join('; ');

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Flow</title>
  <style>
    html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
    body { background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function convertXSLtoSEF(context: vscode.ExtensionContext, xsl: string): string {
  const xslPath = path.join(
    context.extensionPath,
    "resources/flow/xsl",
    xsl + ".xsl"
  );

  const env = SaxonJS.getPlatform();
  const doc = env.parseXmlFromString(env.readFile(xslPath));

  const lookupDir = path.join(
    context.extensionPath,
    "resources/flow/xml"
  ).replace(/\\/g, "/");
  doc._saxonBaseUri = `file://${lookupDir}/`;

  return JSON.stringify(SaxonJS.compile(doc));
}

// Locate a pipe/element in the document text using three strategies in order:
//
// 1. name="pipeName" attribute — covers all named pipes and named exits.
// 2. Tag name ending with pipeName (case-insensitive) — covers unnamed
//    wrappers/validators whose canonical type name IS the label
//    (e.g. pipeName "InputWrapper" finds <SoapInputWrapper ...).
// 3. state="pipeName" attribute — covers exit nodes whose label comes from
//    their state value rather than their name attribute.
//
// Returns a RegExpExecArray where match[1] is the token to select, so the
// caller can highlight the exact attribute value or tag name.
//
// When adapterName is provided the search is restricted to within that
// adapter's XML block, so clicking a receiver in one adapter doesn't
// accidentally navigate to a same-named element in another adapter.
function findPipeInDocument(text: string, pipeName: string, adapterName?: string): RegExpExecArray | null {
  // Narrow to the adapter's block when possible so that unnamed elements
  // (e.g. <Receiver>) resolve to the right adapter in multi-adapter configs.
  let scope = text;
  let offset = 0;
  if (adapterName) {
    const escapedAdapter = adapterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const adapterStart = new RegExp(`<[Aa]dapter\\b[^>]*\\bname\\s*=\\s*["']${escapedAdapter}["']`);
    const startMatch = adapterStart.exec(text);
    if (startMatch) {
      offset = startMatch.index;
      const closingRe = /<\/[Aa]dapter\s*>/g;
      closingRe.lastIndex = offset;
      const closeMatch = closingRe.exec(text);
      scope = closeMatch
        ? text.slice(offset, closeMatch.index + closeMatch[0].length)
        : text.slice(offset);
    }
  }

  const escaped = pipeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // STEP 1: name attribute match
  const byName = new RegExp(`<[A-Za-z][\\w.-]*\\b[^>]*\\bname\\s*=\\s*["'](${escaped})["']`);
  const m1 = byName.exec(scope);
  if (m1) { m1.index += offset; return m1; }

  // STEP 2: tag name ending with pipeName (case-insensitive) — for unnamed
  // wrappers/validators. e.g. "InputWrapper" → <SoapInputWrapper, <ApiInputWrapper
  const byTag = new RegExp(`<([A-Za-z][\\w.]*${escaped})(?:\\s|>|\\/)`,'i');
  const m2 = byTag.exec(scope);
  if (m2) { m2.index += offset; return m2; }

  // STEP 3: state attribute match — for exit nodes labeled by state
  const byState = new RegExp(`<[A-Za-z][\\w.-]*\\b[^>]*\\bstate\\s*=\\s*["'](${escaped})["']`,'i');
  const m3 = byState.exec(scope);
  if (m3) { m3.index += offset; return m3; }

  return null;
}

function revealMatch(editor: vscode.TextEditor, match: RegExpExecArray, preserveFocus = false): void {
  const valueStart = match.index + match[0].lastIndexOf(match[1]);
  const startPos = editor.document.positionAt(valueStart);
  const endPos = editor.document.positionAt(valueStart + match[1].length);
  const selection = new vscode.Selection(startPos, endPos);
  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
  vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus });
}

async function findPipeInIncludes(
  text: string,
  dir: string,
  pipeName: string,
  visited: Set<string> = new Set()
): Promise<{ uri: vscode.Uri; match: RegExpExecArray } | null> {
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, '');
  const includeMatches = [...withoutComments.matchAll(/<Include\s+ref=["']([^"']+)["']\s*(?:\/>|>\s*<\/Include>)/gi)];
  for (const inc of includeMatches) {
    const relativePath = inc[1];
    try {
      const uri = vscode.Uri.file(path.join(dir, relativePath));
      const key = uri.fsPath;
      if (visited.has(key)) { continue; }
      visited.add(key);

      const fileData = await vscode.workspace.fs.readFile(uri);
      const includeText = Buffer.from(fileData).toString('utf8');

      const match = findPipeInDocument(includeText, pipeName);
      if (match) {
        return { uri, match };
      }

      // Recurse into this file's own includes
      const nested = await findPipeInIncludes(includeText, path.dirname(uri.fsPath), pipeName, visited);
      if (nested) { return nested; }
    } catch {
      // unreadable include — skip
    }
  }
  return null;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
