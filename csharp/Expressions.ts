// C# expression and statement builders.
//
//   csharp.await(expr)                       → await expr
//   csharp.await(expr).configureAwait()      → await expr.ConfigureAwait(false)
//   csharp.throw(expr)                       → throw expr;
//   csharp.assign("_client", "client")       → _client = client;
//   csharp.nullCoalesce(left, right)         → left ?? right

import { AbstractAstNode } from "../core/AbstractAstNode.js";
import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { Statement } from "./Statement.js";

// ---------------------------------------------------------------------------
// AwaitExpression — await <expr> [.ConfigureAwait(false)]
// Not a Statement — usable inline as an expression.
// ---------------------------------------------------------------------------

export class AwaitExpression extends AbstractAstNode {
    private configureAwait_ = false;

    constructor(private readonly expr_: AstArg) {
        super();
    }

    public configureAwait(): this {
        this.configureAwait_ = true;
        return this;
    }

    public write(writer: IWriter): void {
        writer.write("await ");
        writeArg(writer, this.expr_);
        if (this.configureAwait_) writer.write(".ConfigureAwait(false)");
    }
}

export function awaitExpr(expr: AstArg): AwaitExpression {
    return new AwaitExpression(expr);
}

// ---------------------------------------------------------------------------
// ThrowExpression — throw <expr>
//
// Valid as both a statement (writeArgStatement appends ";") and an inline
// expression (switch arms, ?? RHS, ternaries — no extra punctuation added).
// Extends AbstractAstNode rather than Statement so the body writer treats it
// like a plain expression and appends the semicolon itself.
// ---------------------------------------------------------------------------

export class ThrowExpression extends AbstractAstNode {
    constructor(private readonly expr_: AstArg) {
        super();
    }

    public write(writer: IWriter): void {
        writer.write("throw ");
        writeArg(writer, this.expr_);
    }
}

export function throwExpr(expr: AstArg): ThrowExpression {
    return new ThrowExpression(expr);
}

// ---------------------------------------------------------------------------
// AssignStatement — <lhs> = <rhs>;
// ---------------------------------------------------------------------------

export class AssignStatement extends Statement {
    constructor(
        private readonly lhs_: AstArg,
        private readonly rhs_: AstArg,
    ) {
        super();
    }

    public write(writer: IWriter): void {
        writeArg(writer, this.lhs_);
        writer.write(" = ");
        writeArg(writer, this.rhs_);
        writer.writeStatement();
    }
}

export function assign(lhs: AstArg, rhs: AstArg): AssignStatement {
    return new AssignStatement(lhs, rhs);
}

// ---------------------------------------------------------------------------
// NullCoalesceExpression — <lhs> ?? <rhs>
// Not a Statement — usable inline as an expression.
// ---------------------------------------------------------------------------

export class NullCoalesceExpression extends AbstractAstNode {
    constructor(
        private readonly lhs_: AstArg,
        private readonly rhs_: AstArg,
    ) {
        super();
    }

    public write(writer: IWriter): void {
        writeArg(writer, this.lhs_);
        writer.write(" ?? ");
        writeArg(writer, this.rhs_);
    }
}

export function nullCoalesce(lhs: AstArg, rhs: AstArg): NullCoalesceExpression {
    return new NullCoalesceExpression(lhs, rhs);
}
