// C# using statement builder.
//
//   csharp.using("stream", csharp.invoke("OpenRead").on("File").arg("path"))
//       .body(csharp.invoke("Process").on("stream"))
//
// Generates:
//   using (var stream = File.OpenRead(path))
//   {
//       Process(stream);
//   }
//
// For the C# 8+ declaration form (no braces):
//
//   csharp.using("stream", expr).declaration()
//
// Generates:
//   using var stream = File.OpenRead(path);

import { type AstArg, writeArg } from "../core/AstTemplate.js";
import type { IWriter } from "../core/IWriter.js";
import { Statement } from "./Statement.js";
import { writeArgStatement } from "./helpers.js";

export class UsingStatementNode extends Statement {
    public readonly body_: AstArg[] = [];
    public declaration_ = false;

    constructor(
        private readonly variable_: string,
        private readonly initializer_: AstArg,
    ) {
        super();
    }

    public write(writer: IWriter): void {
        if (this.declaration_) {
            writer.write(`using var ${this.variable_} = `);
            writeArg(writer, this.initializer_);
            writer.writeStatement();
        } else {
            writer.write(`using (var ${this.variable_} = `);
            writeArg(writer, this.initializer_);
            writer.writeLine(")");
            writer.pushScope();
            for (const b of this.body_) writeArgStatement(writer, b);
            writer.popScope();
            writer.writeNewLineIfLastLineNot();
        }
    }
}

export class UsingStatement {
    constructor(private readonly node: UsingStatementNode) {}

    public body(...args: AstArg[]): this {
        this.node.body_.push(...args);
        return this;
    }

    // C# 8+ declaration form: using var x = expr;
    public declaration(): this {
        this.node.declaration_ = true;
        return this;
    }

    public build(): UsingStatementNode {
        return this.node;
    }
}

export function usingStatement(variable: string, initializer: AstArg): UsingStatement {
    return new UsingStatement(new UsingStatementNode(variable, initializer));
}
