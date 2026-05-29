declare module 'jsdom' {
  export interface XmlElement {
    getAttribute(name: string): string | null;
    textContent: string | null;
  }

  export interface ParsedXmlDocument {
    getElementsByTagName(name: string): ArrayLike<XmlElement>;
    documentElement: { nodeName: string };
  }

  export interface XmlParser {
    parseFromString(markup: string, type: string): ParsedXmlDocument;
  }

  export interface XmlSerializer {
    serializeToString(node: XmlElement): string;
  }

  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    window: {
      DOMParser: new () => XmlParser;
      XMLSerializer: new () => XmlSerializer;
      document: ParsedXmlDocument;
    };
  }
}
