import { AbstractWriter, type IndentStyle } from "../core/AbstractWriter.js";
import type { Reference } from "../core/Reference.js";
import type { CSharpReference } from "./Reference.js";

export class Writer extends AbstractWriter {
    constructor(opts: { indentStyle?: IndentStyle } = {}) {
        super(opts);
    }

    // Collected namespaces for `using` directives, in insertion order.
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
