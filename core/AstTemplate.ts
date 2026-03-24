import { AbstractAstNode } from "./AbstractAstNode.js";
import type { IWriter } from "./IWriter.js";

// Flexible input type accepted everywhere in the AST.
// Functions are lazy — evaluated at write time, not construction time.
export type AstArg =
    | string
    | AbstractAstNode
    | AstArg[]
    | (() => AstArg);

// Standalone template tag — constructs a node, never touches a writer.
//
//   const node = ast`const x: ${UserRef} = ${valueNode}`;
//
export function ast(strings: TemplateStringsArray, ...values: AstArg[]): AbstractAstNode {
    return new AstTemplateNode(strings, values);
}

class AstTemplateNode extends AbstractAstNode {
    constructor(
        private readonly strings: TemplateStringsArray,
        private readonly values: AstArg[],
    ) {
        super();
    }

    public write(writer: IWriter): void {
        for (let i = 0; i < this.strings.length; i++) {
            if (i > 0) writeArg(writer, this.values[i - 1]!);
            const s = this.strings[i]!;
            if (s) writer.write(s);
        }
    }
}

// Internal — used by helpers.ts and renderFile.ts.
// Not exported from index.ts; not part of the public API.
export function writeArg(writer: IWriter, arg: AstArg): void {
    if (typeof arg === "string") {
        writer.write(arg);
    } else if (typeof arg === "function") {
        writeArg(writer, arg());
    } else if (Array.isArray(arg)) {
        for (const a of arg) writeArg(writer, a);
    } else {
        writer.writeNode(arg);
    }
}
