import type { AbstractAstNode } from "./AbstractAstNode.js";
import type { IWriter } from "./IWriter.js";
import type { Reference } from "./Reference.js";
import type { ILanguageConfig } from "./ILanguageConfig.js";
import type { IndentStyle } from "./AbstractWriter.js";

const DEFAULT_INDENT: IndentStyle = { type: "spaces", size: 4 };

/**
 * Stream-based writer: accumulates chunks in a string[] instead of
 * concatenating into a single string on every write. The array is only
 * joined in toString(), which is called once at the end.
 *
 * Drop-in replacement for AbstractWriter — same interface, same behaviour,
 * different internal storage strategy.
 */
export abstract class AbstractChunkWriter implements IWriter {
    private chunks: string[] = [];
    private indentLevel = 0;
    private lastCharacterIsNewline = false;
    private lastCharacterIsTerminator = false;
    private readonly indentStyle: IndentStyle;
    public readonly languageConfig: ILanguageConfig;

    // Cached indent strings — recomputed only when indentLevel changes.
    private readonly tabUnit: string;
    private indentString: string = "";
    private newlineWithIndent: string = "\n";
    // Pre-computed: whether this language uses a statement terminator at all.
    private readonly hasTerminator: boolean;

    constructor({ indentStyle = DEFAULT_INDENT, languageConfig }: { indentStyle?: IndentStyle; languageConfig: ILanguageConfig }) {
        this.indentStyle = indentStyle;
        this.languageConfig = languageConfig;
        this.tabUnit = indentStyle.type === "tab" ? "\t" : " ".repeat(indentStyle.size);
        this.hasTerminator = languageConfig.statementTerminator.length > 0;
    }

    protected get buffer(): string {
        return this.chunks.join("");
    }

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
        if (parts.length === 0) {
            this.writeRaw("");
        } else {
            this.write(...parts);
        }
        this.writeNewLineIfLastLineNot();
    }

    public writeStatement(...parts: (string | AbstractAstNode | undefined)[]): void {
        if (parts.length > 0) this.write(...parts);
        if (this.hasTerminator && !this.lastCharacterIsTerminator) {
            this.writeRaw(this.languageConfig.statementTerminator);
        }
        this.writeNewLineIfLastLineNot();
    }

    public writeNodeStatement(node: AbstractAstNode): void {
        this.writeNode(node);
        if (this.hasTerminator && !this.lastCharacterIsTerminator) {
            this.writeRaw(this.languageConfig.statementTerminator);
        }
        this.writeNewLineIfLastLineNot();
    }

    public newLine(): void {
        this.writeRaw(this.newlineWithIndent);
    }

    public writeNewLineIfLastLineNot(): void {
        if (!this.lastCharacterIsNewline) {
            this.newLine();
        }
    }

    public indent(): void {
        this.indentLevel++;
        this.indentString += this.tabUnit;
        this.newlineWithIndent = `\n${this.indentString}`;
        this.writeRaw(this.tabUnit);
    }

    public dedent(): void {
        if (this.indentLevel === 0) return;
        this.indentLevel--;
        const tab = this.tabUnit;
        this.indentString = this.indentString.slice(0, -tab.length);
        this.newlineWithIndent = `\n${this.indentString}`;
        // Trim the trailing indent tab from the last chunk when possible
        // (the common case — indent() always pushes exactly one tabUnit chunk).
        const last = this.chunks[this.chunks.length - 1];
        if (last !== undefined && last.endsWith(tab)) {
            const trimmed = last.slice(0, -tab.length);
            if (trimmed.length === 0) {
                this.chunks.pop();
            } else {
                this.chunks[this.chunks.length - 1] = trimmed;
            }
        } else {
            // Rare path: tab spans multiple chunks — join and trim once.
            const joined = this.chunks.join("");
            if (joined.endsWith(this.newlineWithIndent + tab)) {
                this.chunks = [joined.slice(0, -tab.length)];
            }
        }
    }

    public pushScope(): void {
        const { scopeOpen, scopeStyle } = this.languageConfig;
        if (scopeStyle === "allman") {
            if (scopeOpen) this.writeLine(scopeOpen);
            else this.newLine();
        } else {
            if (scopeOpen) this.write(` ${scopeOpen}`);
            this.newLine();
        }
        this.indent();
    }

    public pushScopeInline(): void {
        const { scopeOpen } = this.languageConfig;
        if (scopeOpen) this.write(` ${scopeOpen}`);
        this.newLine();
        this.indent();
    }

    public popScope(): void {
        this.dedent();
        this.writeNewLineIfLastLineNot();
        const { scopeClose } = this.languageConfig;
        if (scopeClose) this.write(scopeClose);
    }

    public toString(): string {
        return this.chunks.join("");
    }

    protected writeRaw(text: string): void {
        if (text.length === 0) return;
        this.chunks.push(text);
        this.lastCharacterIsNewline = text === this.newlineWithIndent || text === "\n";
        this.lastCharacterIsTerminator = this.hasTerminator && text.endsWith(this.languageConfig.statementTerminator);
    }

    private writeString(text: string): void {
        if (!text.includes("\n")) {
            this.writeRaw(text);
            return;
        }
        const indented = text.replaceAll("\n", this.newlineWithIndent);
        this.writeRaw(indented);
    }
}
