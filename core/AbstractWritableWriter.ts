import type { Writable } from "node:stream";
import type { AbstractAstNode } from "./AbstractAstNode.js";
import type { IWriter } from "./IWriter.js";
import type { Reference } from "./Reference.js";
import type { ILanguageConfig } from "./ILanguageConfig.js";
import type { IndentStyle } from "./AbstractWriter.js";

const DEFAULT_INDENT: IndentStyle = { type: "spaces", size: 4 };

/**
 * Node-stream writer: accumulates body chunks during the AST walk, then flushes
 * them directly to a Node.js Writable (e.g. fs.createWriteStream) via pipeToNode().
 * Import/using directives are collected in-memory and written as the first chunk.
 *
 * pipeToNode() pumps chunks synchronously — no per-chunk async round-trips through
 * the event loop. The stream's internal buffer handles backpressure.
 *
 * toString() is also supported for drop-in compatibility.
 */
export abstract class AbstractWritableWriter implements IWriter {
    // Body chunks enqueued during the AST walk.
    private readonly bodyChunks: string[] = [];

    private indentLevel = 0;
    private lastCharacterIsNewline = false;
    private lastCharacterIsTerminator = false;
    private readonly indentStyle: IndentStyle;
    public readonly languageConfig: ILanguageConfig;

    private readonly tabUnit: string;
    private indentString: string = "";
    private newlineWithIndent: string = "\n";
    private readonly hasTerminator: boolean;

    constructor({ indentStyle = DEFAULT_INDENT, languageConfig }: { indentStyle?: IndentStyle; languageConfig: ILanguageConfig }) {
        this.indentStyle = indentStyle;
        this.languageConfig = languageConfig;
        this.tabUnit = indentStyle.type === "tab" ? "\t" : " ".repeat(indentStyle.size);
        this.hasTerminator = languageConfig.statementTerminator.length > 0;
    }

    // Subclasses override to return the header string (imports / usings),
    // which is written to the stream before the body chunks.
    protected header(): string {
        return "";
    }

    // ---------------------------------------------------------------------------
    // Streaming output
    // ---------------------------------------------------------------------------

    /**
     * Write the full output (header + body chunks) directly to a Node.js Writable
     * (e.g. fs.createWriteStream). Chunks are written synchronously — the stream's
     * internal buffer handles backpressure. Returns a Promise that resolves once
     * the stream has finished draining and is closed.
     */
    public pipeToNode(writable: Writable): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            writable.once("error", reject);
            writable.once("finish", resolve);
            const hdr = this.header();
            if (hdr) {
                writable.write(hdr, "utf8");
                writable.write("\n\n", "utf8");
            }
            for (const chunk of this.bodyChunks) {
                writable.write(chunk, "utf8");
            }
            writable.end();
        });
    }

    /**
     * Write the full output directly to a file using Bun's native FileSink.
     * FileSink.write() is synchronous (no per-chunk event-loop round-trips),
     * so this is the lowest-overhead path when running under Bun.
     *
     * Falls back gracefully if Bun is not available (throws at call time, not import time).
     */
    public async pipeToBun(path: string): Promise<void> {
        const sink: { write(s: string): number; end(): Promise<void> } =
            (globalThis as any).Bun.file(path).writer();
        const hdr = this.header();
        if (hdr) {
            sink.write(hdr);
            sink.write("\n\n");
        }
        for (const chunk of this.bodyChunks) {
            sink.write(chunk);
        }
        await sink.end();
    }

    /**
     * Collect all output synchronously into a string.
     * Provided for drop-in compatibility with the other writers.
     */
    public toString(): string {
        const hdr = this.header();
        const body = this.bodyChunks.join("");
        return hdr ? `${hdr}\n\n${body}` : body;
    }

    // ---------------------------------------------------------------------------
    // IWriter implementation — identical logic to AbstractChunkWriter
    // ---------------------------------------------------------------------------

    // The body buffer is exposed to language-writer subclasses (e.g. for toString).
    protected get buffer(): string {
        return this.bodyChunks.join("");
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
        const last = this.bodyChunks[this.bodyChunks.length - 1];
        if (last !== undefined && last.endsWith(tab)) {
            const trimmed = last.slice(0, -tab.length);
            if (trimmed.length === 0) {
                this.bodyChunks.pop();
            } else {
                this.bodyChunks[this.bodyChunks.length - 1] = trimmed;
            }
        } else {
            const joined = this.bodyChunks.join("");
            if (joined.endsWith(this.newlineWithIndent + tab)) {
                this.bodyChunks.length = 0;
                this.bodyChunks.push(joined.slice(0, -tab.length));
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

    protected writeRaw(text: string): void {
        if (text.length === 0) return;
        this.bodyChunks.push(text);
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
