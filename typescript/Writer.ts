import { AbstractWriter, type IndentStyle } from "../core/AbstractWriter.js";
import type { Reference } from "../core/Reference.js";
import type { TypeScriptReference } from "./Reference.js";

export class Writer extends AbstractWriter {
    constructor(opts: { indentStyle?: IndentStyle } = {}) {
        super(opts);
    }

    private readonly namedImports = new Map<string, Set<string>>();
    private readonly typeOnlyImports = new Map<string, Set<string>>();
    private readonly defaultImports = new Map<string, string>();
    private readonly starImports = new Map<string, string>();

    public override addReference(ref: Reference): void {
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

    public override toString(): string {
        const imports = this.stringifyImports();
        return imports ? `${imports}\n${this.buffer}` : this.buffer;
    }

    public importsToString(): string {
        return this.stringifyImports();
    }

    private stringifyImports(): string {
        const lines: string[] = [];
        for (const [alias, modulePath] of this.starImports) {
            lines.push(`import * as ${alias} from "${modulePath}";`);
        }
        for (const [modulePath, localName] of this.defaultImports) {
            lines.push(`import ${localName} from "${modulePath}";`);
        }
        for (const [modulePath, names] of this.namedImports) {
            lines.push(`import { ${[...names].sort().join(", ")} } from "${modulePath}";`);
        }
        for (const [modulePath, names] of this.typeOnlyImports) {
            lines.push(`import type { ${[...names].sort().join(", ")} } from "${modulePath}";`);
        }
        return lines.sort().join("\n");
    }
}
