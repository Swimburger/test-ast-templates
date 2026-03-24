// Method builder with phantom-type state machine.
//
// TypeScript's type system guides construction:
//   - .abstract() removes .body() from the return type
//   - .body() removes .abstract() from the return type
//   - .build() is only available after .body() OR .abstract()
//   - .async() changes what .returns() means (wraps in Task<>)
//   - .access() is only callable once
//   - Autocomplete shows only what is valid at each step
//
// Usage:
//
//   method("GetAsync")
//       .access("public")
//       .async()
//       .returns("string")
//       .param({ name: "id", type: "int" })
//       .param({ name: "ct", type: CancellationToken, default: "default" })
//       .body(returnStatement(invoke("FetchAsync").on("_client").arg("id").configureAwait()))
//       .build()

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import { writeArgStatement } from "../core/helpers.js";
import type { IWriter } from "../core/IWriter.js";
import { type Attribute, MethodAttribute, ParamAttribute, ReturnAttribute } from "./attributes.js";
import { ClassReference } from "./ClassReference.js";
import { type XmlDoc, writeXmlDoc } from "./docComment.js";
import { Statement } from "./Statement.js";
import type { CsStatement } from "./slots.js";

const CANCELLATION_TOKEN = new ClassReference({ localName: "CancellationToken", namespace: "System.Threading" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Access = "public" | "private" | "protected" | "internal" | "protected internal";

export interface ParamDef {
    name: string;
    type: AstArg;
    default?: AstArg;
    attributes?: ParamAttribute[];
}

// Phantom state tags — never instantiated, only used as type parameters.
declare const _hasAccess:   unique symbol;
declare const _hasBody:     unique symbol;
declare const _isAbstract:  unique symbol;
declare const _isAsync:     unique symbol;

export type HasAccess  = { readonly [_hasAccess]:  true };
export type HasBody    = { readonly [_hasBody]:    true };
export type IsAbstract = { readonly [_isAbstract]: true };
export type IsAsync    = { readonly [_isAsync]:    true };

// ---------------------------------------------------------------------------
// MethodNode — holds all data, does the actual writing.
// Not exported — callers only see Method<TState>.
// ---------------------------------------------------------------------------

export class MethodNode extends AbstractAstNode {
    public access_: Access | undefined;
    public static_    = false;
    public async_     = false;
    public override_  = false;
    public abstract_  = false;
    public returns_: AstArg | undefined;
    public readonly returnAttributes_: ReturnAttribute[] = [];
    public readonly params_: ParamDef[] = [];
    public readonly body_: CsStatement[] = [];
    public readonly typeParams_: string[] = [];
    public readonly methodAttributes_: MethodAttribute[] = [];
    public doc_: string | XmlDoc | undefined;

    constructor(public readonly name_: string) {
        super();
    }

    public write(writer: IWriter): void {
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);
        // Method-level attributes
        for (const attr of this.methodAttributes_) {
            attr.write(writer);
        }

        // Modifiers
        if (this.access_)   writer.write(`${this.access_} `);
        if (this.static_)   writer.write("static ");
        if (this.async_)    writer.write("async ");
        if (this.override_) writer.write("override ");
        if (this.abstract_) writer.write("abstract ");

        // Return attributes: [return: Attr]
        if (this.returnAttributes_.length > 0) {
            writer.write("[return: ");
            for (let i = 0; i < this.returnAttributes_.length; i++) {
                if (i > 0) writer.write(", ");
                this.returnAttributes_[i]!.writeInline(writer);
            }
            writer.write("] ");
        }

        // Return type
        if (this.returns_ != null) {
            if (this.async_) {
                writer.write("Task<");
                writeArg(writer, this.returns_);
                writer.write(">");
            } else {
                writeArg(writer, this.returns_);
            }
        } else {
            writer.write(this.async_ ? "Task" : "void");
        }

        // Name + type parameters
        writer.write(` ${this.name_}`);
        if (this.typeParams_.length > 0) {
            writer.write(`<${this.typeParams_.join(", ")}>`);
        }

        // Parameters — async methods always get cancellationToken last
        const params = this.async_
            ? [...this.params_, { name: "cancellationToken", type: CANCELLATION_TOKEN, default: "default" }]
            : this.params_;

        writer.write("(");
        for (let i = 0; i < params.length; i++) {
            if (i > 0) writer.write(", ");
            const p = params[i]!;
            if (p.attributes && p.attributes.length > 0) {
                writer.write("[");
                for (let j = 0; j < p.attributes.length; j++) {
                    if (j > 0) writer.write(", ");
                    p.attributes[j]!.writeInline(writer);
                }
                writer.write("] ");
            }
            writeArg(writer, p.type);
            writer.write(` ${p.name}`);
            if (p.default != null) {
                writer.write(" = ");
                writeArg(writer, p.default);
            }
        }
        writer.write(")");

        // Body or abstract semicolon
        if (this.abstract_) {
            writer.write(";");
            writer.writeNewLineIfLastLineNot();
        } else {
            writer.writeNewLineIfLastLineNot();
            writer.pushScope();
            for (const b of this.body_) writeArgStatement(writer, b);
            writer.popScope();
            writer.writeNewLineIfLastLineNot();
        }
    }
}

// ---------------------------------------------------------------------------
// Method<TState> — phantom-type wrapper.
//
// TState accumulates tags as methods are called.
// Conditional types on each method restrict what's available.
// ---------------------------------------------------------------------------

export class Method<TState = object> {
    constructor(protected readonly node: MethodNode) {}

    // -- Modifiers (always available, idempotent) --

    public static<S extends TState>(this: Method<S>): Method<S & IsAsync extends IsAsync ? never : S> {
        this.node.static_ = true;
        return this as any;
    }

    public override<S extends TState>(this: Method<S>): Method<S> {
        this.node.override_ = true;
        return this as any;
    }

    public doc<S extends TState>(this: Method<S>, doc: string | XmlDoc): Method<S> {
        this.node.doc_ = doc;
        return this as any;
    }

    public typeParam<S extends TState>(this: Method<S>, name: string): Method<S> {
        this.node.typeParams_.push(name);
        return this as any;
    }

    // -- access() — only available when HasAccess not yet set --

    public access<S extends TState>(
        this: Method<S & (S extends HasAccess ? never : S)>,
        a: Access,
    ): Method<S & HasAccess> {
        this.node.access_ = a;
        return this as any;
    }

    // -- async() — sets IsAsync, no-op if already set --

    public async<S extends TState>(
        this: Method<S & (S extends IsAsync ? never : S)>,
    ): Method<S & IsAsync> {
        this.node.async_ = true;
        return this as any;
    }

    // -- abstract() — only available when HasBody not yet set --

    public abstract<S extends TState>(
        this: Method<S & (S extends HasBody ? never : S)>,
    ): Method<S & IsAbstract> {
        this.node.abstract_ = true;
        return this as any;
    }

    // -- returns() --

    public returns<S extends TState>(
        this: Method<S>,
        type: AstArg,
        ...attributes: ReturnAttribute[]
    ): Method<S> {
        this.node.returns_ = type;
        this.node.returnAttributes_.push(...attributes);
        return this as any;
    }

    // -- param / params --

    public param<S extends TState>(this: Method<S>, def: ParamDef): Method<S> {
        this.node.params_.push(def);
        return this as any;
    }

    public params<S extends TState>(this: Method<S>, defs: ParamDef[]): Method<S> {
        this.node.params_.push(...defs);
        return this as any;
    }

    // -- attribute / attributes — method-level attributes --

    public attribute<S extends TState>(this: Method<S>, attr: MethodAttribute): Method<S> {
        this.node.methodAttributes_.push(attr);
        return this as any;
    }

    public attributes<S extends TState>(this: Method<S>, attrs: MethodAttribute[]): Method<S> {
        this.node.methodAttributes_.push(...attrs);
        return this as any;
    }

    // -- body() — only available when IsAbstract not yet set --

    public body<S extends TState>(
        this: Method<S & (S extends IsAbstract ? never : S)>,
        ...args: CsStatement[]
    ): Method<S & HasBody> {
        this.node.body_.push(...args);
        return this as any;
    }

    // -- build() — only available after body() OR abstract() --

    public build<S extends TState>(
        this: Method<S & (S extends HasBody | IsAbstract ? S : never)>,
    ): MethodNode {
        return this.node;
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function method(name: string): Method {
    return new Method(new MethodNode(name));
}

// ---------------------------------------------------------------------------
// Constructor
//
// ctor("ShapeClient")
//     .access("public")
//     .param({ name: "client", type: HttpClient })
//     .body(ast`_client = client`)
//     .build()
//
// Generates:
//   public ShapeClient(HttpClient client)
//   {
//       _client = client;
//   }
// ---------------------------------------------------------------------------

export class ConstructorNode extends AbstractAstNode {
    public access_: Access | undefined;
    public readonly params_: ParamDef[] = [];
    public readonly body_: CsStatement[] = [];
    public readonly attributes_: MethodAttribute[] = [];
    public doc_: string | XmlDoc | undefined;

    constructor(public readonly name_: string) {
        super();
    }

    public write(writer: IWriter): void {
        if (this.doc_ != null) writeXmlDoc(writer, this.doc_);
        for (const attr of this.attributes_) attr.write(writer);
        if (this.access_) writer.write(`${this.access_} `);
        writer.write(this.name_);
        writer.write("(");
        for (let i = 0; i < this.params_.length; i++) {
            if (i > 0) writer.write(", ");
            const p = this.params_[i]!;
            if (p.attributes && p.attributes.length > 0) {
                writer.write("[");
                for (let j = 0; j < p.attributes.length; j++) {
                    if (j > 0) writer.write(", ");
                    p.attributes[j]!.writeInline(writer);
                }
                writer.write("] ");
            }
            writeArg(writer, p.type);
            writer.write(` ${p.name}`);
            if (p.default != null) {
                writer.write(" = ");
                writeArg(writer, p.default);
            }
        }
        writer.write(")");
        writer.writeNewLineIfLastLineNot();
        writer.pushScope();
        for (const b of this.body_) writeArgStatement(writer, b);
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export class Constructor<TState = object> {
    constructor(private readonly node: ConstructorNode) {}

    // Always available
    public attribute(attr: MethodAttribute): this { this.node.attributes_.push(attr); return this; }
    public attributes(attrs: MethodAttribute[]): this { this.node.attributes_.push(...attrs); return this; }
    public param(def: ParamDef): this { this.node.params_.push(def); return this; }
    public params(defs: ParamDef[]): this { this.node.params_.push(...defs); return this; }
    public doc(d: string | XmlDoc): this { this.node.doc_ = d; return this; }

    // access() — only callable once
    public access<S extends TState>(
        this: Constructor<S & (S extends HasAccess ? never : S)>,
        a: Access,
    ): Constructor<S & HasAccess> {
        this.node.access_ = a;
        return this as any;
    }

    // body() — accumulates statements, marks HasBody
    public body<S extends TState>(
        this: Constructor<S>,
        ...args: CsStatement[]
    ): Constructor<S & HasBody> {
        this.node.body_.push(...args);
        return this as any;
    }

    // build() — only available after body()
    public build<S extends TState>(
        this: Constructor<S & (S extends HasBody ? S : never)>,
    ): ConstructorNode {
        return this.node;
    }
}

export function ctor(name: string): Constructor {
    return new Constructor(new ConstructorNode(name));
}
