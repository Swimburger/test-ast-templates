import { AbstractAstNode } from "../core/AbstractAstNode.js";
import type { IWriter } from "../core/IWriter.js";
import type { CSharpReference } from "./Reference.js";

// A reference to a C# type from another namespace.
// write() self-registers the using directive with the writer, then emits the local name.
export class ClassReference extends AbstractAstNode implements CSharpReference {
    public readonly localName: string;
    public readonly namespace?: string;

    constructor(ref: CSharpReference) {
        super();
        this.localName = ref.localName;
        this.namespace = ref.namespace;
    }

    public write(writer: IWriter): void {
        writer.addReference(this);
        writer.write(this.localName);
    }
}

export function classRef(ref: CSharpReference): ClassReference {
    return new ClassReference(ref);
}
