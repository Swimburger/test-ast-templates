import { AbstractWritableWriter } from "../core/AbstractWritableWriter.js";
import { CSHARP_CONFIG } from "../core/ILanguageConfig.js";
import type { IndentStyle } from "../core/AbstractWriter.js";
import type { Reference } from "../core/Reference.js";
import type { CSharpReference } from "./Reference.js";

export class WritableWriter extends AbstractWritableWriter {
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

    protected override header(): string {
        return [...this.usings]
            .sort()
            .map((ns) => `using ${ns};`)
            .join("\n");
    }
}
