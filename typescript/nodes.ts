// TypeScript-specific AST nodes.
//
// Builder pattern mirrors the csharp layer.
// All nodes are typed against IWriter and work with the TypeScript Writer
// which emits ES module import statements.

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, type RawNode, writeArg } from "../core/AstTemplate.js";
import { writeArgStatement, writeDelimited } from "../core/helpers.js";
import type { IWriter } from "../core/IWriter.js";
import { Statement } from "../core/Statement.js";

// ---------------------------------------------------------------------------
// Typed slot aliases
//
// These narrow which node kinds are legal at each structural position.
// AstArg (string | AbstractAstNode | template) always serves as an escape
// hatch for inline expressions and raw code fragments.
// ---------------------------------------------------------------------------

/** Nodes that may appear at the top level of a TypeScript file. */
export type TsFileNode =
    | TypeDeclarationNode
    | TypeAliasNode
    | FunctionDeclarationNode
    | RawNode
    | AstArg;

/** Nodes that may appear as members of a class or interface. */
export type TsMemberNode =
    | Property
    | MethodNode
    | IndexSignatureNode
    | TypeAliasNode
    | TypeDeclarationNode;

/** Nodes that may appear as statements inside a function / method body. */
export type TsStatement =
    | ReturnStatement
    | IfStatement
    | ThrowExpression
    | AwaitExpression
    | AssignStatement
    | NullishCoalesceExpression
    | ConstStatement
    | ForOfStatement
    | TryCatchStatement
    | RawNode
    | AstArg;

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

interface IfClause { condition: AstArg | null; body: TsStatement[]; }

export class IfStatement extends Statement {
    private readonly clauses_: IfClause[] = [];
    private pendingCondition_: AstArg | null = null;

    constructor(condition: AstArg) { super(); this.pendingCondition_ = condition; }

    public then(...body: TsStatement[]): this {
        this.clauses_.push({ condition: this.pendingCondition_, body });
        this.pendingCondition_ = null;
        return this;
    }
    public elseIf(condition: AstArg): this { this.pendingCondition_ = condition; return this; }
    public else(...body: TsStatement[]): this { this.clauses_.push({ condition: null, body }); return this; }

    public write(writer: IWriter): void {
        for (let i = 0; i < this.clauses_.length; i++) {
            const c = this.clauses_[i]!;
            if (i === 0)                  { writer.write("if ("); writeArg(writer, c.condition!); writer.write(")"); }
            else if (c.condition != null) { writer.write("else if ("); writeArg(writer, c.condition); writer.write(")"); }
            else                          { writer.write("else"); }
            writer.pushScopeInline();
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
// ThrowExpression
//
// Valid as a statement (writeArgStatement appends ";") and as an inline
// expression (switch RHS, ?? RHS, ternary) — no extra punctuation.
// ---------------------------------------------------------------------------

export class ThrowExpression extends AbstractAstNode {
    constructor(private readonly expr_: AstArg) { super(); }
    public write(writer: IWriter): void {
        writer.write("throw ");
        writeArg(writer, this.expr_);
    }
}

export function throwExpression(expr: AstArg): ThrowExpression {
    return new ThrowExpression(expr);
}

// ---------------------------------------------------------------------------
// AwaitExpression
// ---------------------------------------------------------------------------

export class AwaitExpression extends AbstractAstNode {
    constructor(private readonly expr_: AstArg) { super(); }
    public write(writer: IWriter): void {
        writer.write("await ");
        writeArg(writer, this.expr_);
    }
}

export function awaitExpression(expr: AstArg): AwaitExpression {
    return new AwaitExpression(expr);
}

// ---------------------------------------------------------------------------
// AssignStatement — lhs = rhs;
// ---------------------------------------------------------------------------

export class AssignStatement extends Statement {
    constructor(private readonly lhs_: AstArg, private readonly rhs_: AstArg) { super(); }
    public write(writer: IWriter): void {
        writeArg(writer, this.lhs_);
        writer.write(" = ");
        writeArg(writer, this.rhs_);
        writer.writeStatement();
    }
}

export function assignStatement(lhs: AstArg, rhs: AstArg): AssignStatement {
    return new AssignStatement(lhs, rhs);
}

// ---------------------------------------------------------------------------
// NullishCoalesceExpression — lhs ?? rhs
// ---------------------------------------------------------------------------

export class NullishCoalesceExpression extends AbstractAstNode {
    constructor(private readonly lhs_: AstArg, private readonly rhs_: AstArg) { super(); }
    public write(writer: IWriter): void {
        writeArg(writer, this.lhs_);
        writer.write(" ?? ");
        writeArg(writer, this.rhs_);
    }
}

export function nullishCoalesce(lhs: AstArg, rhs: AstArg): NullishCoalesceExpression {
    return new NullishCoalesceExpression(lhs, rhs);
}

// ---------------------------------------------------------------------------
// ConstStatement — const name = value;  /  let name = value;
// ---------------------------------------------------------------------------

export class ConstStatement extends Statement {
    private kind_: "const" | "let" = "const";
    private type_: AstArg | undefined;
    constructor(private readonly name_: string, private readonly value_: AstArg) { super(); }
    public let(): this { this.kind_ = "let"; return this; }
    public type(t: AstArg): this { this.type_ = t; return this; }
    public write(writer: IWriter): void {
        writer.write(`${this.kind_} ${this.name_}`);
        if (this.type_ != null) { writer.write(": "); writeArg(writer, this.type_); }
        writer.write(" = ");
        writeArg(writer, this.value_);
        writer.writeStatement();
    }
}

export function constStatement(name: string, value: AstArg): ConstStatement {
    return new ConstStatement(name, value);
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
    private initialValue_: AstArg | undefined;

    constructor(
        private readonly name_: string,
        private readonly type_: AstArg,
    ) { super(); }

    public access(a: Access): this { this.access_ = a; return this; }
    public readonly(): this { this.readonly_ = true; return this; }
    public optional(): this { this.optional_ = true; return this; }
    public doc(text: string): this { this.doc_ = text; return this; }
    public initialValue(v: AstArg): this { this.initialValue_ = v; return this; }

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
        if (this.initialValue_ != null) { writer.write(" = "); writeArg(writer, this.initialValue_); }
        writer.writeStatement();
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
    public override_ = false;
    public returns_: AstArg | undefined;
    public readonly params_: ParamDef[] = [];
    public readonly body_: TsStatement[] = [];
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
        if (this.override_) writer.write("override ");

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
            writer.writeStatement();
        } else {
            writer.pushScopeInline();
            for (const b of this.body_) writeArgStatement(writer, b);
            writer.popScope();
            writer.writeNewLineIfLastLineNot();
        }
    }
}

// Phantom state tags — never instantiated, only used as type parameters.
declare const _tsHasBody:    unique symbol;
declare const _tsIsAbstract: unique symbol;

export type TsHasBody    = { readonly [_tsHasBody]:    true };
export type TsIsAbstract = { readonly [_tsIsAbstract]: true };

export class Method<TState = object> {
    constructor(protected readonly node: MethodNode) {}

    // Always available
    public access(a: Access): this { this.node.access_ = a; return this; }
    public async(): this { this.node.async_ = true; return this; }
    public static(): this { this.node.static_ = true; return this; }
    public override(): this { this.node.override_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public returns(type: AstArg): this { this.node.returns_ = type; return this; }
    public param(def: ParamDef): this { this.node.params_.push(def); return this; }
    public params(defs: ParamDef[]): this { this.node.params_.push(...defs); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }

    // abstract() — only available when body() has not been called
    public abstract<S extends TState>(
        this: Method<S & (S extends TsHasBody ? never : S)>,
    ): Method<S & TsIsAbstract> {
        this.node.abstract_ = true;
        return this as any;
    }

    // body() — only available when abstract() has not been called
    public body<S extends TState>(
        this: Method<S & (S extends TsIsAbstract ? never : S)>,
        ...args: TsStatement[]
    ): Method<S & TsHasBody> {
        this.node.body_.push(...args);
        return this as any;
    }

    // build() — only available after body() OR abstract()
    public build<S extends TState>(
        this: Method<S & (S extends TsHasBody | TsIsAbstract ? S : never)>,
    ): MethodNode {
        return this.node;
    }
}

export function method(name: string): Method {
    return new Method(new MethodNode(name));
}

export function ctor(): Method {
    return new Method(new MethodNode("constructor"));
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
    public readonly body_: TsStatement[] = [];
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
            writer.pushScopeInline();
            for (const b of this.body_) writeArgStatement(writer, b);
            writer.popScope();
        }
    }
}

export class ArrowFunction<TState = object> {
    constructor(private readonly node: ArrowFunctionNode) {}

    // Always available
    public async(): this { this.node.async_ = true; return this; }
    public param(def: ParamDef): this { this.node.params_.push(def); return this; }
    public params(defs: ParamDef[]): this { this.node.params_.push(...defs); return this; }
    public returns(type: AstArg): this { this.node.returns_ = type; return this; }

    // body() — marks HasBody
    public body<S extends TState>(
        this: ArrowFunction<S>,
        ...args: TsStatement[]
    ): ArrowFunction<S & TsHasBody> {
        this.node.body_.push(...args);
        return this as any;
    }

    // build() — only available after body()
    public build<S extends TState>(
        this: ArrowFunction<S & (S extends TsHasBody ? S : never)>,
    ): ArrowFunctionNode {
        return this.node;
    }
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
        writer.writeStatement();
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
    public readonly members_: TsMemberNode[] = [];
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
        writer.pushScopeInline();
        for (let i = 0; i < this.members_.length; i++) {
            const m = this.members_[i]!;
            const isBlock = m instanceof MethodNode || m instanceof TypeDeclarationNode;
            if (i > 0 && isBlock) writer.newLine();
            m.write(writer);
            writer.writeNewLineIfLastLineNot();
        }
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

// ---------------------------------------------------------------------------
// TsClassDeclaration — builder for `class` declarations
//
// Has: abstract, extends (single), implements (multiple), all member types
// ---------------------------------------------------------------------------

export class TsClassDeclaration {
    constructor(protected readonly node: TypeDeclarationNode) {}

    public export(): this { this.node.exported_ = true; return this; }
    public abstract(): this { this.node.abstract_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public extends(base: AstArg): this { this.node.extends_.push(base); return this; }
    public implements(...ifaces: AstArg[]): this { this.node.implements_.push(...ifaces); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }

    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public ctor(m: MethodNode): this { this.node.members_.push(m); return this; }
    public method(m: MethodNode): this { this.node.members_.push(m); return this; }
    public methods(ms: MethodNode[]): this { this.node.members_.push(...ms); return this; }
    public nestedClass(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public nestedInterface(t: TypeDeclarationNode): this { this.node.members_.push(t); return this; }
    public indexSignature(i: IndexSignatureNode): this { this.node.members_.push(i); return this; }

    public build(): TypeDeclarationNode { return this.node; }
}

// ---------------------------------------------------------------------------
// TsInterfaceDeclaration — builder for `interface` declarations
//
// No: abstract, implements (interfaces use extends), nested classes
// Members: property, method signatures, index signatures, type aliases only
// ---------------------------------------------------------------------------

export class TsInterfaceDeclaration {
    constructor(protected readonly node: TypeDeclarationNode) {}

    public export(): this { this.node.exported_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public extends(...bases: AstArg[]): this { this.node.extends_.push(...bases); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }

    public property(p: Property): this { this.node.members_.push(p); return this; }
    public properties(ps: Property[]): this { this.node.members_.push(...ps); return this; }
    public method(m: MethodNode): this { this.node.members_.push(m); return this; }
    public methods(ms: MethodNode[]): this { this.node.members_.push(...ms); return this; }
    public typeAlias(t: TypeAliasNode): this { this.node.members_.push(t); return this; }
    public indexSignature(i: IndexSignatureNode): this { this.node.members_.push(i); return this; }

    public build(): TypeDeclarationNode { return this.node; }
}

export function tsClass(name: string): TsClassDeclaration {
    return new TsClassDeclaration(new TypeDeclarationNode(name, "class"));
}

export function tsInterface(name: string): TsInterfaceDeclaration {
    return new TsInterfaceDeclaration(new TypeDeclarationNode(name, "interface"));
}

// ---------------------------------------------------------------------------
// Literal — "string" | number | boolean | null | undefined
// ---------------------------------------------------------------------------

export class Literal extends AbstractAstNode {
    constructor(private readonly value_: string | number | boolean | null | undefined) { super(); }
    public write(writer: IWriter): void {
        if (this.value_ === null)            writer.write("null");
        else if (this.value_ === undefined)  writer.write("undefined");
        else if (typeof this.value_ === "string") writer.write(JSON.stringify(this.value_));
        else                                 writer.write(String(this.value_));
    }
}

export function literal(value: string | number | boolean | null | undefined): Literal {
    return new Literal(value);
}

// ---------------------------------------------------------------------------
// UnionType — A | B | C
// IntersectionType — A & B & C
// ---------------------------------------------------------------------------

export class UnionType extends AbstractAstNode {
    private readonly members_: AstArg[];
    constructor(...members: AstArg[]) { super(); this.members_ = members; }
    public write(writer: IWriter): void { writeDelimited(writer, this.members_, " | "); }
}

export class IntersectionType extends AbstractAstNode {
    private readonly members_: AstArg[];
    constructor(...members: AstArg[]) { super(); this.members_ = members; }
    public write(writer: IWriter): void { writeDelimited(writer, this.members_, " & "); }
}

export function unionType(...members: AstArg[]): UnionType { return new UnionType(...members); }
export function intersectionType(...members: AstArg[]): IntersectionType { return new IntersectionType(...members); }

// ---------------------------------------------------------------------------
// NewExpression — new Type(args)
// ---------------------------------------------------------------------------

export class NewExpression extends AbstractAstNode {
    private readonly args_: AstArg[] = [];

    constructor(private readonly type_: AstArg) { super(); }

    public arg(a: AstArg): this { this.args_.push(a); return this; }
    public args(as: AstArg[]): this { this.args_.push(...as); return this; }

    public write(writer: IWriter): void {
        writer.write("new ");
        writeArg(writer, this.type_);
        writer.write("(");
        writeDelimited(writer, this.args_);
        writer.write(")");
    }
}

export function newExpression(type: AstArg): NewExpression {
    return new NewExpression(type);
}

// ---------------------------------------------------------------------------
// ObjectExpression — { key: value, ... }
// Multi-line when entries > 1, inline when 0 or 1.
// ---------------------------------------------------------------------------

export class ObjectExpression extends AbstractAstNode {
    private readonly entries_: { key: string; value: AstArg }[] = [];

    public set(key: string, value: AstArg): this;
    public set(entries: Record<string, AstArg>): this;
    public set(keyOrEntries: string | Record<string, AstArg>, value?: AstArg): this {
        if (typeof keyOrEntries === "string") {
            this.entries_.push({ key: keyOrEntries, value: value! });
        } else {
            for (const [k, v] of Object.entries(keyOrEntries)) this.entries_.push({ key: k, value: v });
        }
        return this;
    }

    public write(writer: IWriter): void {
        if (this.entries_.length === 0) {
            writer.write("{}");
            return;
        }
        const writeEntry = (e: { key: string; value: AstArg }) => {
            if (typeof e.value === "string" && e.value === e.key) {
                writer.write(e.key); // shorthand
            } else {
                writer.write(e.key);
                writer.write(": ");
                writeArg(writer, e.value);
            }
        };
        if (this.entries_.length === 1) {
            writer.write("{ ");
            writeEntry(this.entries_[0]!);
            writer.write(" }");
            return;
        }
        writer.write("{");
        writer.newLine();
        writer.indent();
        for (let i = 0; i < this.entries_.length; i++) {
            writeEntry(this.entries_[i]!);
            writer.write(",");
            writer.newLine();
        }
        writer.dedent();
        writer.write("}");
    }
}

export function objectExpression(entries?: Record<string, AstArg>): ObjectExpression {
    const node = new ObjectExpression();
    if (entries) node.set(entries);
    return node;
}

// ---------------------------------------------------------------------------
// ArrayExpression — [a, b, c]
// ---------------------------------------------------------------------------

export class ArrayExpression extends AbstractAstNode {
    private readonly items_: AstArg[] = [];

    public item(a: AstArg): this { this.items_.push(a); return this; }
    public items(as: AstArg[]): this { this.items_.push(...as); return this; }

    public write(writer: IWriter): void {
        writer.write("[");
        writeDelimited(writer, this.items_);
        writer.write("]");
    }
}

export function arrayExpression(items?: AstArg[]): ArrayExpression {
    const node = new ArrayExpression();
    if (items) node.items(items);
    return node;
}

// ---------------------------------------------------------------------------
// TernaryExpression — condition ? then : else
// ---------------------------------------------------------------------------

export class TernaryExpression extends AbstractAstNode {
    constructor(
        private readonly condition_: AstArg,
        private readonly then_: AstArg,
        private readonly else_: AstArg,
    ) { super(); }

    public write(writer: IWriter): void {
        writeArg(writer, this.condition_);
        writer.write(" ? ");
        writeArg(writer, this.then_);
        writer.write(" : ");
        writeArg(writer, this.else_);
    }
}

export function ternaryExpression(condition: AstArg, then: AstArg, else_: AstArg): TernaryExpression {
    return new TernaryExpression(condition, then, else_);
}

// ---------------------------------------------------------------------------
// TypeRef — Type<A, B>  /  Type<A, B> | null
// ---------------------------------------------------------------------------

export class TypeRefNode extends AbstractAstNode {
    public readonly generics_: AstArg[] = [];
    public nullable_ = false;

    constructor(private readonly base_: AstArg) { super(); }

    public generic(type: AstArg): this { this.generics_.push(type); return this; }
    public nullable(): this { this.nullable_ = true; return this; }

    public write(writer: IWriter): void {
        writeArg(writer, this.base_);
        if (this.generics_.length > 0) {
            writer.write("<");
            writeDelimited(writer, this.generics_);
            writer.write(">");
        }
        if (this.nullable_) writer.write(" | null");
    }
}

export class TypeRef {
    constructor(private readonly node: TypeRefNode) {}
    public generic(type: AstArg): this { this.node.generics_.push(type); return this; }
    public nullable(): this { this.node.nullable_ = true; return this; }
    public build(): TypeRefNode { return this.node; }
}

export function typeRef(base: AstArg): TypeRef {
    return new TypeRef(new TypeRefNode(base));
}

// ---------------------------------------------------------------------------
// FunctionDeclaration — export function foo<T>(params): ReturnType { body }
// ---------------------------------------------------------------------------

export class FunctionDeclarationNode extends AbstractAstNode {
    public exported_ = false;
    public async_ = false;
    public returns_: AstArg | undefined;
    public readonly params_: ParamDef[] = [];
    public readonly body_: TsStatement[] = [];
    public readonly typeParams_: string[] = [];
    public doc_: string | undefined;

    constructor(public readonly name_: string) { super(); }

    public write(writer: IWriter): void {
        if (this.doc_) {
            writer.writeLine("/**");
            writer.writeLine(` * ${this.doc_}`);
            writer.writeLine(" */");
        }
        if (this.exported_) writer.write("export ");
        if (this.async_) writer.write("async ");
        writer.write(`function ${this.name_}`);
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
        writer.pushScopeInline();
        for (const b of this.body_) writeArgStatement(writer, b);
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export class FunctionDeclaration<TState = object> {
    constructor(private readonly node: FunctionDeclarationNode) {}

    // Always available
    public export(): this { this.node.exported_ = true; return this; }
    public async(): this { this.node.async_ = true; return this; }
    public typeParam(name: string): this { this.node.typeParams_.push(name); return this; }
    public returns(type: AstArg): this { this.node.returns_ = type; return this; }
    public param(def: ParamDef): this { this.node.params_.push(def); return this; }
    public params(defs: ParamDef[]): this { this.node.params_.push(...defs); return this; }
    public doc(text: string): this { this.node.doc_ = text; return this; }

    // body() — marks HasBody
    public body<S extends TState>(
        this: FunctionDeclaration<S>,
        ...args: TsStatement[]
    ): FunctionDeclaration<S & TsHasBody> {
        this.node.body_.push(...args);
        return this as any;
    }

    // build() — only available after body()
    public build<S extends TState>(
        this: FunctionDeclaration<S & (S extends TsHasBody ? S : never)>,
    ): FunctionDeclarationNode {
        return this.node;
    }
}

export function functionDeclaration(name: string): FunctionDeclaration {
    return new FunctionDeclaration(new FunctionDeclarationNode(name));
}

// ---------------------------------------------------------------------------
// ForOfStatement — for (const item of iterable) { body }
// ---------------------------------------------------------------------------

export class ForOfStatement extends Statement {
    private readonly body_: TsStatement[] = [];
    private kind_: "const" | "let" = "const";

    constructor(
        private readonly variable_: string,
        private readonly iterable_: AstArg,
    ) { super(); }

    public let(): this { this.kind_ = "let"; return this; }
    public body(...args: TsStatement[]): this { this.body_.push(...args); return this; }

    public write(writer: IWriter): void {
        writer.write(`for (${this.kind_} ${this.variable_} of `);
        writeArg(writer, this.iterable_);
        writer.write(")");
        writer.pushScopeInline();
        for (const b of this.body_) writeArgStatement(writer, b);
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export function forOf(variable: string, iterable: AstArg): ForOfStatement {
    return new ForOfStatement(variable, iterable);
}

// ---------------------------------------------------------------------------
// TryCatchStatement — try { } catch (e) { } finally { }
// ---------------------------------------------------------------------------

export class TryCatchStatement extends Statement {
    private readonly tryBody_: TsStatement[] = [];
    private catchVar_: string | undefined;
    private readonly catchBody_: TsStatement[] = [];
    private readonly finallyBody_: TsStatement[] = [];

    public try(...args: TsStatement[]): this { this.tryBody_.push(...args); return this; }
    public catch(variable: string, ...body: TsStatement[]): this {
        this.catchVar_ = variable;
        this.catchBody_.push(...body);
        return this;
    }
    public finally(...args: TsStatement[]): this { this.finallyBody_.push(...args); return this; }

    public write(writer: IWriter): void {
        writer.write("try");
        writer.pushScopeInline();
        for (const b of this.tryBody_) writeArgStatement(writer, b);
        writer.popScope();
        if (this.catchVar_ != null) {
            writer.write(` catch (${this.catchVar_})`);
            writer.pushScopeInline();
            for (const b of this.catchBody_) writeArgStatement(writer, b);
            writer.popScope();
        }
        if (this.finallyBody_.length > 0) {
            writer.write(" finally");
            writer.pushScopeInline();
            for (const b of this.finallyBody_) writeArgStatement(writer, b);
            writer.popScope();
        }
        writer.writeNewLineIfLastLineNot();
    }
}

export function tryCatch(): TryCatchStatement {
    return new TryCatchStatement();
}

// ---------------------------------------------------------------------------
// IndexSignature — [key: string]: ValueType
// ---------------------------------------------------------------------------

export class IndexSignatureNode extends AbstractAstNode {
    constructor(
        private readonly keyName_: string,
        private readonly keyType_: AstArg,
        private readonly valueType_: AstArg,
    ) { super(); }

    public write(writer: IWriter): void {
        writer.write("[");
        writer.write(this.keyName_);
        writer.write(": ");
        writeArg(writer, this.keyType_);
        writer.write("]: ");
        writeArg(writer, this.valueType_);
        writer.writeStatement();
    }
}

export function indexSignature(keyName: string, keyType: AstArg, valueType: AstArg): IndexSignatureNode {
    return new IndexSignatureNode(keyName, keyType, valueType);
}
