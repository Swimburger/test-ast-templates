import { AbstractAstNode } from "./AbstractAstNode.js";
import { Statement } from "./Statement.js";
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

// ---------------------------------------------------------------------------
// RawNode — language-specific escape hatch.
//
// Identical rendering to ast``, but carries a language tag so tooling can
// identify and audit raw fragments. Use cs.raw`` or ts.raw`` rather than
// the bare ast`` tag.
//
// Works as both an expression (no terminator — containing node controls it)
// and as a statement (writeArgStatement appends the language's terminator).
// ---------------------------------------------------------------------------

export type RawLanguage = "csharp" | "typescript" | string;

// RawNode extends Statement so writeArgStatement treats it as self-terminating —
// no terminator or newline is appended. The caller is responsible for the full
// content including any trailing semicolon. When used inline as an expression
// (via writeArg), it writes exactly the template content and nothing else.
export class RawNode extends Statement {
    constructor(
        public readonly language: RawLanguage,
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

export function makeRaw(language: RawLanguage): (strings: TemplateStringsArray, ...values: AstArg[]) => RawNode {
    return (strings, ...values) => new RawNode(language, strings, values);
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
