import type { IndentStyle } from "../core/AbstractWriter.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import { Writer } from "./Writer.js";
import type { TsFileNode } from "./nodes.js";

export function renderFile(args: TsFileNode[], opts: { indentStyle?: IndentStyle } = {}): string {
    const writer = new Writer(opts);
    for (let i = 0; i < args.length; i++) {
        if (i > 0) writer.newLine();
        writeArg(writer, args[i]! as AstArg);
    }
    return writer.toString();
}
