import type { IndentStyle } from "../core/AbstractWriter.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import { Writer } from "./Writer.js";
import type { CsFileNode } from "./slots.js";

export function renderFile(args: CsFileNode[], opts: { indentStyle?: IndentStyle } = {}): string {
    const writer = new Writer(opts);
    for (const arg of args) writeArg(writer, arg as AstArg);
    return writer.toString();
}
