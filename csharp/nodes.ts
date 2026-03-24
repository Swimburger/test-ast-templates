// Higher-level C# AST nodes built on top of the core layer.
//
// Builder pattern: each node is constructed incrementally via chained methods.
// The call site structure mirrors the output structure.

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { Statement } from "./Statement.js";
import { writeArgStatement, writeDelimited } from "./helpers.js";
import type { CsStatement } from "./slots.js";

export { Statement } from "./Statement.js";
export { Attribute, ClassAttribute, MethodAttribute, PropertyAttribute, ReturnAttribute, ParamAttribute,
         classAttribute, methodAttribute, propertyAttribute, returnAttribute, paramAttribute } from "./attributes.js";
export { Method, method, Constructor, ctor, type Access, type ParamDef } from "./Method.js";
export { TypeDeclarationNode, record, csClass, csInterface, struct, recordStruct, type PrimaryCtorParam, type ClassDeclaration, type RecordDeclaration, type InterfaceDeclaration, type StructDeclaration } from "./TypeDeclaration.js";
export { Property, property } from "./Property.js";
export { Field, field, FieldNode, Constant, constant, ConstantNode } from "./Field.js";

// ---------------------------------------------------------------------------
// IfStatement
//
// ifStatement("x == null")
//     .then(ast`throw new ${Exception}(nameof(x))`)
//     .elseIf("x < 0")
//     .then(returnStatement("x"))
//     .else(returnStatement("-1"))
//
// Generates:
//   if (x == null)
//   {
//       throw new Exception(nameof(x));
//   }
//   else if (x < 0)
//   {
//       return x;
//   }
//   else
//   {
//       return -1;
//   }
// ---------------------------------------------------------------------------

interface IfClause {
    condition: AstArg | null; // null = else
    body: CsStatement[];
}

export class IfStatement extends Statement {
    private readonly clauses: IfClause[] = [];
    private pendingCondition: AstArg | null = null;

    constructor(condition: AstArg) {
        super();
        this.pendingCondition = condition;
    }

    public then(...body: CsStatement[]): this {
        this.clauses.push({ condition: this.pendingCondition, body });
        this.pendingCondition = null;
        return this;
    }

    public elseIf(condition: AstArg): this {
        this.pendingCondition = condition;
        return this;
    }

    public else(...body: CsStatement[]): this {
        this.clauses.push({ condition: null, body });
        return this;
    }

    public write(writer: IWriter): void {
        for (let i = 0; i < this.clauses.length; i++) {
            const clause = this.clauses[i]!;
            if (i === 0) {
                writer.write("if (");
                writeArg(writer, clause.condition!);
                writer.writeLine(")");
            } else if (clause.condition != null) {
                writer.write("else if (");
                writeArg(writer, clause.condition);
                writer.writeLine(")");
            } else {
                writer.writeLine("else");
            }
            writer.pushScope();
            for (const b of clause.body) writeArgStatement(writer, b);
            writer.popScope();
            writer.writeNewLineIfLastLineNot();
        }
    }
}

export function ifStatement(condition: AstArg): IfStatement {
    return new IfStatement(condition);
}

// ---------------------------------------------------------------------------
// MethodInvocation
//
// invoke("SerializeToNode")
//     .on("JsonSerializer")
//     .generic("T")
//     .arg("value")
//     .configureAwait()
//
// Generates:
//   await JsonSerializer.SerializeToNode<T>(value).ConfigureAwait(false)
// ---------------------------------------------------------------------------

export class MethodInvocation extends AbstractAstNode {
    private on_: AstArg | undefined;
    private readonly generics_: AstArg[] = [];
    private readonly args_: AstArg[] = [];
    private await_ = false;
    private configureAwait_ = false;

    constructor(private readonly method_: string) {
        super();
    }

    public on(target: AstArg): this { this.on_ = target; return this; }
    public generic(type: AstArg): this { this.generics_.push(type); return this; }
    public arg(value: AstArg): this { this.args_.push(value); return this; }
    public args(values: AstArg[]): this { this.args_.push(...values); return this; }
    public await(): this { this.await_ = true; return this; }
    public configureAwait(): this { this.await_ = true; this.configureAwait_ = true; return this; }

    public write(writer: IWriter): void {
        if (this.await_) writer.write("await ");
        if (this.on_ != null) {
            writeArg(writer, this.on_);
            writer.write(".");
        }
        writer.write(this.method_);
        if (this.generics_.length > 0) {
            writer.write("<");
            writeDelimited(writer, this.generics_);
            writer.write(">");
        }
        writer.write("(");
        writeDelimited(writer, this.args_);
        writer.write(")");
        if (this.configureAwait_) writer.write(".ConfigureAwait(false)");
    }
}

export function invoke(method: string): MethodInvocation {
    return new MethodInvocation(method);
}

// ---------------------------------------------------------------------------
// ObjectInstantiation
//
// instantiate("MyClass").set("Id", "value.Id").set("Name", "value.Name")
//   → new MyClass { Id = value.Id, Name = value.Name }
//
// instantiate("MyClass").arg("value.Id").arg("value.Name")
//   → new MyClass(value.Id, value.Name)
// ---------------------------------------------------------------------------

export class ObjectInstantiation extends AbstractAstNode {
    private readonly namedArgs_: { name: string; value: AstArg }[] = [];
    private readonly positionalArgs_: AstArg[] = [];

    constructor(private readonly type_: AstArg) {
        super();
    }

    public set(name: string, value: AstArg): this {
        this.namedArgs_.push({ name, value });
        return this;
    }

    public arg(value: AstArg): this {
        this.positionalArgs_.push(value);
        return this;
    }

    public args(values: AstArg[]): this {
        this.positionalArgs_.push(...values);
        return this;
    }

    public write(writer: IWriter): void {
        writer.write("new ");
        writeArg(writer, this.type_);
        if (this.namedArgs_.length > 0) {
            writer.write(" { ");
            for (let i = 0; i < this.namedArgs_.length; i++) {
                if (i > 0) writer.write(", ");
                const { name, value } = this.namedArgs_[i]!;
                writer.write(`${name} = `);
                writeArg(writer, value);
            }
            writer.write(" }");
        } else {
            writer.write("(");
            writeDelimited(writer, this.positionalArgs_);
            writer.write(")");
        }
    }
}

export function instantiate(type: AstArg): ObjectInstantiation {
    return new ObjectInstantiation(type);
}

// ---------------------------------------------------------------------------
// ForEach
//
// forEach("property", "basePropertiesJson.AsObject()")
//     .body("json[property.Key] = property.Value")
//
// Generates:
//   foreach (var property in basePropertiesJson.AsObject())
//   {
//       json[property.Key] = property.Value;
//   }
// ---------------------------------------------------------------------------

export class ForEach extends Statement {
    private readonly body_: CsStatement[] = [];

    constructor(
        private readonly variable_: string,
        private readonly collection_: AstArg,
    ) {
        super();
    }

    public body(...args: CsStatement[]): this {
        this.body_.push(...args);
        return this;
    }

    public write(writer: IWriter): void {
        writer.write(`foreach (var ${this.variable_} in `);
        writeArg(writer, this.collection_);
        writer.writeLine(")");
        writer.pushScope();
        for (const b of this.body_) writeArgStatement(writer, b);
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export function forEach(variable: string, collection: AstArg): ForEach {
    return new ForEach(variable, collection);
}

// ---------------------------------------------------------------------------
// SwitchExpression
//
// switchExpression(discriminant.name)
//     .arms(unionTypes.map(type => ({
//         pattern: `"${type.wireValue}"`,
//         body: ast`on${type.pascalCase}(As${type.pascalCase}())`,
//     })))
//     .default(ast`onUnknown_(${discriminant.name}, ${value.name})`)
//
// Generates:
//   Type switch
//   {
//       "circle" => onCircle(AsCircle()),
//       _ => onUnknown_(Type, Value)
//   }
// ---------------------------------------------------------------------------

interface SwitchArm {
    pattern: AstArg;
    body: AstArg;
}

export class SwitchExpression extends AbstractAstNode {
    private readonly arms_: SwitchArm[] = [];
    private defaultArm_: AstArg | undefined;

    constructor(private readonly on: AstArg) {
        super();
    }

    public arm(pattern: AstArg, body: AstArg): this {
        this.arms_.push({ pattern, body });
        return this;
    }

    public arms(arms: SwitchArm[]): this {
        this.arms_.push(...arms);
        return this;
    }

    public default(body: AstArg): this {
        this.defaultArm_ = body;
        return this;
    }

    public write(writer: IWriter): void {
        writeArg(writer, this.on);
        writer.writeLine(" switch");
        writer.pushScope();
        for (const arm of this.arms_) {
            writeArg(writer, arm.pattern);
            writer.write(" => ");
            writeArg(writer, arm.body);
            writer.writeLine(",");
        }
        if (this.defaultArm_ != null) {
            writer.write("_ => ");
            writeArg(writer, this.defaultArm_);
        }
        writer.popScope();
    }
}

export function switchExpression(on: AstArg): SwitchExpression {
    return new SwitchExpression(on);
}

// ---------------------------------------------------------------------------
// SwitchStatement
//
// switchStatement(discriminant.name)
//     .cases(unionTypes.map(type => ({
//         value: type.wireValue,
//         body: ast`on${type.pascalCase}(As${type.pascalCase}())`,
//     })))
//     .default(ast`onUnknown_(${discriminant.name}, ${value.name})`)
//
// Generates:
//   switch (Type)
//   {
//       case "circle":
//           onCircle(AsCircle());
//           break;
//       default:
//           onUnknown_(Type, Value);
//           break;
//   }
// ---------------------------------------------------------------------------

interface SwitchCase {
    value: string;
    body: AstArg;
}

export class SwitchStatement extends Statement {
    private readonly cases_: SwitchCase[] = [];
    private defaultBody_: AstArg | undefined;

    constructor(private readonly on: AstArg) {
        super();
    }

    public case(value: string, body: AstArg): this {
        this.cases_.push({ value, body });
        return this;
    }

    public cases(cases: SwitchCase[]): this {
        this.cases_.push(...cases);
        return this;
    }

    public default(body: AstArg): this {
        this.defaultBody_ = body;
        return this;
    }

    public write(writer: IWriter): void {
        writer.write("switch (");
        writeArg(writer, this.on);
        writer.writeLine(")");
        writer.pushScope();
        for (const c of this.cases_) {
            writer.writeLine(`case "${c.value}":`);
            writer.indent();
            writeArg(writer, c.body);
            writer.write(";");
            writer.newLine();
            writer.writeStatement("break");
            writer.dedent();
        }
        if (this.defaultBody_ != null) {
            writer.writeLine("default:");
            writer.indent();
            writeArg(writer, this.defaultBody_);
            writer.write(";");
            writer.newLine();
            writer.writeStatement("break");
            writer.dedent();
        }
        writer.popScope();
        writer.writeNewLineIfLastLineNot();
    }
}

export function switchStatement(on: AstArg): SwitchStatement {
    return new SwitchStatement(on);
}

// ---------------------------------------------------------------------------
// ReturnStatement
// ---------------------------------------------------------------------------

export class ReturnStatement extends Statement {
    constructor(private readonly value: AstArg) { super(); }
    public write(writer: IWriter): void {
        writer.write("return ");
        writeArg(writer, this.value);
        writer.writeStatement();
    }
}

export function returnStatement(value: AstArg): ReturnStatement {
    return new ReturnStatement(value);
}
