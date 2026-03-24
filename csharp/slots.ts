// Typed slot aliases for the C# AST layer.
//
// These narrow which node kinds are legal at each structural position.
// AstArg (string | AbstractAstNode | template) always serves as an escape
// hatch for inline expressions and raw code fragments.

import type { AstArg, RawNode } from "../core/AstTemplate.js";
import type { TypeDeclarationNode } from "./TypeDeclaration.js";
import type { MethodNode, ConstructorNode } from "./Method.js";
import type { Property } from "./Property.js";
import type { FieldNode, ConstantNode } from "./Field.js";
import type { EnumNode } from "./Enum.js";
import type {
    IfStatement,
    ForEach,
    ReturnStatement,
    SwitchStatement,
} from "./nodes.js";
import type {
    AssignStatement,
    ThrowExpression,
    AwaitExpression,
} from "./Expressions.js";
import type { UsingStatementNode } from "./UsingStatement.js";

/** Nodes that may appear at the top level of a C# file. */
export type CsFileNode =
    | TypeDeclarationNode
    | EnumNode
    | RawNode
    | AstArg;

/** Nodes that may appear as members of a class, record, interface, or struct. */
export type CsMemberNode =
    | FieldNode
    | ConstantNode
    | Property
    | ConstructorNode
    | MethodNode
    | TypeDeclarationNode
    | EnumNode;

/** Nodes that may appear as statements inside a method or constructor body. */
export type CsStatement =
    | ReturnStatement
    | IfStatement
    | ForEach
    | SwitchStatement
    | AssignStatement
    | ThrowExpression
    | AwaitExpression
    | UsingStatementNode
    | RawNode
    | AstArg;
