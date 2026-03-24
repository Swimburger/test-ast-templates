import type { IndentStyle } from "../core/AbstractWriter.js";
import type { AstArg } from "../core/AstTemplate.js";
import { writeArg } from "../core/AstTemplate.js";
import { Writer } from "./Writer.js";

export function renderFile(args: AstArg[], opts: { indentStyle?: IndentStyle } = {}): string {
    const writer = new Writer(opts);
    for (const arg of args) writeArg(writer, arg);
    return writer.toString();
}
