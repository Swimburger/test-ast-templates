import { AbstractChunkWriter } from "../core/AbstractChunkWriter.js";
import { CSHARP_CONFIG } from "../core/ILanguageConfig.js";
import type { IndentStyle } from "../core/AbstractWriter.js";
import type { Reference } from "../core/Reference.js";
import type { CSharpReference } from "./Reference.js";

export class ChunkWriter extends AbstractChunkWriter {
    constructor(opts: { indentStyle?: IndentStyle } = {}) {
        super({ ...opts, languageConfig: CSHARP_CONFIG });
    }

    private readonly usings = new Set<string>();

    public override addReference(ref: Reference): void {
        const csRef = ref as CSharpReference;
        if (csRef.namespace) {
            this.usings.add(csRef.namespace);
        }
    }

    public override toString(): string {
        const usings = this.stringifyUsings();
        return usings ? `${usings}\n\n${this.buffer}` : this.buffer;
    }

    private stringifyUsings(): string {
        return [...this.usings]
            .sort()
            .map((ns) => `using ${ns};`)
            .join("\n");
    }
}
