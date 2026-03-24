// XML doc comment support for C# AST nodes.
//
// writeXmlDoc(writer, { summary, returns, params })
//
// Generates:
//   /// <summary>
//   /// Summary text.
//   /// </summary>
//   /// <param name="id">The ID.</param>
//   /// <returns>The result.</returns>

import type { IWriter } from "../core/IWriter.js";

export interface XmlDoc {
    summary: string;
    returns?: string;
    params?: Record<string, string>;
    remarks?: string;
}

export function writeXmlDoc(writer: IWriter, doc: string | XmlDoc): void {
    const d: XmlDoc = typeof doc === "string" ? { summary: doc } : doc;

    writer.writeLine("/// <summary>");
    for (const line of d.summary.split("\n")) {
        writer.writeLine(`/// ${line}`);
    }
    writer.writeLine("/// </summary>");

    if (d.remarks) {
        writer.writeLine("/// <remarks>");
        for (const line of d.remarks.split("\n")) {
            writer.writeLine(`/// ${line}`);
        }
        writer.writeLine("/// </remarks>");
    }

    if (d.params) {
        for (const [name, text] of Object.entries(d.params)) {
            writer.writeLine(`/// <param name="${name}">${text}</param>`);
        }
    }

    if (d.returns) {
        writer.writeLine(`/// <returns>${d.returns}</returns>`);
    }
}
