// C# field and constant declarations.
//
//   field("_client", HttpClient).access("private").readonly()
//     → private readonly HttpClient _client;
//
//   constant("Version", "string").access("public").value('"1.0"')
//     → public const string Version = "1.0";

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { type XmlDoc, writeXmlDoc } from "./docComment.js";

type Access = "public" | "internal" | "protected" | "protected internal" | "private";

// ---------------------------------------------------------------------------
// FieldNode
// ---------------------------------------------------------------------------

export class FieldNode extends AbstractAstNode {
    public access_: Access | undefined;
    public static_   = false;
    public readonly_ = false;
    public doc_: string | XmlDoc | undefined;

    constructor(
        private readonly name_: string,
        private readonly type_: AstArg,
    ) {
        super();
    }

    public write(writer: IWriter): void {
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);
        if (this.access_)   writer.write(`${this.access_} `);
        if (this.static_)   writer.write("static ");
        if (this.readonly_) writer.write("readonly ");
        writeArg(writer, this.type_);
        writer.write(` ${this.name_};`);
        writer.writeNewLineIfLastLineNot();
    }
}

export class Field {
    constructor(private readonly node: FieldNode) {}

    public access(a: Access): this { this.node.access_ = a; return this; }
    public static(): this  { this.node.static_   = true; return this; }
    public readonly(): this { this.node.readonly_ = true; return this; }
    public doc(d: string | XmlDoc): this { this.node.doc_ = d; return this; }

    public build(): FieldNode { return this.node; }
}

export function field(name: string, type: AstArg): Field {
    return new Field(new FieldNode(name, type));
}

// ---------------------------------------------------------------------------
// ConstantNode
// ---------------------------------------------------------------------------

export class ConstantNode extends AbstractAstNode {
    public access_: Access | undefined;
    public value_: AstArg | undefined;
    public doc_: string | XmlDoc | undefined;

    constructor(
        private readonly name_: string,
        private readonly type_: AstArg,
    ) {
        super();
    }

    public write(writer: IWriter): void {
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);
        if (this.access_) writer.write(`${this.access_} `);
        writer.write("const ");
        writeArg(writer, this.type_);
        writer.write(` ${this.name_}`);
        if (this.value_ != null) {
            writer.write(" = ");
            writeArg(writer, this.value_);
        }
        writer.write(";");
        writer.writeNewLineIfLastLineNot();
    }
}

export class Constant {
    constructor(private readonly node: ConstantNode) {}

    public access(a: Access): this { this.node.access_ = a; return this; }
    public value(v: AstArg): this  { this.node.value_ = v; return this; }
    public doc(d: string | XmlDoc): this { this.node.doc_ = d; return this; }

    public build(): ConstantNode { return this.node; }
}

export function constant(name: string, type: AstArg): Constant {
    return new Constant(new ConstantNode(name, type));
}
