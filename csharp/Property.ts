// C# property declaration.
//
//   property("Name", "string")
//       .access("public")
//       .required()
//       .get()
//       .init()
//
// Generates:
//   public required string Name { get; init; }

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { type Attribute } from "./attributes.js";
import { type XmlDoc, writeXmlDoc } from "./docComment.js";

type Access = "public" | "private" | "protected" | "internal" | "protected internal";
type Accessor = "public" | "private" | "protected" | "internal";

export class Property extends AbstractAstNode {
    private access_: Access | undefined;
    private static_ = false;
    private required_ = false;
    private get_: Accessor | true | undefined;
    private set_: Accessor | true | undefined;
    private init_: Accessor | true | undefined;
    private initialValue_: AstArg | undefined;
    private readonly attributes_: Attribute[] = [];
    private doc_: string | XmlDoc | undefined;

    constructor(
        private readonly name_: string,
        private readonly type_: AstArg,
    ) {
        super();
    }

    public access(a: Access): this { this.access_ = a; return this; }
    public static(): this { this.static_ = true; return this; }
    public required(): this { this.required_ = true; return this; }
    public get(access?: Accessor): this { this.get_ = access ?? true; return this; }
    public set(access?: Accessor): this { this.set_ = access ?? true; return this; }
    public init(access?: Accessor): this { this.init_ = access ?? true; return this; }
    public initialValue(value: AstArg): this { this.initialValue_ = value; return this; }
    public attribute(attr: Attribute): this { this.attributes_.push(attr); return this; }
    public attributes(attrs: Attribute[]): this { this.attributes_.push(...attrs); return this; }
    public doc(d: string | XmlDoc): this { this.doc_ = d; return this; }

    public write(writer: IWriter): void {
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);
        for (const attr of this.attributes_) attr.write(writer);
        if (this.access_)   writer.write(`${this.access_} `);
        if (this.static_)   writer.write("static ");
        if (this.required_) writer.write("required ");
        writeArg(writer, this.type_);
        writer.write(` ${this.name_} {`);

        const writeAccessor = (keyword: string, access: Accessor | true) => {
            writer.write(" ");
            if (access !== true) writer.write(`${access} `);
            writer.write(`${keyword};`);
        };

        if (this.get_  != null) writeAccessor("get",  this.get_);
        if (this.set_  != null) writeAccessor("set",  this.set_);
        if (this.init_ != null) writeAccessor("init", this.init_);

        writer.write(" }");

        if (this.initialValue_ != null) {
            writer.write(" = ");
            writeArg(writer, this.initialValue_);
            writer.write(";");
        }

        writer.writeNewLineIfLastLineNot();
    }
}

export function property(name: string, type: AstArg): Property {
    return new Property(name, type);
}
