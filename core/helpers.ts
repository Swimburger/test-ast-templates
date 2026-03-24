import { AbstractAstNode } from "./AbstractAstNode.js";
import { type AstArg, writeArg } from "./AstTemplate.js";
import type { IWriter } from "./IWriter.js";

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
