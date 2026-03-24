// C# enum declaration builder.
//
//   csharp.enum("ShapeKind")
//       .access("public")
//       .member("Circle")
//       .member("Rectangle", 2)
//       .build()
//
// Generates:
//   public enum ShapeKind
//   {
//       Circle,
//       Rectangle = 2,
//   }

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { type ClassAttribute } from "./attributes.js";
import { type XmlDoc, writeXmlDoc } from "./docComment.js";

type Access = "public" | "internal" | "protected" | "protected internal" | "private";

interface EnumMember {
    name: string;
    value?: AstArg;
}

export class EnumNode extends AbstractAstNode {
    public access_: Access | undefined;
    public doc_: string | XmlDoc | undefined;
    public readonly attributes_: ClassAttribute[] = [];
    public readonly members_: EnumMember[] = [];

    constructor(public readonly name_: string) {
        super();
    }

    public write(writer: IWriter): void {
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);
        for (const attr of this.attributes_) attr.write(writer);
        if (this.access_) writer.write(`${this.access_} `);
        writer.writeLine(`enum ${this.name_}`);
        writer.pushScope();
        for (const m of this.members_) {
            writer.write(m.name);
            if (m.value != null) {
                writer.write(" = ");
                writeArg(writer, m.value);
            }
            writer.writeLine(",");
        }
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export class CsEnum {
    constructor(private readonly node: EnumNode) {}

    public access(a: Access): this { this.node.access_ = a; return this; }
    public doc(d: string | XmlDoc): this { this.node.doc_ = d; return this; }
    public attribute(attr: ClassAttribute): this { this.node.attributes_.push(attr); return this; }

    public member(name: string, value?: AstArg): this {
        this.node.members_.push({ name, value });
        return this;
    }

    public members(members: { name: string; value?: AstArg }[]): this {
        this.node.members_.push(...members);
        return this;
    }

    public build(): EnumNode { return this.node; }
}

export function csEnum(name: string): CsEnum {
    return new CsEnum(new EnumNode(name));
}
