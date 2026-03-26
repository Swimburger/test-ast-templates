# SDK Generator — Performance Notes

Benchmarks and design decisions for the code writer and file I/O layers.
All numbers: MacBook (Darwin, 14 CPUs), Node 24 / Bun 1.3, writing the Stripe
SDK distribution — 2231 `.ts` files, 830 KB total, median file 18 lines / 779 B.

---

## TL;DR

| Decision | Choice | Reason |
|---|---|---|
| Writer strategy | `string-concat` (`AbstractWriter`) | Fastest CPU, least allocations |
| File I/O | `writeFile` with concurrency limit of 8 | Saturates thread pool without flooding it |
| Runtime | Node.js | Consistently faster than Bun for this workload |
| Docker FS | `--tmpfs /output` when output is ephemeral | Bypasses overlayfs; halves degradation under CPU throttling |
| Concurrency limit | 8 | Raise in lockstep with `UV_THREADPOOL_SIZE` |

```ts
// Recommended pattern
const texts = renderAll(files, (o) => new Writer(o));
await withConcurrency(texts, 8, (text, i) =>
    writeFile(paths[i], text, "utf8")
);
```

---

## 1. Writer strategies

Three implementations with identical output, all extending a common interface:

| Strategy | Internal storage | Class |
|---|---|---|
| **string-concat** | `buffer +=` | `AbstractWriter` |
| string-array | `chunks.push()` + `join()` at the end | `AbstractChunkWriter` |
| node-stream | `chunks.push()` + flush via `pipeToNode()` / `pipeToBun()` | `AbstractWritableWriter` |

### toString() at Stripe scale (2231 files, Node.js)

```
string-concat    3–4 ms   ← recommended
string-array       4 ms
node-stream        4 ms
```

All three are within measurement noise after the optimizations below.
The writer is **not** the bottleneck — file I/O is 20–100× slower.

### Optimizations applied to all three writers

The original implementations recomputed the indent string on every write call.
That single fix accounts for nearly all the improvement.

**Cached indent strings** (the big one)
`getIndentString()` previously called `" ".repeat(size).repeat(level)` on every
`writeRaw()` invocation — hundreds of times per file. Now `tabUnit`, `indentString`,
and `newlineWithIndent` are plain fields updated only when the indent level changes.
Before/after: ~18K ops/s → ~107K ops/s (~**5× improvement**).

**Newline state check without allocation**
The newline flag check previously built `` `\n${indent}` `` as a new string on
every call just to compare with `endsWith()`. It now compares directly against
the cached `newlineWithIndent` with `===`.

**Fast path for tokens without newlines**
`writeString()` skips `replaceAll()` when the token contains no `\n`. The vast
majority of tokens (identifiers, punctuation, keywords) never do.

**Precomputed `hasTerminator` flag**
Avoids re-evaluating `statementTerminator.length > 0` on every `writeStatement()`
call. Stored as a boolean in the constructor.

### When to use each writer

**`AbstractWriter` (string-concat)** — the default. Accumulates output as a
single string; `+=` on a short accumulator is cheap and V8-optimised. Least GC
pressure: one string object per file.

**`AbstractChunkWriter` (string-array)** — accumulates chunks in an array and
joins at `toString()`. Useful if you need to inspect or transform individual
chunks before materialising the final string. Performance is equivalent to
string-concat at this scale.

**`AbstractWritableWriter` (node-stream)** — use when writing directly to a
`Writable` destination (file, network socket, compression transform) without
needing the full string in memory at any point. Required for `pipeToNode()` and
`pipeToBun()`.

---

## 2. File I/O

Writing 2231 files (~830 KB) on Node.js, single generator:

```
writeFile, all 2231 in parallel   ~100 ms
writeFile, 8 concurrent            ~80 ms   ← winner
pipeToNode, 8 concurrent           ~80 ms
```

### The concurrency limit is the only knob that matters

Under real load — 4 generators running simultaneously on the same host:

```
Strategy                    Isolated    4 generators    Degradation
writeFile parallel (2231)     100 ms       465 ms          4.5×
writeFile limited (8)          80 ms       367 ms          3.5×   ← recommended
pipeToNode limited (8)         80 ms       347 ms          3.4×
```

Firing all 2231 writes at once floods libuv's thread pool. The pool has 4 threads
by default; with 4 generators each submitting 2231 operations simultaneously, you
get ~9000 queued syscalls fighting for 4 threads. The concurrency limit keeps each
generator's in-flight operations bounded, so generators don't starve each other.

**Why 8?** It keeps the pool saturated (threads are briefly idle while waiting on
the kernel between operations) without building a large queue. Raise it in lockstep
with `UV_THREADPOOL_SIZE` if you increase that.

### `writeFile` vs `pipeToNode`

At ~380 B average file size they perform identically. Prefer `writeFile` for
simplicity. `pipeToNode` is worth it if files are large enough that materialising
the full string in memory is a concern, or if you need to insert a transform
(e.g. compression) between the writer and the file.

---

## 3. Docker

### overlayfs amplifies CPU throttling

Every write to the container's own filesystem goes through the overlay
copy-on-write layer, which competes with application code for CPU time.
Under CPU throttling this effect compounds:

```
                          2 CPUs    1 CPU    Degradation
overlayfs + parallel       54 ms    192 ms      3.6×
overlayfs + limited(8)     55 ms    123 ms      2.2×   ← limit helps most here
tmpfs + parallel           46 ms     97 ms      2.1×
tmpfs + limited(8)         52 ms    105 ms      2.0×
```

The concurrency limit cuts the 1-CPU degradation factor from 3.6× to 2.2× by
reducing the number of overlay copy-on-write operations in flight at once.

### Use tmpfs for ephemeral output

If the generated SDK is consumed by a subsequent step in the same container
(compile, type-check, bundle), write to a tmpfs mount instead:

```
docker run --tmpfs /output:rw,size=256m ...
```

tmpfs is backed by RAM — no overlay layer, no fsync latency. A full Stripe SDK
is ~830 KB; 256 MB is comfortably within any container's memory budget.

### 4 generators on a shared server

```
                              Host     Docker 2 CPU    Docker 1 CPU
writeFile parallel (unbound)  465 ms      307 ms           925 ms
writeFile limited  (8)        367 ms      201 ms           457 ms
writeFile limited  (8) + tmpfs   —        220 ms           409 ms
```

The worst case — 1 CPU, unbounded parallel, 4 generators — hits 925 ms per run.
The concurrency limit alone halves it. Adding tmpfs halves it again.

---

## 4. Large single-file generation (merged types.ts)

When all types are merged into one file the dynamics change: instead of thousands
of small files, you have one file that can grow into the tens of megabytes.

### Benchmark setup

A synthetic merged file was generated at three sizes using the same AST workload
as the rest of the benchmarks. Two strategies were compared:

| Strategy | Description |
|---|---|
| **string-array** | One pass, chunks pushed into `string[]`, single `join()`, then `writeFile` |
| **two-pass stream** | Pass 1: `ImportCollector` (no-op writer, collects imports only). Pass 2: chunks written directly to `createWriteStream` in `writeRaw()` — body never materialised as a string |

### Results (Node.js, single file)

```
Size     Strategy           Avg ms    RSS Δ
──────────────────────────────────────────────
 1 MB    string-array          15 ms   +2834 KB
 1 MB    two-pass stream       62 ms  +63653 KB
 5 MB    string-array         110 ms    (GC)
 5 MB    two-pass stream      292 ms  +52107 KB
20 MB    string-array         410 ms    (GC)
20 MB    two-pass stream     1212 ms  +61016 KB
```

**string-array is 3–4× faster across all sizes and uses less memory.**

### Why two-pass stream loses

The intuition — "streaming avoids holding the full string in memory" — is correct
in principle, but two factors make it lose in practice:

**Double AST walk.** Pass 1 (import collection) and pass 2 (body render) each
walk the full AST. For a 20 MB file that is tens of thousands of nodes visited
twice. The CPU cost dominates.

**Per-chunk `stream.write()` overhead.** `createWriteStream` maintains an
internal userspace buffer. Every `writeRaw()` call — one per token, thousands
per file — does a synchronous `writable.write()` through that buffer. This is
significantly more overhead than `chunks.push(text)`. The OS does not see the
writes any earlier; you just pay more per write to get there.

**RSS delta is misleading.** The two-pass path shows *higher* RSS because the
stream's internal buffer and the double walk's intermediate allocations are live
simultaneously. String-array has lower peak working set despite holding the full
chunk array, because V8 can GC aggressively between operations.

### Recommendation for large files

Use `AbstractChunkWriter` (string-array). It is the safest and fastest option
at any file size:

- O(n) work with no JIT dependency (unlike `+=` which relies on V8's rope optimisation)
- Single `join("")` allocation — one pass, predictable memory
- No streaming infrastructure, no double walk

Two-pass direct streaming is only worth considering if a single file exceeds
**~100 MB** and peak heap is the hard constraint. At that scale the `join()`
allocation itself becomes the bottleneck, and streaming avoids it. For the
foreseeable merged-types use case, string-array is the right default.

---

## 5. Node.js vs Bun

```
                               Node    Bun (node:fs compat)   Bun (native API)
── render / toString()
string-concat                   3 ms          7 ms                  —
string-array                    4 ms          6 ms                  —
node-stream                     4 ms          6 ms                  —

── file I/O: 1 generator, limited(8)
writeFile                      81 ms        163 ms               129 ms
pipeToNode                     82 ms        582 ms                  —
pipeToBun                       —             —                  143 ms

── file I/O: 4 generators concurrent, limited(8)
writeFile                     367 ms        800 ms               564 ms
pipeToNode                    347 ms       1966 ms                  —
pipeToBun                       —             —                  590 ms
```

**Render (CPU):** Node is ~1.7× faster. V8's JIT is better suited to this
workload — tight loops over many small objects with heavy string operations.
Bun uses JavaScriptCore, which has a faster startup time but a slower steady-state
JIT for this pattern.

**File I/O via `node:fs` compat:** Bun is 2–7× slower than Node. Bun emulates
Node's `node:stream` / `createWriteStream` API in userspace; each `write()` call
passes through that emulation layer. `pipeToNode` is particularly bad because it
makes one `write()` call per chunk.

**File I/O via native Bun API** (`Bun.write` / `FileSink`): The gap narrows to
~1.6×. `FileSink.write()` is synchronous (no per-chunk event-loop round-trips),
which is the same reason `pipeToNode` is fast on Node. Still slower than Node
across the board.

**Verdict:** Don't switch to Bun for this workload. Node leads on both CPU and
I/O. If you ever do run on Bun, use `pipeToBun()` — it's already implemented on
`AbstractWritableWriter` and avoids the compat overhead that makes `pipeToNode`
unusable on Bun.

---

## 6. Codebase map

```
core/
  AbstractWriter.ts            string-concat base          ← recommended default
  AbstractChunkWriter.ts      string-array base           ← drop-in alternative
  AbstractWritableWriter.ts   streaming base              ← pipeToNode / pipeToBun

typescript/
  Writer.ts                    import tracking, extends AbstractWriter
  ChunkWriter.ts               import tracking, extends AbstractChunkWriter
  WritableWriter.ts            import tracking, extends AbstractWritableWriter

csharp/
  Writer.ts                    using tracking, extends AbstractWriter
  ChunkWriter.ts               using tracking, extends AbstractChunkWriter
  WritableWriter.ts            using tracking, extends AbstractWritableWriter

bench.ts                       run with: npx tsx bench.ts
                                         bun run bench.ts
bench-large.ts                 large single-file benchmark (merged types.ts)
                                         run with: npx tsx bench-large.ts
```

All three writer families implement `IWriter`. AST nodes call `IWriter` methods
and are unaware of which strategy is in use — swapping is one line at the
construction site.
