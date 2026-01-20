const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const SaxonJS = require('saxon-js');
const frankLayout = require("@frankframework/frank-config-layout");
const { JSDOM } = require("jsdom")

class FlowViewProvider {
    constructor(context) {
      this.context = context;
    }

    resolveWebviewView(webviewView) {
      this.webView = webviewView;
      this.webView.webview.options = { enableScripts: true };

      global.DOMParser = new JSDOM().window.DOMParser;
      global.document = new JSDOM().window.document;
      
      this.updateWebview();
    }

    async updateWebview() {
      if (!this.webView) {
        return;
      }

      const config = getCurrentConfiguration();

      const parser = new DOMParser();
      const xml = parser.parseFromString(config, "text/xml");

      const parserErrors = xml.getElementsByTagName("parsererror");

      if (parserErrors.length > 0) {
          const error = parserErrors[0].textContent;
          this.webView.webview.html = getErrorWebviewContent(error);
          return;
      }

      const canonicalizeSef = convertXSLtoSEF(this.context, "canonicalize");

      const canoncalizedXml = SaxonJS.transform({
        stylesheetText: canonicalizeSef,
        sourceText: config,
        destination: "serialized"
      });

      const isAdapter = config.split("\n")[0].includes("adapter");

      const mermaidSef = convertXSLtoSEF(
        this.context,
        isAdapter ? "adapter2mermaid" : "configuration2mermaid"
      );

      const paramsPath = path.join(this.context.extensionPath, "resources/flow/xml/params.xml");
      const params = fs.readFileSync(paramsPath, 'utf8');
      const paramsXdm = await SaxonJS.getResource({
        type: "xml",
        text: params
      });

      const mermaid = SaxonJS.transform({
        stylesheetText: mermaidSef,
        sourceText: canoncalizedXml.principalResult,
        destination: "serialized",
        stylesheetParams: {
          frankElements: paramsXdm
        }
      });

      const css = this.webView.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          'resources',
          'css',
          'flow-view-webcontent.css'
        )
      );

      const codiconCss = this.webView.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          'resources',
          'css',
          'codicon.css'
        )
      );

      const script = this.webView.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          'src',
          'flow',
          'flow-view-script.js'
        )
      );

      const zoomScript = this.webView.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          'node_modules',
          'svg-pan-zoom',
          'dist',
          'svg-pan-zoom.min.js'
        )
      );

      try {
        frankLayout.initMermaid2Svg(frankLayout.getFactoryDimensions());
        const svg = await frankLayout.mermaid2svg(mermaid.principalResult);

        this.webView.webview.html = getWebviewContent(svg, css, codiconCss, script, zoomScript);
      } catch (err) {
        this.webView.webview.html = getErrorWebviewContent("This XML cannot be converted to a Flowchart");
      }
    }
}

function convertXSLtoSEF(context, xsl) {
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


function getCurrentConfiguration() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "";
  }
  return editor.document.getText();
}

function getWebviewContent(svg, css, codiconCss, script, zoomScript) {
  return `
  <!DOCTYPE html>
  <html>
      <head>
        <meta charset="UTF-8">
        <title>Flowchart</title>
        <link rel="stylesheet" href="${css}">
        <link rel="stylesheet" href="${codiconCss}" >
      </head>
      <body>
        <div id="container">
          ${svg}
          <div id="toolbar">
            <i class="codicon codicon-zoom-in" id="zoom-in"></i>
            <i class="codicon codicon-discard" id="reset"></i>
            <i class="codicon codicon-zoom-out" id="zoom-out"></i>
          </div>
        </div>

        <script src="${zoomScript}"></script>
        <script src="${script}"></script>
      </body>
  </html>
  `;
}

function getErrorWebviewContent(error) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Flowchart – Error</title>
        <style>
            body {
                font-family: sans-serif;
                color: var(--vscode-errorForeground);
                padding: 10px;
            }
            pre {
                background: var(--vscode-editorWidget-background);
                border-left: 4px solid var(--vscode-errorForeground);
                padding: 5px;
                white-space: pre-wrap;
            }
        </style>
    </head>
    <body>
        <h2>Error</h2>
        <p>Something is wrong with your XML :(</p>
        <pre>${error}</pre>
    </body>
    </html>
    `;
}

module.exports = FlowViewProvider;