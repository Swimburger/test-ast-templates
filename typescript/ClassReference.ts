import { AbstractAstNode } from "../core/AbstractAstNode.js";
import type { IWriter } from "../core/IWriter.js";
import type { TypeScriptReference } from "./Reference.js";

// A reference to a TypeScript type or value from another module.
// write() self-registers the import with the writer, then emits the local name.
// This is the pattern used across all Fern generators (PHP, C#, Java, Ruby, Go).
export class ClassReference extends AbstractAstNode implements TypeScriptReference {
    public readonly localName: string;
    public readonly modulePath?: string;
    public readonly defaultImport?: boolean;
    public readonly starImport?: string;
    public readonly typeOnly?: boolean;

    constructor(ref: TypeScriptReference) {
        super();
        this.localName = ref.localName;
        this.modulePath = ref.modulePath;
        this.defaultImport = ref.defaultImport;
        this.starImport = ref.starImport;
        this.typeOnly = ref.typeOnly;
    }

    public write(writer: IWriter): void {
        writer.addReference(this);
        writer.write(this.localName);
    }
}

export function classRef(ref: TypeScriptReference): ClassReference {
    return new ClassReference(ref);
}
