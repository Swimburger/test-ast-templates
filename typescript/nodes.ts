// TypeScript-specific AST nodes.
//
// Builder pattern mirrors the csharp layer.
// All nodes are typed against IWriter and work with the TypeScript Writer
// which emits ES module import statements.

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { Statement } from "../core/Statement.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function writeArgStatement(writer: IWriter, arg: AstArg): void {
    if (arg instanceof Statement) {
        writeArg(writer, arg);
        writer.writeNewLineIfLastLineNot();
    } else {
        writeArg(writer, arg);
        writer.write(";");
        writer.writeNewLineIfLastLineNot();
    }
}

function writeDelimited(writer: IWriter, args: AstArg[]): void {
    for (let i = 0; i < args.length; i++) {
        if (i > 0) writer.write(", ");
        writeArg(writer, args[i]!);
    }
}

// ---------------------------------------------------------------------------
// ReturnStatement
// ---------------------------------------------------------------------------

export class ReturnStatement extends Statement {
    constructor(private readonly value_: AstArg) { super(); }
    public write(writer: IWriter): void {
        writer.write("return ");
        writeArg(writer, this.value_);
        writer.writeStatement();
    }
}

export function returnStatement(value: AstArg): ReturnStatement {
    return new ReturnStatement(value);
}

// ---------------------------------------------------------------------------
// IfStatement
// ---------------------------------------------------------------------------

interface IfClause { condition: AstArg | null; body: AstArg[]; }

export class IfStatement extends Statement {
    private readonly clauses_: IfClause[] = [];
    private pendingCondition_: AstArg | null = null;

    constructor(condition: AstArg) { super(); this.pendingCondition_ = condition; }

    public then(...body: AstArg[]): this {
        this.clauses_.push({ condition: this.pendingCondition_, body });
        this.pendingCondition_ = null;
        return this;
    }
    public elseIf(condition: AstArg): this { this.pendingCondition_ = condition; return this; }
    public else(...body: AstArg[]): this { this.clauses_.push({ condition: null, body }); return this; }

    public write(writer: IWriter): void {
        for (let i = 0; i < this.clauses_.length; i++) {
            const c = this.clauses_[i]!;
            if (i === 0)              { writer.write("if ("); writeArg(writer, c.condition!); writer.writeLine(")"); }
            else if (c.condition != null) { writer.write("else if ("); writeArg(writer, c.condition); writer.writeLine(")"); }
            else                      { writer.writeLine("else"); }
            writer.pushScope();
            for (const b of c.body) writeArgStatement(writer, b);
            writer.popScope();
            writer.writeNewLineIfLastLineNot();
        }
    }
}

export function ifStatement(condition: AstArg): IfStatement {
    return new IfStatement(condition);
}

// ---------------------------------------------------------------------------
// ThrowStatement
// ---------------------------------------------------------------------------

export class ThrowStatement extends Statement {
    constructor(private readonly expr_: AstArg) { super(); }
    public write(writer: IWriter): void {
        writer.write("throw ");
        writeArg(writer, this.expr_);
        writer.writeStatement();
    }
}

export function throwStatement(expr: AstArg): ThrowStatement {
    return new ThrowStatement(expr);
}

// ---------------------------------------------------------------------------
// Property
//
// property("name", "string").access("public").readonly()
// → public readonly name: string;
// ---------------------------------------------------------------------------

type Access = "public" | "private" | "protected";

export class Property extends AbstractAstNode {
    private access_: Access | undefined;
    private readonly_ = false;
    private optional_ = false;
    private doc_: string | undefined;

    constructor(
        private readonly name_: string,
        private readonly type_: AstArg,
    ) { super(); }

    public access(a: Access): this { this.access_ = a; return this; }
    public readonly(): this { this.readonly_ = true; return this; }
    public optional(): this { this.optional_ = true; return this; }
    public doc(text: string): this { this.doc_ = text; return this; }

    public write(writer: IWriter): void {
        if (this.doc_) {
            writer.writeLine("/**");
            writer.writeLine(` * ${this.doc_}`);
            writer.writeLine(" */");
        }
        if (this.access_) writer.write(`${this.access_} `);
        if (this.readonly_) writer.write("readonly ");
        writer.write(this.name_);
        if (this.optional_) writer.write("?");
        writer.write(": ");
        writeArg(writer, this.type_);
        writer.write(";");
        writer.writeNewLineIfLastLineNot();
    }
}

export function property(name: string, type: AstArg): Property {
    return new Property(name, type);
}

// ---------------------------------------------------------------------------
// Parameter
// ---------------------------------------------------------------------------

export interface ParamDef {
    name: string;
    type: AstArg;
    optional?: boolean;
    default?: AstArg;
}

// ---------------------------------------------------------------------------
// Method
//
// method("getShape").access("public").async().returns("Shape").param(...).body(...).build()
// ---------------------------------------------------------------------------

export class MethodNode extends AbstractAstNode {
    public access_: Access | undefined;
    public async_ = false;
    public static_ = false;
    public abstract_ = false;
    public readonly override_ = false;
    public returns_: AstArg | undefined;
    public readonly params_: ParamDef[] = [];
    public readonly body_: AstArg[] = [];
    public readonly typeParams_: string[] = [];
    public doc_: string | undefined;

    constructor(public readonly name_: string) { super(); }

    public write(writer: IWriter): void {
        if (this.doc_) {
            writer.writeLine("/**");
            writer.writeLine(` * ${this.doc_}`);
            writer.writeLine(" */");
        }
        if (this.access_) writer.write(`${this.access_} `);
        if (this.static_) writer.write("static ");
        if (this.async_) writer.write("async ");
        if (this.abstract_) writer.write("abstract ");

        writer.write(this.name_);
        if (this.typeParams_.length > 0) writer.write(`<${this.typeParams_.join(", ")}>`);
        writer.write("(");
        for (let i = 0; i < this.params_.length; i++) {
            if (i > 0) writer.write(", ");
            const p = this.params_[i]!;
            writer.write(p.name);
            if (p.optional) writer.write("?");
            writer.write(": ");
            writeArg(writer, p.type);
            if (p.default != null) { writer.write(" = "); writeArg(writer, p.default); }
        }
        writer.write(")");
        if (this.returns_ != null) {
            writer.write(": ");
            if (this.async_) { writer.write("Promise<"); writeArg(writer, this.returns_); writer.write(">"); }
            else { writeArg(writer, this.returns_); }
        } else if (this.async_) {
            writer.write(": Promise<void>");
        }

        if (this.abstract_) {
            writer.write(";");
            writer.writeNewLineIfLastLineNot();
        } else {
            writer.write(" ");
            writer.pushScope();
            for (const b of this.body_) writeArgStatement(writer, b);
            writer.popScope();
            writer.writeNewLineIfLastLineNot();
        }
    }
}

export class Method<TState = object> {
    constructor(protected readonly node: MethodNode) {}

    public access(a: Access): this { this.node.access_ = a; return this; }
    public async(): this { this.node.async_ = true; return this; }
    public static(): this { this.node.static_ = true; return this; }
    public abstract(): this { this.node.abstract_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public returns(type: AstArg): this { this.node.returns_ = type; return this; }
    public param(def: ParamDef): this { this.node.params_.push(def); return this; }
    public params(defs: ParamDef[]): this { this.node.params_.push(...defs); return this; }
    public body(...args: AstArg[]): this { this.node.body_.push(...args); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }
    public build(): MethodNode { return this.node; }
}

export function method(name: string): Method {
    return new Method(new MethodNode(name));
}

// ---------------------------------------------------------------------------
// ArrowFunction
//
// arrowFunction().param({ name: "x", type: "number" }).returns("number").body(returnStatement("x * 2")).build()
// → (x: number): number => { return x * 2; }
// ---------------------------------------------------------------------------

export class ArrowFunctionNode extends AbstractAstNode {
    public readonly params_: ParamDef[] = [];
    public returns_: AstArg | undefined;
    public readonly body_: AstArg[] = [];
    public async_ = false;

    public write(writer: IWriter): void {
        if (this.async_) writer.write("async ");
        writer.write("(");
        for (let i = 0; i < this.params_.length; i++) {
            if (i > 0) writer.write(", ");
            const p = this.params_[i]!;
            writer.write(p.name);
            if (p.optional) writer.write("?");
            writer.write(": ");
            writeArg(writer, p.type);
        }
        writer.write(")");
        if (this.returns_ != null) { writer.write(": "); writeArg(writer, this.returns_); }
        writer.write(" => ");
        if (this.body_.length === 1 && !(this.body_[0] instanceof Statement)) {
            writeArg(writer, this.body_[0]!);
        } else {
            writer.pushScope();
            for (const b of this.body_) writeArgStatement(writer, b);
            writer.popScope();
        }
    }
}

export class ArrowFunction {
    constructor(private readonly node: ArrowFunctionNode) {}
    public async(): this { this.node.async_ = true; return this; }
    public param(def: ParamDef): this { this.node.params_.push(def); return this; }
    public params(defs: ParamDef[]): this { this.node.params_.push(...defs); return this; }
    public returns(type: AstArg): this { this.node.returns_ = type; return this; }
    public body(...args: AstArg[]): this { this.node.body_.push(...args); return this; }
    public build(): ArrowFunctionNode { return this.node; }
}

export function arrowFunction(): ArrowFunction {
    return new ArrowFunction(new ArrowFunctionNode());
}

// ---------------------------------------------------------------------------
// TypeAlias
//
// typeAlias("ShapeId", "string")
// → type ShapeId = string;
// ---------------------------------------------------------------------------

export class TypeAliasNode extends AbstractAstNode {
    public exported_ = false;
    public readonly typeParams_: string[] = [];
    public doc_: string | undefined;

    constructor(
        private readonly name_: string,
        private readonly type_: AstArg,
    ) { super(); }

    public write(writer: IWriter): void {
        if (this.doc_) { writer.writeLine("/**"); writer.writeLine(` * ${this.doc_}`); writer.writeLine(" */"); }
        if (this.exported_) writer.write("export ");
        writer.write(`type ${this.name_}`);
        if (this.typeParams_.length > 0) writer.write(`<${this.typeParams_.join(", ")}>`);
        writer.write(" = ");
        writeArg(writer, this.type_);
        writer.write(";");
        writer.writeNewLineIfLastLineNot();
    }
}

export class TypeAlias {
    constructor(private readonly node: TypeAliasNode) {}
    public export(): this { this.node.exported_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }
    public build(): TypeAliasNode { return this.node; }
}

export function typeAlias(name: string, type: AstArg): TypeAlias {
    return new TypeAlias(new TypeAliasNode(name, type));
}

// ---------------------------------------------------------------------------
// TypeDeclaration (class / interface)
// ---------------------------------------------------------------------------

type TsKind = "class" | "interface";

export class TypeDeclarationNode extends AbstractAstNode {
    public access_: Access | undefined;
    public exported_ = false;
    public abstract_ = false;
    public readonly extends_: AstArg[] = [];
    public readonly implements_: AstArg[] = [];
    public readonly typeParams_: string[] = [];
    public readonly members_: AbstractAstNode[] = [];
    public doc_: string | undefined;

    constructor(
        public readonly name_: string,
        public readonly kind_: TsKind,
    ) { super(); }

    public write(writer: IWriter): void {
        if (this.doc_) { writer.writeLine("/**"); writer.writeLine(` * ${this.doc_}`); writer.writeLine(" */"); }
        if (this.exported_) writer.write("export ");
        if (this.abstract_) writer.write("abstract ");
        writer.write(`${this.kind_} ${this.name_}`);
        if (this.typeParams_.length > 0) writer.write(`<${this.typeParams_.join(", ")}>`);
        if (this.extends_.length > 0) {
            writer.write(" extends ");
            for (let i = 0; i < this.extends_.length; i++) {
                if (i > 0) writer.write(", ");
                writeArg(writer, this.extends_[i]!);
            }
        }
        if (this.implements_.length > 0) {
            writer.write(" implements ");
            for (let i = 0; i < this.implements_.length; i++) {
                if (i > 0) writer.write(", ");
                writeArg(writer, this.implements_[i]!);
            }
        }
        writer.write(" ");
        writer.pushScope();
        for (let i = 0; i < this.members_.length; i++) {
            const m = this.members_[i]!;
            const isBlock = m instanceof MethodNode;
            if (i > 0 && isBlock) writer.newLine();
            m.write(writer);
            writer.writeNewLineIfLastLineNot();
        }
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export class TypeDeclaration<TState = object> {
    constructor(protected readonly node: TypeDeclarationNode) {}

    public export(): this { this.node.exported_ = true; return this; }
    public abstract(): this { this.node.abstract_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public extends(...bases: AstArg[]): this { this.node.extends_.push(...bases); return this; }
    public implements(...ifaces: AstArg[]): this { this.node.implements_.push(...ifaces); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }

    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public method(m: MethodNode): this { this.node.members_.push(m); return this; }
    public methods(ms: MethodNode[]): this { this.node.members_.push(...ms); return this; }

    public build(): TypeDeclarationNode { return this.node; }
}

export function tsClass(name: string): TypeDeclaration {
    return new TypeDeclaration(new TypeDeclarationNode(name, "class"));
}

export function tsInterface(name: string): TypeDeclaration {
    return new TypeDeclaration(new TypeDeclarationNode(name, "interface"));
}
