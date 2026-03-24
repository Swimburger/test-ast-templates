// C# type declaration builder.
//
// Factories mirror C# keywords (with cs-prefix where needed for reserved words):
//
//   record("Shape").access("public").property(...).method(...).build()
//   csClass("ApiException").access("public").extends("Exception").build()
//   csInterface("IShape").access("public").method(...).build()
//   struct("Point").access("public").property(...).build()
//   recordStruct("Size").access("public").property(...).build()
//
// Typed member methods — each only accepts its own node type:
//
//   .field(FieldNode)             .fields([...])
//   .property(Property)           .properties([...])
//   .constant(ConstantNode)       .constants([...])
//   .ctor(ConstructorNode)
//   .method(MethodNode)           .methods([...])
//   .nestedClass(TypeDeclarationNode)
//   .nestedRecord(TypeDeclarationNode)
//   .nestedInterface(TypeDeclarationNode)
//   .nestedStruct(TypeDeclarationNode)
//   .nestedRecordStruct(TypeDeclarationNode)

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { type ClassAttribute } from "./attributes.js";
import { type XmlDoc, writeXmlDoc } from "./docComment.js";
import { MethodNode, ConstructorNode } from "./Method.js";
import { Property } from "./Property.js";
import { FieldNode, ConstantNode } from "./Field.js";
import { EnumNode } from "./Enum.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Kind = "class" | "record" | "interface" | "struct" | "record struct";
type Access = "public" | "internal" | "protected" | "protected internal" | "private";

export interface PrimaryCtorParam {
    name: string;
    type: AstArg;
}

// ---------------------------------------------------------------------------
// TypeDeclarationNode — holds all data, does the writing
// ---------------------------------------------------------------------------

export class TypeDeclarationNode extends AbstractAstNode {
    public access_: Access | undefined;
    public namespace_: string | undefined;
    public readonly attributes_: ClassAttribute[] = [];
    public readonly typeParams_: string[] = [];
    public readonly members_: AbstractAstNode[] = [];
    public readonly baseTypes_: AstArg[] = [];
    public baseCtorArgs_: AstArg[] = [];
    public primaryCtor_: PrimaryCtorParam[] | undefined;
    public sealed_ = false;
    public abstract_ = false;
    public static_ = false;
    public partial_ = false;
    public doc_: string | XmlDoc | undefined;

    constructor(
        public readonly name_: string,
        public readonly kind_: Kind,
    ) {
        super();
    }

    public write(writer: IWriter): void {
        // File-scoped namespace
        if (this.namespace_ != null) {
            writer.writeLine(`namespace ${this.namespace_};`);
            writer.newLine();
        }

        // Doc comment (before attributes, per C# convention)
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);

        // Attributes
        for (const attr of this.attributes_) attr.write(writer);

        // Modifiers + kind + name
        if (this.access_)   writer.write(`${this.access_} `);
        if (this.sealed_)   writer.write("sealed ");
        if (this.abstract_) writer.write("abstract ");
        if (this.static_)   writer.write("static ");
        if (this.partial_)  writer.write("partial ");
        writer.write(`${this.kind_} ${this.name_}`);

        // Type parameters
        if (this.typeParams_.length > 0) {
            writer.write(`<${this.typeParams_.join(", ")}>`);
        }

        // Primary constructor
        if (this.primaryCtor_ != null && this.primaryCtor_.length > 0) {
            writer.writeLine("(");
            writer.indent();
            for (let i = 0; i < this.primaryCtor_.length; i++) {
                const p = this.primaryCtor_[i]!;
                writeArg(writer, p.type);
                writer.write(` ${p.name}`);
                if (i < this.primaryCtor_.length - 1) writer.write(",");
                writer.newLine();
            }
            writer.dedent();
            writer.write(")");
        }

        // Base types / interfaces
        if (this.baseTypes_.length > 0) {
            writer.write(" : ");
            for (let i = 0; i < this.baseTypes_.length; i++) {
                if (i > 0) writer.write(", ");
                writeArg(writer, this.baseTypes_[i]!);
            }
            // Base constructor args (e.g. : Exception(message))
            if (this.baseCtorArgs_.length > 0) {
                writer.write("(");
                for (let i = 0; i < this.baseCtorArgs_.length; i++) {
                    if (i > 0) writer.write(", ");
                    writeArg(writer, this.baseCtorArgs_[i]!);
                }
                writer.write(")");
            }
        }

        // Concise semicolon form for records/structs with a primary ctor and no members
        const concise = this.members_.length === 0 && this.primaryCtor_ != null;
        if (concise) {
            writer.write(";");
            writer.writeNewLineIfLastLineNot();
            return;
        }

        writer.writeNewLineIfLastLineNot();
        writer.pushScope();
        for (let i = 0; i < this.members_.length; i++) {
            const m = this.members_[i]!;
            const isBlock = m instanceof MethodNode || m instanceof ConstructorNode || m instanceof TypeDeclarationNode;
            if (i > 0 && isBlock) writer.newLine();
            m.write(writer);
            writer.writeNewLineIfLastLineNot();
        }
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

// ---------------------------------------------------------------------------
// TypeDeclaration<TState> — phantom-type wrapper
// ---------------------------------------------------------------------------

export class TypeDeclaration<TState = object> {
    constructor(protected readonly node: TypeDeclarationNode) {}

    public access<S extends TState>(this: TypeDeclaration<S>, a: Access): TypeDeclaration<S> {
        this.node.access_ = a;
        return this as any;
    }

    public namespace<S extends TState>(this: TypeDeclaration<S>, ns: string): TypeDeclaration<S> {
        this.node.namespace_ = ns;
        return this as any;
    }

    public sealed<S extends TState>(this: TypeDeclaration<S>): TypeDeclaration<S> {
        this.node.sealed_ = true;
        return this as any;
    }

    public abstract<S extends TState>(this: TypeDeclaration<S>): TypeDeclaration<S> {
        this.node.abstract_ = true;
        return this as any;
    }

    public static<S extends TState>(this: TypeDeclaration<S>): TypeDeclaration<S> {
        this.node.static_ = true;
        return this as any;
    }

    public partial<S extends TState>(this: TypeDeclaration<S>): TypeDeclaration<S> {
        this.node.partial_ = true;
        return this as any;
    }

    public typeParam<S extends TState>(this: TypeDeclaration<S>, name: string): TypeDeclaration<S> {
        this.node.typeParams_.push(name);
        return this as any;
    }

    public doc<S extends TState>(this: TypeDeclaration<S>, d: string | XmlDoc): TypeDeclaration<S> {
        this.node.doc_ = d;
        return this as any;
    }

    public attribute<S extends TState>(this: TypeDeclaration<S>, attr: ClassAttribute): TypeDeclaration<S> {
        this.node.attributes_.push(attr);
        return this as any;
    }

    public extends<S extends TState>(this: TypeDeclaration<S>, base: AstArg, ctorArgs?: AstArg[]): TypeDeclaration<S> {
        this.node.baseTypes_.unshift(base);
        if (ctorArgs) this.node.baseCtorArgs_ = ctorArgs;
        return this as any;
    }

    public implements<S extends TState>(this: TypeDeclaration<S>, ...ifaces: AstArg[]): TypeDeclaration<S> {
        this.node.baseTypes_.push(...ifaces);
        return this as any;
    }

    public primaryCtor<S extends TState>(this: TypeDeclaration<S>, params: PrimaryCtorParam[]): TypeDeclaration<S> {
        this.node.primaryCtor_ = params;
        return this as any;
    }

    // -- Typed member methods --

    public field<S extends TState>(this: TypeDeclaration<S>, f: FieldNode): TypeDeclaration<S> {
        this.node.members_.push(f);
        return this as any;
    }

    public fields<S extends TState>(this: TypeDeclaration<S>, fs: FieldNode[]): TypeDeclaration<S> {
        this.node.members_.push(...fs);
        return this as any;
    }

    public property<S extends TState>(this: TypeDeclaration<S>, p: Property): TypeDeclaration<S> {
        this.node.members_.push(p);
        return this as any;
    }

    public properties<S extends TState>(this: TypeDeclaration<S>, ps: Property[]): TypeDeclaration<S> {
        this.node.members_.push(...ps);
        return this as any;
    }

    public constant<S extends TState>(this: TypeDeclaration<S>, c: ConstantNode): TypeDeclaration<S> {
        this.node.members_.push(c);
        return this as any;
    }

    public constants<S extends TState>(this: TypeDeclaration<S>, cs: ConstantNode[]): TypeDeclaration<S> {
        this.node.members_.push(...cs);
        return this as any;
    }

    public ctor<S extends TState>(this: TypeDeclaration<S>, c: ConstructorNode): TypeDeclaration<S> {
        this.node.members_.push(c);
        return this as any;
    }

    public method<S extends TState>(this: TypeDeclaration<S>, m: MethodNode): TypeDeclaration<S> {
        this.node.members_.push(m);
        return this as any;
    }

    public methods<S extends TState>(this: TypeDeclaration<S>, ms: MethodNode[]): TypeDeclaration<S> {
        this.node.members_.push(...ms);
        return this as any;
    }

    public nestedClass<S extends TState>(this: TypeDeclaration<S>, t: TypeDeclarationNode): TypeDeclaration<S> {
        this.node.members_.push(t);
        return this as any;
    }

    public nestedRecord<S extends TState>(this: TypeDeclaration<S>, t: TypeDeclarationNode): TypeDeclaration<S> {
        this.node.members_.push(t);
        return this as any;
    }

    public nestedRecords<S extends TState>(this: TypeDeclaration<S>, ts: TypeDeclarationNode[]): TypeDeclaration<S> {
        this.node.members_.push(...ts);
        return this as any;
    }

    public nestedInterface<S extends TState>(this: TypeDeclaration<S>, t: TypeDeclarationNode): TypeDeclaration<S> {
        this.node.members_.push(t);
        return this as any;
    }

    public nestedStruct<S extends TState>(this: TypeDeclaration<S>, t: TypeDeclarationNode): TypeDeclaration<S> {
        this.node.members_.push(t);
        return this as any;
    }

    public nestedRecordStruct<S extends TState>(this: TypeDeclaration<S>, t: TypeDeclarationNode): TypeDeclaration<S> {
        this.node.members_.push(t);
        return this as any;
    }

    public nestedEnum<S extends TState>(this: TypeDeclaration<S>, e: EnumNode): TypeDeclaration<S> {
        this.node.members_.push(e);
        return this as any;
    }

    public build<S extends TState>(this: TypeDeclaration<S>): TypeDeclarationNode {
        return this.node;
    }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function record(name: string):       TypeDeclaration { return new TypeDeclaration(new TypeDeclarationNode(name, "record")); }
export function csClass(name: string):      TypeDeclaration { return new TypeDeclaration(new TypeDeclarationNode(name, "class")); }
export function csInterface(name: string):  TypeDeclaration { return new TypeDeclaration(new TypeDeclarationNode(name, "interface")); }
export function struct(name: string):       TypeDeclaration { return new TypeDeclaration(new TypeDeclarationNode(name, "struct")); }
export function recordStruct(name: string): TypeDeclaration { return new TypeDeclaration(new TypeDeclarationNode(name, "record struct")); }
