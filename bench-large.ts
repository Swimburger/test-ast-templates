/**
 * bench-large.ts — single large-file benchmark: string-array vs two-pass direct stream
 *
 * Simulates a merged types.ts that grows very large (1 MB, 5 MB, 20 MB).
 * Compares two strategies for generating + writing one big file:
 *
 *   string-array    one pass  → chunks[] → join() → writeFile
 *   two-pass stream pass 1 collects imports only (ImportCollector, no string work)
 *                   pass 2 pushes chunks directly to createWriteStream in writeRaw()
 *                   — never materialises the full string in memory
 *
 * Metrics:
 *   - wall time (render + write, combined)
 *   - RSS delta (rough proxy for peak memory pressure)
 *
 * Run with: npx tsx bench-large.ts
 */

import { writeFile, rm, mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Writable } from "node:stream";

import { ts } from "./typescript/index.js";
import { ChunkWriter } from "./typescript/ChunkWriter.js";
import { TYPESCRIPT_CONFIG } from "./core/ILanguageConfig.js";
import type { IndentStyle } from "./core/AbstractWriter.js";
import type { Reference } from "./core/Reference.js";
import type { TypeScriptReference } from "./typescript/Reference.js";
import type { IWriter } from "./core/IWriter.js";
import type { ILanguageConfig } from "./core/ILanguageConfig.js";
import type { AbstractAstNode } from "./core/AbstractAstNode.js";
import type { AstArg } from "./core/AstTemplate.js";
import { writeArg } from "./core/AstTemplate.js";

// ---------------------------------------------------------------------------
// ImportCollector — pass 1, no string work at all
// ---------------------------------------------------------------------------

/**
 * Implements IWriter but no-ops every write method.
 * Only addReference() does work — collecting the import set.
 * Used as the fast first pass so we know the header before writing the body.
 */
class ImportCollector implements IWriter {
    public readonly languageConfig: ILanguageConfig = TYPESCRIPT_CONFIG;

    private readonly namedImports    = new Map<string, Set<string>>();
    private readonly typeOnlyImports = new Map<string, Set<string>>();
    private readonly defaultImports  = new Map<string, string>();
    private readonly starImports     = new Map<string, string>();

    public addReference(ref: Reference): void {
        const tsRef = ref as TypeScriptReference;
        if (!tsRef.modulePath) return;
        if (tsRef.starImport) {
            this.starImports.set(tsRef.starImport, tsRef.modulePath);
        } else if (tsRef.defaultImport) {
            this.defaultImports.set(tsRef.modulePath, tsRef.localName);
        } else {
            const bucket = tsRef.typeOnly ? this.typeOnlyImports : this.namedImports;
            const existing = bucket.get(tsRef.modulePath) ?? new Set<string>();
            existing.add(tsRef.localName);
            bucket.set(tsRef.modulePath, existing);
        }
    }

    public header(): string {
        const lines: string[] = [];
        for (const [alias, mod] of this.starImports)
            lines.push(`import * as ${alias} from "${mod}";`);
        for (const [mod, name] of this.defaultImports)
            lines.push(`import ${name} from "${mod}";`);
        for (const [mod, names] of this.namedImports)
            lines.push(`import { ${[...names].sort().join(", ")} } from "${mod}";`);
        for (const [mod, names] of this.typeOnlyImports)
            lines.push(`import type { ${[...names].sort().join(", ")} } from "${mod}";`);
        return lines.sort().join("\n");
    }

    // write() and writeNode() must traverse the tree so addReference() is called.
    // All other methods are intentional no-ops — no string work done.
    public write(...parts: (string | AbstractAstNode | undefined)[]): void {
        for (const part of parts) {
            if (part != null && typeof part !== "string") part.write(this);
        }
    }
    public writeNode(node: AbstractAstNode): void { node.write(this); }
    public writeLine(...parts: (string | AbstractAstNode | undefined)[]): void {
        for (const part of parts) {
            if (part != null && typeof part !== "string") part.write(this);
        }
    }
    public writeStatement(...parts: (string | AbstractAstNode | undefined)[]): void {
        for (const part of parts) {
            if (part != null && typeof part !== "string") part.write(this);
        }
    }
    public writeNodeStatement(node: AbstractAstNode): void { node.write(this); }
    public newLine(): void {}
    public writeNewLineIfLastLineNot(): void {}
    public indent(): void {}
    public dedent(): void {}
    public pushScope(): void {}
    public pushScopeInline(): void {}
    public popScope(): void {}
    public toString(): string { return ""; }
}

// ---------------------------------------------------------------------------
// DirectStreamWriter — pass 2, writes chunks straight to a Writable
// ---------------------------------------------------------------------------

const TS_INDENT: IndentStyle = { type: "spaces", size: 4 };

/**
 * Writer that pushes each chunk directly to a Node.js Writable in writeRaw().
 * No body buffer — each token is written to disk (or the stream's internal buffer)
 * as it is produced. The full file string is never in memory at once.
 *
 * This is a self-contained implementation (does not extend AbstractChunkWriter)
 * so that writeRaw() can write to the stream instead of accumulating chunks.
 */
class DirectStreamWriter implements IWriter {
    public readonly languageConfig: ILanguageConfig = TYPESCRIPT_CONFIG;

    private readonly writable: Writable;
    private readonly tabUnit: string;
    private indentString: string = "";
    private newlineWithIndent: string = "\n";
    private lastCharacterIsNewline  = false;
    private lastCharacterIsTerminator = false;
    private readonly hasTerminator: boolean;

    constructor(writable: Writable, indentStyle: IndentStyle = TS_INDENT) {
        this.writable = writable;
        this.tabUnit  = indentStyle.type === "tab" ? "\t" : " ".repeat(indentStyle.size);
        this.hasTerminator = TYPESCRIPT_CONFIG.statementTerminator.length > 0;
    }

    // No-op: imports were handled by pass 1.
    public addReference(_ref: Reference): void {}

    public write(...parts: (string | AbstractAstNode | undefined)[]): void {
        for (const part of parts) {
            if (part == null) continue;
            if (typeof part === "string") this.writeString(part);
            else part.write(this);
        }
    }

    public writeNode(node: AbstractAstNode): void { node.write(this); }

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
        if (this.hasTerminator && !this.lastCharacterIsTerminator)
            this.writeRaw(TYPESCRIPT_CONFIG.statementTerminator);
        this.writeNewLineIfLastLineNot();
    }

    public writeNodeStatement(node: AbstractAstNode): void {
        node.write(this);
        if (this.hasTerminator && !this.lastCharacterIsTerminator)
            this.writeRaw(TYPESCRIPT_CONFIG.statementTerminator);
        this.writeNewLineIfLastLineNot();
    }

    public newLine(): void { this.writeRaw(this.newlineWithIndent); }

    public writeNewLineIfLastLineNot(): void {
        if (!this.lastCharacterIsNewline) this.newLine();
    }

    public indent(): void {
        this.indentString += this.tabUnit;
        this.newlineWithIndent = `\n${this.indentString}`;
        this.writeRaw(this.tabUnit);
    }

    public dedent(): void {
        if (!this.indentString) return;
        this.indentString = this.indentString.slice(0, -this.tabUnit.length);
        this.newlineWithIndent = `\n${this.indentString}`;
        // Note: we cannot trim already-written chunks from the stream.
        // The trailing indent token was already flushed. This means dedent()
        // cannot remove the trailing whitespace that indent() wrote.
        // For correctness we accept this: the output gains one trailing-space
        // token per scope close. It doesn't affect compilation.
    }

    public pushScope(): void {
        const { scopeOpen, scopeStyle } = TYPESCRIPT_CONFIG;
        if (scopeStyle === "allman") {
            if (scopeOpen) this.writeLine(scopeOpen); else this.newLine();
        } else {
            if (scopeOpen) this.write(` ${scopeOpen}`);
            this.newLine();
        }
        this.indent();
    }

    public pushScopeInline(): void {
        const { scopeOpen } = TYPESCRIPT_CONFIG;
        if (scopeOpen) this.write(` ${scopeOpen}`);
        this.newLine();
        this.indent();
    }

    public popScope(): void {
        this.dedent();
        this.writeNewLineIfLastLineNot();
        const { scopeClose } = TYPESCRIPT_CONFIG;
        if (scopeClose) this.write(scopeClose);
    }

    public toString(): string { return ""; }

    protected writeRaw(text: string): void {
        if (text.length === 0) return;
        this.writable.write(text, "utf8");
        this.lastCharacterIsNewline   = text === this.newlineWithIndent || text === "\n";
        this.lastCharacterIsTerminator = this.hasTerminator && text.endsWith(TYPESCRIPT_CONFIG.statementTerminator);
    }

    private writeString(text: string): void {
        if (!text.includes("\n")) { this.writeRaw(text); return; }
        this.writeRaw(text.replaceAll("\n", this.newlineWithIndent));
    }
}

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------

const opts = { indentStyle: { type: "spaces" as const, size: 4 } };

const Shape    = ts.classRef({ localName: "Shape",    modulePath: "./types/Shape.js",    typeOnly: true });
const ApiError = ts.classRef({ localName: "ApiError", modulePath: "./errors/ApiError.js" });

function makeClass(i: number, methodCount: number): AstArg {
    function makeMethod(name: string, paramCount: number) {
        return ts.method(name)
            .access("public").async()
            .params(Array.from({ length: paramCount }, (_, p) => ({
                name: `param${p}`, type: p === 0 ? "string" : "string | undefined", optional: p > 0,
            })))
            .returns(ts.typeRef("Shape").build())
            .body(
                ts.const("response", ts.await(ts.raw`fetch(\`\${this.baseUrl}/${name}\`)`)),
                ts.if("!response.ok").then(
                    ts.const("body", ts.await(ts.raw`response.json().catch(() => undefined)`)),
                    ts.throw(ts.new(ApiError).arg("`failed`").arg("response.status").arg("body")),
                ),
                ts.return(ts.raw`(await response.json()) as ${Shape}`),
            )
            .build();
    }

    let builder = ts.class(`Resource${i}`)
        .export()
        .doc(`Resource client ${i} — part of the merged types bundle.`)
        .property(ts.property("baseUrl", "string").access("private").readonly())
        .ctor(ts.ctor()
            .param({ name: "baseUrl", type: "string" })
            .body(ts.assign("this.baseUrl", "baseUrl"))
            .build());

    for (let m = 0; m < methodCount; m++) {
        builder = builder.method(makeMethod(`op${m}`, (m % 4) + 1));
    }

    return builder.build();
}

function buildMergedFile(targetBytes: number): AstArg[] {
    const classesNeeded = Math.ceil(targetBytes / 1200);
    return Array.from({ length: classesNeeded }, (_, i) => makeClass(i, 6));
}

function renderNodes(nodes: AstArg[], w: IWriter): void {
    for (let i = 0; i < nodes.length; i++) {
        if (i > 0) w.newLine();
        writeArg(w, nodes[i]!);
    }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/** One-pass: StreamWriter (string[]) → toString() → writeFile */
async function strategy_stringArray(nodes: AstArg[], path: string): Promise<void> {
    const w = new ChunkWriter(opts);
    renderNodes(nodes, w);
    await writeFile(path, w.toString(), "utf8");
}

/**
 * Two-pass direct stream:
 *   Pass 1 — ImportCollector: walk AST, collect imports, no string work.
 *   Pass 2 — DirectStreamWriter: walk AST again, push each chunk to the
 *             stream's internal buffer synchronously as it is produced.
 *             The full file string is never held in memory.
 */
async function strategy_twoPassStream(nodes: AstArg[], path: string): Promise<void> {
    // Pass 1: collect imports only.
    const collector = new ImportCollector();
    renderNodes(nodes, collector);
    const header = collector.header();

    // Pass 2: stream to disk.
    await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(path, "utf8");
        stream.once("error",  reject);
        stream.once("finish", resolve);

        if (header) {
            stream.write(header, "utf8");
            stream.write("\n\n", "utf8");
        }

        const w = new DirectStreamWriter(stream, opts.indentStyle);
        renderNodes(nodes, w);
        stream.end();
    });
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

interface Result {
    label: string;
    sizeLabel: string;
    avgMs: number;
    avgRssDeltaKB: number;
    fileSizeKB: number;
}

async function benchStrategy(
    label: string,
    sizeLabel: string,
    nodes: AstArg[],
    dir: string,
    strategy: (nodes: AstArg[], path: string) => Promise<void>,
    iters: number,
): Promise<Result> {
    const path = join(dir, `out_${label.replace(/\s+/g, "_")}.ts`);

    // Warm-up
    for (let i = 0; i < 2; i++) await strategy(nodes, path);

    let totalMs = 0;
    let totalRssDelta = 0;
    for (let i = 0; i < iters; i++) {
        if (typeof (globalThis as any).gc === "function") (globalThis as any).gc();
        const rssBefore = process.memoryUsage().rss;
        const t0 = performance.now();
        await strategy(nodes, path);
        totalMs += performance.now() - t0;
        totalRssDelta += process.memoryUsage().rss - rssBefore;
    }

    const fileSizeKB = (await stat(path)).size / 1024;

    return {
        label,
        sizeLabel,
        avgMs: totalMs / iters,
        avgRssDeltaKB: totalRssDelta / iters / 1024,
        fileSizeKB,
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
    const ITERS = 10;

    const sizes: Array<{ label: string; bytes: number }> = [
        { label: " 1 MB", bytes:  1 * 1024 * 1024 },
        { label: " 5 MB", bytes:  5 * 1024 * 1024 },
        { label: "20 MB", bytes: 20 * 1024 * 1024 },
    ];

    const dir = join(tmpdir(), `ast-large-${Date.now()}`);
    await mkdir(dir, { recursive: true });

    console.log("Building workloads...");
    const workloads = sizes.map(({ label, bytes }) => ({
        label,
        nodes: buildMergedFile(bytes),
    }));

    // Correctness check: string-array output must equal two-pass stream output.
    // (Except dedent trailing-space difference — see DirectStreamWriter.dedent() note.)
    // We only check that the two-pass stream produces a file and that ImportCollector
    // produces the same header as StreamWriter.
    console.log("Checking import header parity...");
    for (const { label, nodes } of workloads) {
        const sw = new ChunkWriter(opts);
        renderNodes(nodes, sw);
        const expected = sw.importsToString();

        const collector = new ImportCollector();
        renderNodes(nodes, collector);
        const actual = collector.header();

        if (expected !== actual) {
            console.error(`  MISMATCH at ${label}`);
            console.error(`  expected: ${expected.slice(0, 200)}`);
            console.error(`  actual:   ${actual.slice(0, 200)}`);
            process.exit(1);
        }
    }
    console.log("Import headers match ✓\n");

    // Print actual rendered sizes.
    for (const { label, nodes } of workloads) {
        const w = new ChunkWriter(opts);
        renderNodes(nodes, w);
        const mb = w.toString().length / 1024 / 1024;
        console.log(`${label} target → ${nodes.length} classes, ${mb.toFixed(1)} MB rendered`);
    }
    console.log();

    const strategies: Array<{ label: string; fn: (nodes: AstArg[], path: string) => Promise<void> }> = [
        { label: "string-array   ", fn: strategy_stringArray  },
        { label: "two-pass stream", fn: strategy_twoPassStream },
    ];

    const results: Result[] = [];

    for (const { label: sizeLabel, nodes } of workloads) {
        console.log(`── ${sizeLabel} ───────────────────────────────────────────────────────────────`);
        for (const { label, fn } of strategies) {
            const result = await benchStrategy(label, sizeLabel, nodes, dir, fn, ITERS);
            results.push(result);
            console.log(
                `  ${label}` +
                `  avg ${result.avgMs.toFixed(1).padStart(8)} ms` +
                `  |  RSS Δ ${(result.avgRssDeltaKB >= 0 ? "+" : "") + result.avgRssDeltaKB.toFixed(0).padStart(8)} KB` +
                `  |  file ${result.fileSizeKB.toFixed(0).padStart(7)} KB`,
            );
        }
        console.log();
    }

    console.log("── Summary ──────────────────────────────────────────────────────────────────");
    console.log("  Size    Strategy           Avg ms    RSS Δ KB   File KB");
    console.log("  ────────────────────────────────────────────────────────");
    for (const r of results) {
        console.log(
            `  ${r.sizeLabel}  ${r.label}` +
            `  ${r.avgMs.toFixed(1).padStart(9)}` +
            `  ${((r.avgRssDeltaKB >= 0 ? "+" : "") + r.avgRssDeltaKB.toFixed(0)).padStart(10)}` +
            `  ${r.fileSizeKB.toFixed(0).padStart(8)}`,
        );
    }

    console.log("\nNote: RSS delta is a rough proxy — GC timing affects it.");
    console.log("Run with node --expose-gc bench-large.ts for more stable measurements.");

    await rm(dir, { recursive: true, force: true });
})();
