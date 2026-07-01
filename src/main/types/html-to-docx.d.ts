declare module "html-to-docx" {
  interface HtmlToDocxOptions {
    title?: string;
    lang?: string;
    font?: string;
    table?: {
      row?: {
        cantSplit?: boolean;
      };
    };
  }

  export default function htmlToDocx(
    htmlString: string,
    headerHTMLString?: string,
    documentOptions?: HtmlToDocxOptions,
    footerHTMLString?: string,
  ): Promise<Buffer>;
}
