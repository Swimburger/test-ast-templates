// Fluent C# type reference builder.
//
//   csharp.typeRef("string")                          → string
//   csharp.typeRef(HttpClient)                        → HttpClient   (+ using)
//   csharp.typeRef("Task").generic("string")          → Task<string>
//   csharp.typeRef("Func").generic(Circle).generic("T") → Func<Circle, T>
//   csharp.typeRef(Shape).nullable()                  → Shape?
//   csharp.typeRef("IEnumerable").generic(Shape).nullable() → IEnumerable<Shape>?

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";

export class TypeRefNode extends AbstractAstNode {
    public readonly generics_: AstArg[] = [];
    public nullable_ = false;

    constructor(private readonly base_: AstArg) {
        super();
    }

    public write(writer: IWriter): void {
        writeArg(writer, this.base_);
        if (this.generics_.length > 0) {
            writer.write("<");
            for (let i = 0; i < this.generics_.length; i++) {
                if (i > 0) writer.write(", ");
                writeArg(writer, this.generics_[i]!);
            }
            writer.write(">");
        }
        if (this.nullable_) writer.write("?");
    }
}

export class TypeRef {
    constructor(private readonly node: TypeRefNode) {}

    public generic(type: AstArg): this {
        this.node.generics_.push(type);
        return this;
    }

    public nullable(): this {
        this.node.nullable_ = true;
        return this;
    }

    public build(): TypeRefNode {
        return this.node;
    }
}

export function typeRef(base: AstArg): TypeRef {
    return new TypeRef(new TypeRefNode(base));
}
