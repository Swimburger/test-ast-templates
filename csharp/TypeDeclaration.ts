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
import type { CsMemberNode } from "./slots.js";

// Phantom state tags for type declaration builders.
declare const _csIsSealed:   unique symbol;
declare const _csIsAbstract: unique symbol;
declare const _csHasExtends: unique symbol;

export type CsIsSealed   = { readonly [_csIsSealed]:   true };
export type CsIsAbstract = { readonly [_csIsAbstract]: true };
export type CsHasExtends = { readonly [_csHasExtends]: true };

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
    public readonly members_: CsMemberNode[] = [];
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
// Shared base — methods common to all C# type declarations
// ---------------------------------------------------------------------------

class TypeDeclarationBase {
    constructor(protected readonly node: TypeDeclarationNode) {}

    public access(a: Access): this { this.node.access_ = a; return this; }
    public namespace(ns: string): this { this.node.namespace_ = ns; return this; }
    public partial(): this { this.node.partial_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public doc(d: string | XmlDoc): this { this.node.doc_ = d; return this; }
    public attribute(attr: ClassAttribute): this { this.node.attributes_.push(attr); return this; }

    public method(m: MethodNode): this { this.node.members_.push(m); return this; }
    public methods(ms: MethodNode[]): this { this.node.members_.push(...ms); return this; }
    public nestedEnum(e: EnumNode): this { this.node.members_.push(e); return this; }

    public build(): TypeDeclarationNode { return this.node; }
}

// ---------------------------------------------------------------------------
// ClassDeclaration — `class`
//
// Has: sealed, abstract (mutex), static, extends (once), implements,
//      fields, constants, ctor, properties, nested types
// ---------------------------------------------------------------------------

export class ClassDeclaration<TState = object> extends TypeDeclarationBase {
    // sealed() — disappears after abstract()
    public sealed<S extends TState>(
        this: ClassDeclaration<S & (S extends CsIsAbstract ? never : S)>,
    ): ClassDeclaration<S & CsIsSealed> {
        this.node.sealed_ = true;
        return this as any;
    }

    // abstract() — disappears after sealed()
    public abstract<S extends TState>(
        this: ClassDeclaration<S & (S extends CsIsSealed ? never : S)>,
    ): ClassDeclaration<S & CsIsAbstract> {
        this.node.abstract_ = true;
        return this as any;
    }

    public static(): this { this.node.static_ = true; return this; }

    // extends() — only callable once
    public extends<S extends TState>(
        this: ClassDeclaration<S & (S extends CsHasExtends ? never : S)>,
        base: AstArg,
        ctorArgs?: AstArg[],
    ): ClassDeclaration<S & CsHasExtends> {
        this.node.baseTypes_.unshift(base);
        if (ctorArgs) this.node.baseCtorArgs_ = ctorArgs;
        return this as any;
    }

    public implements(...ifaces: AstArg[]): this { this.node.baseTypes_.push(...ifaces); return this; }

    public field(f: FieldNode): this { this.node.members_.push(f); return this; }
    public fields(fs: FieldNode[]): this { this.node.members_.push(...fs); return this; }
    public constant(c: ConstantNode): this { this.node.members_.push(c); return this; }
    public constants(cs: ConstantNode[]): this { this.node.members_.push(...cs); return this; }
    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public primaryCtor(params: PrimaryCtorParam[]): this { this.node.primaryCtor_ = params; return this; }
    public ctor(c: ConstructorNode): this { this.node.members_.push(c); return this; }
    public nestedClass(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedRecord(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedRecords(ts: TypeDeclarationNode[]): this { this.node.members_.push(...ts); return this; }
    public nestedInterface(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedStruct(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedRecordStruct(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
}

// ---------------------------------------------------------------------------
// RecordDeclaration — `record` / `record class`
//
// Has: sealed, abstract (mutex), primaryCtor, extends (once), implements,
//      properties, nested types. No static, no explicit ctor.
// ---------------------------------------------------------------------------

export class RecordDeclaration<TState = object> extends TypeDeclarationBase {
    // sealed() — disappears after abstract()
    public sealed<S extends TState>(
        this: RecordDeclaration<S & (S extends CsIsAbstract ? never : S)>,
    ): RecordDeclaration<S & CsIsSealed> {
        this.node.sealed_ = true;
        return this as any;
    }

    // abstract() — disappears after sealed()
    public abstract<S extends TState>(
        this: RecordDeclaration<S & (S extends CsIsSealed ? never : S)>,
    ): RecordDeclaration<S & CsIsAbstract> {
        this.node.abstract_ = true;
        return this as any;
    }

    public primaryCtor(params: PrimaryCtorParam[]): this { this.node.primaryCtor_ = params; return this; }

    // extends() — only callable once
    public extends<S extends TState>(
        this: RecordDeclaration<S & (S extends CsHasExtends ? never : S)>,
        base: AstArg,
        ctorArgs?: AstArg[],
    ): RecordDeclaration<S & CsHasExtends> {
        this.node.baseTypes_.unshift(base);
        if (ctorArgs) this.node.baseCtorArgs_ = ctorArgs;
        return this as any;
    }

    public implements(...ifaces: AstArg[]): this { this.node.baseTypes_.push(...ifaces); return this; }

    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public constant(c: ConstantNode): this { this.node.members_.push(c); return this; }
    public constants(cs: ConstantNode[]): this { this.node.members_.push(...cs); return this; }
    public nestedClass(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedRecord(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedRecords(ts: TypeDeclarationNode[]): this { this.node.members_.push(...ts); return this; }
    public nestedInterface(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedStruct(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedRecordStruct(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
}

// ---------------------------------------------------------------------------
// InterfaceDeclaration — `interface`
//
// No: fields, constants, ctor, sealed, abstract, static, extends with ctor args
// Has: implements (interface inheritance uses the same base list in C#)
// ---------------------------------------------------------------------------

export class InterfaceDeclaration extends TypeDeclarationBase {
    public implements(...ifaces: AstArg[]): this { this.node.baseTypes_.push(...ifaces); return this; }

    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public nestedInterface(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
}

// ---------------------------------------------------------------------------
// StructDeclaration — `struct` / `record struct`
//
// No: abstract, static, extends. Has: implements, sealed (record struct only),
//     fields, properties, ctor
// ---------------------------------------------------------------------------

export class StructDeclaration extends TypeDeclarationBase {
    public sealed(): this { this.node.sealed_ = true; return this; }
    public implements(...ifaces: AstArg[]): this { this.node.baseTypes_.push(...ifaces); return this; }
    public primaryCtor(params: PrimaryCtorParam[]): this { this.node.primaryCtor_ = params; return this; }

    public field(f: FieldNode): this { this.node.members_.push(f); return this; }
    public fields(fs: FieldNode[]): this { this.node.members_.push(...fs); return this; }
    public constant(c: ConstantNode): this { this.node.members_.push(c); return this; }
    public constants(cs: ConstantNode[]): this { this.node.members_.push(...cs); return this; }
    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public ctor(c: ConstructorNode): this { this.node.members_.push(c); return this; }
    public nestedInterface(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function record(name: string):       RecordDeclaration    { return new RecordDeclaration(new TypeDeclarationNode(name, "record")); }
export function csClass(name: string):      ClassDeclaration     { return new ClassDeclaration(new TypeDeclarationNode(name, "class")); }
export function csInterface(name: string):  InterfaceDeclaration { return new InterfaceDeclaration(new TypeDeclarationNode(name, "interface")); }
export function struct(name: string):       StructDeclaration    { return new StructDeclaration(new TypeDeclarationNode(name, "struct")); }
export function recordStruct(name: string): StructDeclaration    { return new StructDeclaration(new TypeDeclarationNode(name, "record struct")); }
