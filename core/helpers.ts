import { AbstractAstNode } from "./AbstractAstNode.js";
import { type AstArg, writeArg } from "./AstTemplate.js";
import type { IWriter } from "./IWriter.js";
import { Statement } from "./Statement.js";

class IndentNode extends AbstractAstNode {
    constructor(private readonly args: AstArg[]) { super(); }
    public write(writer: IWriter): void {
        writer.indent();
        for (const a of this.args) writeArg(writer, a);
        writer.dedent();
    }
}

class ScopeNode extends AbstractAstNode {
    constructor(private readonly args: AstArg[]) { super(); }
    public write(writer: IWriter): void {
        writer.pushScope();
        for (const a of this.args) writeArg(writer, a);
        writer.popScope();
    }
}

class NewLineNode extends AbstractAstNode {
    public write(writer: IWriter): void { writer.newLine(); }
}

class NewLineIfNotLastNode extends AbstractAstNode {
    public write(writer: IWriter): void { writer.writeNewLineIfLastLineNot(); }
}

class StatementNode extends AbstractAstNode {
    constructor(private readonly args: AstArg[]) { super(); }
    public write(writer: IWriter): void {
        for (const a of this.args) writeArg(writer, a);
        writer.writeStatement();
    }
}

class LineNode extends AbstractAstNode {
    constructor(private readonly args: AstArg[]) { super(); }
    public write(writer: IWriter): void {
        for (const a of this.args) writeArg(writer, a);
        writer.writeNewLineIfLastLineNot();
    }
}

export function indent(...args: AstArg[]): AbstractAstNode { return new IndentNode(args); }
export function scope(...args: AstArg[]): AbstractAstNode { return new ScopeNode(args); }
export function newLine(): AbstractAstNode { return new NewLineNode(); }
export function newLineIfNotLast(): AbstractAstNode { return new NewLineIfNotLastNode(); }
export function statement(...args: AstArg[]): AbstractAstNode { return new StatementNode(args); }
export function line(...args: AstArg[]): AbstractAstNode { return new LineNode(args); }

export function writeArgStatement(writer: IWriter, arg: AstArg): void {
    if (arg instanceof Statement) {
        writeArg(writer, arg);
        writer.writeNewLineIfLastLineNot();
    } else {
        writeArg(writer, arg);
        writer.writeStatement();
    }
}

export function writeBodyArgs(writer: IWriter, args: AstArg[], options?: { tailExpr?: boolean }): void {
    for (let i = 0; i < args.length; i++) {
        const isLast = i === args.length - 1;
        if (options?.tailExpr && isLast && !(args[i] instanceof Statement)) {
            writeArg(writer, args[i]!);
            writer.writeNewLineIfLastLineNot();
        } else {
            writeArgStatement(writer, args[i]!);
        }
    }
}

export function writeDelimited(writer: IWriter, args: AstArg[], separator = ", "): void {
    for (let i = 0; i < args.length; i++) {
        if (i > 0) writer.write(separator);
        writeArg(writer, args[i]!);
    }
}
