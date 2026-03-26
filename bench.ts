/**
 * bench.ts — writer strategies + I/O patterns calibrated to the real Stripe SDK
 *
 * Actual Stripe SDK (src/ .ts files):
 *   2266 files, 6.3 MB total
 *   median  779 B  (~18 lines)
 *   p75    1570 B  (~35 lines)
 *   p90    3348 B  (~70 lines)
 *   p99   40287 B  (~900 lines)
 *   max   ~30 KB   (Client.ts)
 *
 *   Buckets:
 *     tiny   1-20  lines  → 1300 files (57%)
 *     small  21-50 lines  →  671 files (30%)
 *     medium 51-150 lines →  205 files ( 9%)
 *     large  151-500 lines →  55 files ( 2%)
 *     huge   500+ lines   →   35 files ( 2%)
 *
 * Writer strategies:
 *   string-concat   AbstractWriter         buffer +=
 *   string-array    AbstractChunkWriter   chunks[]; join at end
 *   node-stream     AbstractWritableWriter pipeToNode
 *
 * I/O strategies:
 *   writeFile parallel (unbounded)
 *   writeFile limited (8)           — matches libuv thread pool
 *   pipeToNode limited (8)
 *
 * Run with: npx tsx bench.ts
 */

import { writeFile, rm, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { toFile } from "./core/pipeline.js";

import { ts } from "./typescript/index.js";
import { Writer } from "./typescript/Writer.js";
import { ChunkWriter } from "./typescript/ChunkWriter.js";
import { WritableWriter } from "./typescript/WritableWriter.js";
import { type AstArg, writeArg } from "./core/AstTemplate.js";
import type { IWriter } from "./core/IWriter.js";
import type { IndentStyle } from "./core/AbstractWriter.js";
import type { AbstractWritableWriter } from "./core/AbstractWritableWriter.js";

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

async function withConcurrency<T>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
    let i = 0;
    async function worker(): Promise<void> {
        while (i < items.length) { const idx = i++; await fn(items[idx]!, idx); }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ---------------------------------------------------------------------------
// Workload — calibrated to Stripe SDK size distribution
//
//  tiny   (1-20 lines)   → interface + 2 fields          ~400 B
//  small  (21-50 lines)  → interface + 8 fields          ~900 B
//  medium (51-150 lines) → class + 4 methods            ~2500 B
//  large  (151-500 lines)→ class + 12 methods           ~8000 B
//
// Bucket counts match the real SDK: 1300 tiny, 671 small, 205 medium, 55 large, 35 huge
// "Huge" (Client.ts, main.test.ts) are one-offs, not generated per-node — excluded.
// ---------------------------------------------------------------------------

const opts = { indentStyle: { type: "spaces" as const, size: 4 } };

const Shape   = ts.classRef({ localName: "Shape",   modulePath: "./types/Shape.js",   typeOnly: true });
const ApiError = ts.classRef({ localName: "ApiError", modulePath: "./errors/ApiError.js" });

function tinyFile(i: number): AstArg[] {
    return [
        ts.interface(`Type${i}`)
            .export()
            .property(ts.property("id", "string"))
            .property(ts.property("object", `"type${i}"`))
            .build(),
    ];
}

function smallFile(i: number): AstArg[] {
    const fields = Array.from({ length: 8 }, (_, f) => ts.property(`field${f}`, f % 2 === 0 ? "string" : "number | null"));
    return [
        ts.interface(`Request${i}`)
            .export()
            .doc(`Request parameters for operation ${i}.`)
            .properties(fields)
            .build(),
    ];
}

function mediumFile(i: number): AstArg[] {
    function makeMethod(name: string) {
        return ts.method(name)
            .access("public").async()
            .param({ name: "id", type: "string" })
            .returns(ts.typeRef("Shape").build())
            .body(
                ts.const("response", ts.await(ts.raw`fetch(\`\${this.baseUrl}/${name}/\${id}\`)`)),
                ts.if("!response.ok").then(
                    ts.throw(ts.new(ApiError).arg("`failed`").arg("response.status").arg("null")),
                ),
                ts.return(ts.raw`(await response.json()) as ${Shape}`),
            )
            .build();
    }
    return [
        ts.class(`Resource${i}`)
            .export()
            .doc(`Resource client ${i}.`)
            .property(ts.property("baseUrl", "string").access("private").readonly())
            .ctor(ts.ctor().param({ name: "baseUrl", type: "string" }).body(ts.assign("this.baseUrl", "baseUrl")).build())
            .method(makeMethod("get"))
            .method(makeMethod("list"))
            .method(makeMethod("create"))
            .method(makeMethod("update"))
            .build(),
    ];
}

function largeFile(i: number): AstArg[] {
    function makeMethod(name: string, paramCount: number) {
        return ts.method(name)
            .access("public").async()
            .params(Array.from({ length: paramCount }, (_, p) => ({ name: `param${p}`, type: p === 0 ? "string" : "string | undefined", optional: p > 0 })))
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
    return [
        ts.class(`LargeResource${i}`)
            .export()
            .doc(`Large resource client ${i} with many operations.`)
            .property(ts.property("baseUrl", "string").access("private").readonly())
            .property(ts.property("apiKey", "string").access("private").readonly())
            .ctor(ts.ctor()
                .params([{ name: "baseUrl", type: "string" }, { name: "apiKey", type: "string" }])
                .body(ts.assign("this.baseUrl", "baseUrl"), ts.assign("this.apiKey", "apiKey"))
                .build())
            .method(makeMethod("retrieve", 1))
            .method(makeMethod("list", 3))
            .method(makeMethod("create", 4))
            .method(makeMethod("update", 4))
            .method(makeMethod("delete", 1))
            .method(makeMethod("archive", 2))
            .method(makeMethod("restore", 2))
            .method(makeMethod("search", 5))
            .method(makeMethod("export", 3))
            .method(makeMethod("import", 4))
            .method(makeMethod("validate", 2))
            .method(makeMethod("preview", 3))
            .build(),
    ];
}

// Build the full file set matching Stripe SDK distribution
function buildStripeFileSet(): AstArg[][] {
    const files: AstArg[][] = [];
    for (let i = 0; i < 1300; i++) files.push(tinyFile(i));
    for (let i = 0; i < 671;  i++) files.push(smallFile(i));
    for (let i = 0; i < 205;  i++) files.push(mediumFile(i));
    for (let i = 0; i < 55;   i++) files.push(largeFile(i));
    return files;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

type StringWriterFactory = (o: { indentStyle?: IndentStyle }) => IWriter & { toString(): string };
type WebWriterFactory    = (o: { indentStyle?: IndentStyle }) => AbstractWritableWriter;

function renderAll(files: AstArg[][], factory: StringWriterFactory): string[] {
    return files.map((nodes) => {
        const w = factory(opts);
        for (let i = 0; i < nodes.length; i++) {
            if (i > 0) w.newLine();
            writeArg(w, nodes[i]!);
        }
        return w.toString();
    });
}

function renderOneWeb(nodes: AstArg[], factory: WebWriterFactory): AbstractWritableWriter {
    const w = factory(opts);
    for (let i = 0; i < nodes.length; i++) {
        if (i > 0) w.newLine();
        writeArg(w, nodes[i]!);
    }
    return w;
}

// ---------------------------------------------------------------------------
// I/O strategies
// ---------------------------------------------------------------------------

const CONCURRENCY = 8;

async function io_writeFile_parallel(texts: string[], dir: string): Promise<void> {
    await Promise.all(texts.map((text, i) => writeFile(join(dir, `f${i}.ts`), text, "utf8")));
}

async function io_writeFile_limited(texts: string[], dir: string): Promise<void> {
    await withConcurrency(texts, CONCURRENCY, (text, i) =>
        writeFile(join(dir, `f${i}.ts`), text, "utf8")
    );
}

async function io_pipeToNode_limited(files: AstArg[][], factory: WebWriterFactory, dir: string): Promise<void> {
    await withConcurrency(files, CONCURRENCY, (nodes, i) =>
        renderOneWeb(nodes, factory).pipeToNode(createWriteStream(join(dir, `f${i}.ts`), "utf8"))
    );
}

async function io_bunWrite_limited(texts: string[], dir: string): Promise<void> {
    await withConcurrency(texts, CONCURRENCY, (text, i) =>
        (globalThis as any).Bun.write(join(dir, `f${i}.ts`), text)
    );
}

async function io_pipeToBun_limited(files: AstArg[][], factory: WebWriterFactory, dir: string): Promise<void> {
    await withConcurrency(files, CONCURRENCY, (nodes, i) =>
        renderOneWeb(nodes, factory).pipeToBun(join(dir, `f${i}.ts`))
    );
}

async function io_pipeToNode_compressed(
    files: AstArg[][],
    factory: WebWriterFactory,
    dir: string,
    ext: string,
    pipelineFactory: (path: string) => ReturnType<typeof toFile>,
): Promise<void> {
    await withConcurrency(files, CONCURRENCY, (nodes, i) =>
        renderOneWeb(nodes, factory).pipeToNode(pipelineFactory(join(dir, `f${i}.${ext}`)))
    );
}

/** Returns total bytes of all files written in dir. */
async function dirBytes(dir: string): Promise<number> {
    const { readdir, stat } = await import("node:fs/promises");
    const entries = await readdir(dir);
    const sizes = await Promise.all(entries.map((e) => stat(join(dir, e)).then((s) => s.size)));
    return sizes.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Simulate N generators competing on the same machine
// ---------------------------------------------------------------------------

async function runGenerators(
    n: number,
    fn: (dir: string) => Promise<void>,
    base: string,
): Promise<number> {
    const dirs = await Promise.all(Array.from({ length: n }, async (_, g) => {
        const d = join(base, `gen${g}`); await mkdir(d); return d;
    }));
    const t0 = performance.now();
    await Promise.all(dirs.map(fn));
    return performance.now() - t0;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

async function bench(
    label: string,
    target: string,
    iters: number,
    totalBytes: number,
    run: () => Promise<number>,
): Promise<void> {
    for (let i = 0; i < 2; i++) await run();
    let total = 0;
    for (let i = 0; i < iters; i++) total += await run();
    const avg = total / iters;
    console.log(
        `${label.padEnd(16)} ${target.padEnd(30)} ${iters.toString().padStart(3)} iters` +
        `  |  avg ${avg.toFixed(0).padStart(6)} ms` +
        `  |  ${(1000 / avg).toFixed(1).padStart(5)} runs/s` +
        `  |  ${(totalBytes / 1024).toFixed(0)} KB`,
    );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
    const N_GENERATORS = 4;
    const FILE_ITERS   = 10;
    const STR_ITERS    = 20;

    console.log("Building file set (Stripe SDK distribution)...");
    const files = buildStripeFileSet();

    // Correctness check on a small subset (building all 3 for 2231 files is slow)
    const sample = files.slice(0, 20);
    const r1 = renderAll(sample, (o) => new Writer(o));
    const r2 = renderAll(sample, (o) => new ChunkWriter(o));
    const r3 = sample.map((n) => renderOneWeb(n, (o) => new WritableWriter(o)).toString());
    let ok = true;
    for (let i = 0; i < r1.length; i++) {
        if (r1[i] !== r2[i]) { console.error(`array mismatch ${i}`); ok = false; }
        if (r1[i] !== r3[i]) { console.error(`web mismatch ${i}`);   ok = false; }
    }
    if (!ok) process.exit(1);

    const preRendered = renderAll(files, (o) => new Writer(o));
    const totalBytes  = preRendered.reduce((s, t) => s + t.length, 0);
    const avgBytes    = Math.round(totalBytes / files.length);

    console.log(`Outputs match ✓`);
    console.log(`${files.length} files  |  ${(totalBytes / 1024).toFixed(0)} KB total  |  ${avgBytes} B avg  (Stripe SDK: 2266 files, ~2932 B avg)\n`);

    // ── toString() — CPU + memory, no I/O ───────────────────────────────────
    console.log("── toString() ──────────────────────────────────────────────────────────────");
    for (const [label, factory] of [
        ["string-concat",  (o: { indentStyle?: IndentStyle }) => new Writer(o)],
        ["string-array",   (o: { indentStyle?: IndentStyle }) => new ChunkWriter(o)],
        ["node-stream",    (o: { indentStyle?: IndentStyle }) => new WritableWriter(o)],
    ] as [string, StringWriterFactory][]) {
        await bench(label, "toString()", STR_ITERS, totalBytes, async () => {
            const t = performance.now(); renderAll(files, factory); return performance.now() - t;
        });
    }

    // ── file I/O: 1 generator ───────────────────────────────────────────────
    console.log("\n── file I/O: 1 generator (isolated) ───────────────────────────────────────");

    const base1 = join(tmpdir(), `ast-solo-${Date.now()}`);
    await mkdir(base1, { recursive: true });

    await bench("string-concat", `writeFile parallel (unbound)`, FILE_ITERS, totalBytes, async () => {
        const d = join(base1, `r${Math.random().toString(36).slice(2)}`); await mkdir(d);
        const t = performance.now(); await io_writeFile_parallel(preRendered, d);
        const e = performance.now() - t; await rm(d, { recursive: true, force: true }); return e;
    });
    await bench("string-concat", `writeFile limited (${CONCURRENCY})`, FILE_ITERS, totalBytes, async () => {
        const d = join(base1, `r${Math.random().toString(36).slice(2)}`); await mkdir(d);
        const t = performance.now(); await io_writeFile_limited(preRendered, d);
        const e = performance.now() - t; await rm(d, { recursive: true, force: true }); return e;
    });
    await bench("node-stream", `pipeToNode limited (${CONCURRENCY})`, FILE_ITERS, totalBytes, async () => {
        const d = join(base1, `r${Math.random().toString(36).slice(2)}`); await mkdir(d);
        const t = performance.now(); await io_pipeToNode_limited(files, (o) => new WritableWriter(o), d);
        const e = performance.now() - t; await rm(d, { recursive: true, force: true }); return e;
    });
    if (typeof (globalThis as any).Bun !== "undefined") {
        await bench("bun-native", `Bun.write limited (${CONCURRENCY})`, FILE_ITERS, totalBytes, async () => {
            const d = join(base1, `r${Math.random().toString(36).slice(2)}`); await mkdir(d);
            const t = performance.now(); await io_bunWrite_limited(preRendered, d);
            const e = performance.now() - t; await rm(d, { recursive: true, force: true }); return e;
        });
        await bench("bun-native", `pipeToBun limited (${CONCURRENCY})`, FILE_ITERS, totalBytes, async () => {
            const d = join(base1, `r${Math.random().toString(36).slice(2)}`); await mkdir(d);
            const t = performance.now(); await io_pipeToBun_limited(files, (o) => new WritableWriter(o), d);
            const e = performance.now() - t; await rm(d, { recursive: true, force: true }); return e;
        });
    }

    await rm(base1, { recursive: true, force: true });

    // ── file I/O: N generators competing ────────────────────────────────────
    console.log(`\n── file I/O: ${N_GENERATORS} generators concurrent (shared server) ─────────────────────`);

    const base2 = join(tmpdir(), `ast-multi-${Date.now()}`);
    await mkdir(base2, { recursive: true });

    await bench("string-concat", `writeFile parallel (unbound)`, FILE_ITERS, totalBytes * N_GENERATORS, async () => {
        const b = join(base2, `r${Math.random().toString(36).slice(2)}`); await mkdir(b);
        const e = await runGenerators(N_GENERATORS, (d) => io_writeFile_parallel(preRendered, d), b);
        await rm(b, { recursive: true, force: true }); return e;
    });
    await bench("string-concat", `writeFile limited (${CONCURRENCY})`, FILE_ITERS, totalBytes * N_GENERATORS, async () => {
        const b = join(base2, `r${Math.random().toString(36).slice(2)}`); await mkdir(b);
        const e = await runGenerators(N_GENERATORS, (d) => io_writeFile_limited(preRendered, d), b);
        await rm(b, { recursive: true, force: true }); return e;
    });
    await bench("node-stream", `pipeToNode limited (${CONCURRENCY})`, FILE_ITERS, totalBytes * N_GENERATORS, async () => {
        const b = join(base2, `r${Math.random().toString(36).slice(2)}`); await mkdir(b);
        const e = await runGenerators(N_GENERATORS, (d) => io_pipeToNode_limited(files, (o) => new WritableWriter(o), d), b);
        await rm(b, { recursive: true, force: true }); return e;
    });
    if (typeof (globalThis as any).Bun !== "undefined") {
        await bench("bun-native", `Bun.write limited (${CONCURRENCY})`, FILE_ITERS, totalBytes * N_GENERATORS, async () => {
            const b = join(base2, `r${Math.random().toString(36).slice(2)}`); await mkdir(b);
            const e = await runGenerators(N_GENERATORS, (d) => io_bunWrite_limited(preRendered, d), b);
            await rm(b, { recursive: true, force: true }); return e;
        });
        await bench("bun-native", `pipeToBun limited (${CONCURRENCY})`, FILE_ITERS, totalBytes * N_GENERATORS, async () => {
            const b = join(base2, `r${Math.random().toString(36).slice(2)}`); await mkdir(b);
            const e = await runGenerators(N_GENERATORS, (d) => io_pipeToBun_limited(files, (o) => new WritableWriter(o), d), b);
            await rm(b, { recursive: true, force: true }); return e;
        });
    }

    await rm(base2, { recursive: true, force: true });

    // ── compression: write time + output size ────────────────────────────────
    console.log("\n── compression (node-stream, limited 8, 1 generator) ───────────────────────");

    const compressionCases: Array<{ label: string; ext: string; make: (path: string) => ReturnType<typeof toFile> }> = [
        { label: "plain",           ext: "ts",     make: (p) => toFile(p) },
        { label: "gzip   (level 6)", ext: "ts.gz",  make: (p) => toFile(p, { compress: "gzip", level: 6 }) },
        { label: "gzip   (level 1)", ext: "ts.gz",  make: (p) => toFile(p, { compress: "gzip", level: 1 }) },
        { label: "brotli (q 4)",     ext: "ts.br",  make: (p) => toFile(p, { compress: "brotli", level: 4 }) },
        { label: "brotli (q 11)",    ext: "ts.br",  make: (p) => toFile(p, { compress: "brotli", level: 11 }) },
        { label: "deflate",          ext: "ts.zz",  make: (p) => toFile(p, { compress: "deflate", level: 6 }) },
    ];

    const baseC = join(tmpdir(), `ast-compress-${Date.now()}`);
    await mkdir(baseC, { recursive: true });

    for (const { label, ext, make } of compressionCases) {
        let totalElapsed = 0;
        let outputBytes = 0;
        const CITERS = FILE_ITERS;
        // warm-up
        for (let i = 0; i < 2; i++) {
            const d = join(baseC, `w${Math.random().toString(36).slice(2)}`); await mkdir(d);
            await io_pipeToNode_compressed(files, (o) => new WritableWriter(o), d, ext, make);
            await rm(d, { recursive: true, force: true });
        }
        for (let i = 0; i < CITERS; i++) {
            const d = join(baseC, `r${Math.random().toString(36).slice(2)}`); await mkdir(d);
            const t = performance.now();
            await io_pipeToNode_compressed(files, (o) => new WritableWriter(o), d, ext, make);
            totalElapsed += performance.now() - t;
            if (i === 0) outputBytes = await dirBytes(d);
            await rm(d, { recursive: true, force: true });
        }
        const avg = totalElapsed / CITERS;
        const ratio = ((1 - outputBytes / totalBytes) * 100).toFixed(0);
        console.log(
            `  ${label.padEnd(18)}` +
            `  avg ${avg.toFixed(0).padStart(5)} ms` +
            `  |  ${(1000 / avg).toFixed(1).padStart(5)} runs/s` +
            `  |  ${(outputBytes / 1024).toFixed(0).padStart(5)} KB on disk` +
            `  |  ${ratio.padStart(3)}% smaller`,
        );
    }

    await rm(baseC, { recursive: true, force: true });
})();
