import { classRef as _classRef } from "./ClassReference.js";
import { renderFile as _renderFile } from "./renderFile.js";
import {
    property as _property, method as _method, arrowFunction as _arrowFunction,
    typeAlias as _typeAlias, tsClass as _tsClass, tsInterface as _tsInterface,
    returnStatement as _returnStatement, ifStatement as _ifStatement,
    throwStatement as _throwStatement,
    type Property, type MethodNode, type ArrowFunctionNode,
    type TypeAliasNode, type TypeDeclarationNode, type ParamDef,
} from "./nodes.js";
import type { TypeScriptReference } from "./Reference.js";
import type { IndentStyle } from "../core/AbstractWriter.js";
import type { AstArg } from "../core/AstTemplate.js";

export const typescript = {
    // -- References --
    classRef: _classRef,

    // -- Rendering --
    renderFile: _renderFile,

    // -- Type declarations --
    class:     _tsClass,
    interface: _tsInterface,
    typeAlias: _typeAlias,

    // -- Members --
    property:      _property,
    method:        _method,
    arrowFunction: _arrowFunction,

    // -- Statements / expressions --
    return: _returnStatement,
    if:     _ifStatement,
    throw:  _throwStatement,
};

// Re-export types for use in signatures
export type {
    TypeScriptReference,
    Property,
    MethodNode, ArrowFunctionNode,
    TypeAliasNode, TypeDeclarationNode,
    ParamDef,
    AstArg, IndentStyle,
};
