import type { AbstractAstNode } from "./AbstractAstNode.js";
import type { IWriter } from "./IWriter.js";
import type { Reference } from "./Reference.js";

export type IndentStyle =
    | { type: "tab" }
    | { type: "spaces"; size: number };

const DEFAULT_INDENT: IndentStyle = { type: "spaces", size: 4 };

export abstract class AbstractWriter implements IWriter {
    private buffer_: string = "";
    private indentLevel = 0;
    private lastCharacterIsNewline = false;
    private lastCharacterIsSemicolon = false;
    private readonly indentStyle: IndentStyle;

    constructor({ indentStyle = DEFAULT_INDENT }: { indentStyle?: IndentStyle } = {}) {
        this.indentStyle = indentStyle;
    }

    protected get buffer(): string {
        return this.buffer_;
    }

    // Import tracking hook — no-op by default.
    // Language-specific writers override this to collect references.
    public addReference(_ref: Reference): void {}

    public write(...parts: (string | AbstractAstNode | undefined)[]): void {
        for (const part of parts) {
            if (part == null) continue;
            if (typeof part === "string") {
                this.writeString(part);
            } else {
                this.writeNode(part);
            }
        }
    }

    public writeNode(node: AbstractAstNode): void {
        node.write(this);
    }

    public writeLine(...parts: (string | AbstractAstNode | undefined)[]): void {
        this.write(...(parts.length === 0 ? [""] : parts));
        this.writeNewLineIfLastLineNot();
    }

    public writeStatement(...parts: (string | AbstractAstNode | undefined)[]): void {
        this.write(...parts);
        if (!this.lastCharacterIsSemicolon) {
            this.writeRaw(";");
        }
        this.writeNewLineIfLastLineNot();
    }

    public writeNodeStatement(node: AbstractAstNode): void {
        this.writeNode(node);
        if (!this.lastCharacterIsSemicolon) {
            this.writeRaw(";");
        }
        this.writeNewLineIfLastLineNot();
    }

    public newLine(): void {
        this.writeRaw(`\n${this.getIndentString()}`);
    }

    public writeNewLineIfLastLineNot(): void {
        if (!this.lastCharacterIsNewline) {
            this.newLine();
        }
    }

    public indent(): void {
        this.indentLevel++;
        this.writeRaw(this.getTabString());
    }

    public dedent(): void {
        if (this.indentLevel === 0) return;
        this.indentLevel--;
        const tab = this.getTabString();
        if (this.buffer_.endsWith(`\n${this.getIndentString()}${tab}`)) {
            this.buffer_ = this.buffer_.slice(0, -tab.length);
        }
    }

    public pushScope(): void {
        this.writeLine("{");
        this.indent();
    }

    public popScope(): void {
        this.dedent();
        this.writeNewLineIfLastLineNot();
        this.write("}");
    }

    public toString(): string {
        return this.buffer_;
    }

    protected writeRaw(text: string): void {
        if (text.length === 0) return;
        this.buffer_ += text;
        const indent = this.getIndentString();
        this.lastCharacterIsNewline = this.buffer_.endsWith(`\n${indent}`) || this.buffer_.endsWith("\n");
        this.lastCharacterIsSemicolon = text.endsWith(";");
    }

    private getTabString(): string {
        return this.indentStyle.type === "tab" ? "\t" : " ".repeat(this.indentStyle.size);
    }

    private getIndentString(): string {
        return this.getTabString().repeat(this.indentLevel);
    }

    private writeString(text: string): void {
        const indent = this.getIndentString();
        const indented = text.replaceAll("\n", `\n${indent}`);
        this.writeRaw(indented);
    }
}
