// Shared writing helpers for C# AST nodes.

import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { Statement } from "./Statement.js";

// Writes an AstArg as a statement (appends ; and newline).
// Skips the semicolon for Statement nodes, which are self-terminating.
export function writeArgStatement(writer: IWriter, arg: AstArg): void {
    if (arg instanceof Statement) {
        writeArg(writer, arg);
        writer.writeNewLineIfLastLineNot();
    } else {
        writeArg(writer, arg);
        writer.write(";");
        writer.writeNewLineIfLastLineNot();
    }
}

export function writeDelimited(writer: IWriter, args: AstArg[]): void {
    for (let i = 0; i < args.length; i++) {
        if (i > 0) writer.write(", ");
        writeArg(writer, args[i]!);
    }
}
