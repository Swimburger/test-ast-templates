// Scoped C# attribute types using phantom branding.
//
// AttributeRef<TTargets> declares which scopes an attribute type supports.
// The scoped factories are constrained to only accept refs that include their scope,
// so misuse is a compile error with zero runtime overhead.
//
//   const Obsolete       = attributeRef<"class" | "method" | "property">("Obsolete", { namespace: "System" });
//   const JsonConverter  = attributeRef<"class">("JsonConverter", { namespace: "System.Text.Json.Serialization" });
//   const HttpGet        = attributeRef<"method">("HttpGet", { namespace: "Microsoft.AspNetCore.Mvc" });
//
//   classAttribute(Obsolete)       // ✅
//   methodAttribute(Obsolete)      // ✅
//   classAttribute(HttpGet)        // ❌ compile error — HttpGet doesn't support "class"
//   methodAttribute(JsonConverter) // ❌ compile error — JsonConverter doesn't support "method"

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { ClassReference } from "./ClassReference.js";

// ---------------------------------------------------------------------------
// AttributeScope + phantom brands
// ---------------------------------------------------------------------------

export type AttributeScope = "assembly" | "class" | "method" | "property" | "return" | "param" | "field" | "event" | "interface" | "struct";

declare const _scope:   unique symbol;
declare const _targets: unique symbol;

// An attribute instance branded with the scope it is being applied to.
export type ScopedAttribute<S extends AttributeScope> = Attribute & { readonly [_scope]: S };

// Convenience aliases used in builder signatures.
export type ClassAttribute    = ScopedAttribute<"class">;
export type MethodAttribute   = ScopedAttribute<"method">;
export type PropertyAttribute = ScopedAttribute<"property">;
export type ReturnAttribute   = ScopedAttribute<"return">;
export type ParamAttribute    = ScopedAttribute<"param">;
export type FieldAttribute    = ScopedAttribute<"field">;

// ---------------------------------------------------------------------------
// AttributeRef<TTargets> — declares which scopes an attribute type supports.
// ---------------------------------------------------------------------------

export type AttributeRef<TTargets extends AttributeScope> = ClassReference & {
    readonly [_targets]: TTargets; // phantom — never present at runtime
};

export function attributeRef<TTargets extends AttributeScope>(
    localName: string,
    opts: { namespace?: string } = {},
): AttributeRef<TTargets> {
    return new ClassReference({ localName, namespace: opts.namespace }) as AttributeRef<TTargets>;
}

// ---------------------------------------------------------------------------
// Attribute — single implementation
// ---------------------------------------------------------------------------

export class Attribute extends AbstractAstNode {
    private readonly args_: AstArg[] = [];

    constructor(protected readonly reference_: AstArg) {
        super();
    }

    public arg(value: AstArg): this {
        this.args_.push(value);
        return this;
    }

    public args(values: AstArg[]): this {
        this.args_.push(...values);
        return this;
    }

    // Writes Name(args) without surrounding [] — used inside param lists and [return: ...].
    public writeInline(writer: IWriter): void {
        writeArg(writer, this.reference_);
        if (this.args_.length > 0) {
            writer.write("(");
            for (let i = 0; i < this.args_.length; i++) {
                if (i > 0) writer.write(", ");
                writeArg(writer, this.args_[i]!);
            }
            writer.write(")");
        }
    }

    // Writes the full [Name(args)]\n form.
    public write(writer: IWriter): void {
        writer.write("[");
        this.writeInline(writer);
        writer.write("]");
        writer.writeNewLineIfLastLineNot();
    }
}

// ---------------------------------------------------------------------------
// Scoped factories — each only accepts an AttributeRef whose TTargets includes
// the relevant scope. Passing the wrong ref is a compile error.
// ---------------------------------------------------------------------------

function scoped<S extends AttributeScope>(ref: AstArg): ScopedAttribute<S> {
    return new Attribute(ref) as ScopedAttribute<S>;
}

export function classAttribute   <R extends AttributeRef<"class">>   (ref: R): ClassAttribute    { return scoped<"class">(ref);    }
export function methodAttribute  <R extends AttributeRef<"method">>  (ref: R): MethodAttribute   { return scoped<"method">(ref);   }
export function propertyAttribute<R extends AttributeRef<"property">>(ref: R): PropertyAttribute { return scoped<"property">(ref); }
export function returnAttribute  <R extends AttributeRef<"return">>  (ref: R): ReturnAttribute   { return scoped<"return">(ref);   }
export function paramAttribute   <R extends AttributeRef<"param">>   (ref: R): ParamAttribute    { return scoped<"param">(ref);    }
export function fieldAttribute   <R extends AttributeRef<"field">>   (ref: R): FieldAttribute    { return scoped<"field">(ref);    }
