/**
 * pipeline.ts — helpers for building Node.js stream pipelines to use with
 * AbstractWritableWriter.pipeToNode().
 *
 * Usage:
 *
 *   // Plain file
 *   await writer.pipeToNode(toFile("out.ts"));
 *
 *   // Compressed file
 *   await writer.pipeToNode(toFile("out.ts.gz", { compress: "gzip" }));
 *   await writer.pipeToNode(toFile("out.ts.br",  { compress: "brotli" }));
 *
 *   // Custom pipeline — pipe() returns the destination, so chain right-to-left:
 *   await writer.pipeToNode(pipeline(createGzip(), createWriteStream("out.ts.gz")));
 *
 * pipeToNode() always receives the HEAD of the pipeline (the first transform or
 * the file stream itself). It writes to that, and the chain forwards to disk.
 */

import { createWriteStream } from "node:fs";
import { createGzip, createBrotliCompress, createDeflate, constants, type ZlibOptions, type BrotliOptions } from "node:zlib";
import { Transform, type Writable } from "node:stream";

export type Compression = "gzip" | "brotli" | "deflate";

export interface PipelineOptions {
    compress?: Compression;
    /** zlib level for gzip/deflate (1–9). Default: zlib.constants.Z_DEFAULT_COMPRESSION */
    level?: number;
    /** Extra options forwarded to the chosen compressor. */
    compressOptions?: ZlibOptions | BrotliOptions;
}

/**
 * Build a write pipeline terminating at `path`.
 * Returns the head — the Writable to pass to pipeToNode().
 *
 *   plain:   FileWriteStream
 *   gzip:    Gzip → FileWriteStream   (head = Gzip)
 *   brotli:  Brotli → FileWriteStream (head = Brotli)
 *   deflate: Deflate → FileWriteStream (head = Deflate)
 */
export function toFile(path: string, opts: PipelineOptions = {}): Writable {
    const file = createWriteStream(path, "utf8");
    if (!opts.compress) return file;
    const head = makeCompressor(opts.compress, opts.level, opts.compressOptions);
    head.pipe(file);
    return head;
}

function makeCompressor(
    type: Compression,
    level: number | undefined,
    extra: ZlibOptions | BrotliOptions | undefined,
): Transform {
    switch (type) {
        case "gzip":    return createGzip   ({ level, ...extra as ZlibOptions });
        case "deflate": return createDeflate({ level, ...extra as ZlibOptions });
        case "brotli":  return createBrotliCompress({
            params: { [constants.BROTLI_PARAM_QUALITY]: level ?? 4 },
            ...extra as BrotliOptions,
        });
    }
}
