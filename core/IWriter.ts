import type { AbstractAstNode } from "./AbstractAstNode.js";
import type { Reference } from "./Reference.js";

// Language-agnostic writer interface.
// All AST nodes are typed against this, not AbstractWriter,
// so language-specific writers can compose rather than only inherit.
export interface IWriter {
    write(...parts: (string | AbstractAstNode | undefined)[]): void;
    writeNode(node: AbstractAstNode): void;
    writeLine(...parts: (string | AbstractAstNode | undefined)[]): void;
    // With args: writes parts then appends ; and newline.
    // With no args: just appends ; and newline (used after manually writing content).
    writeStatement(...parts: (string | AbstractAstNode | undefined)[]): void;
    writeNodeStatement(node: AbstractAstNode): void;
    newLine(): void;
    writeNewLineIfLastLineNot(): void;
    indent(): void;
    dedent(): void;
    pushScope(): void;
    popScope(): void;
    // Import tracking hook — no-op in the base, overridden per language.
    addReference(ref: Reference): void;
    toString(): string;
}
