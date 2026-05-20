declare module 'saxon-js' {
  export interface SaxonDocumentNode {
    _saxonBaseUri: string;
  }

  export interface TransformOptions {
    stylesheetText?: string;
    sourceText?: string;
    destination?: string;
    stylesheetParams?: Record<string, unknown>;
  }

  export interface TransformResult {
    principalResult: string;
  }

  export interface ResourceOptions {
    type: string;
    text?: string;
    location?: string;
  }

  export interface Platform {
    parseXmlFromString(s: string): SaxonDocumentNode;
    readFile(path: string): string;
  }

  export function transform(options: TransformOptions): TransformResult;
  export function compile(doc: SaxonDocumentNode): unknown;
  export function getResource(options: ResourceOptions): Promise<unknown>;
  export function getPlatform(): Platform;
}
