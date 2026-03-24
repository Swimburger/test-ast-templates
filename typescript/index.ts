import { classRef as _classRef } from "./ClassReference.js";
import { renderFile as _renderFile } from "./renderFile.js";
import {
    property as _property, method as _method, arrowFunction as _arrowFunction,
    typeAlias as _typeAlias, tsClass as _tsClass, tsInterface as _tsInterface,
    returnStatement as _return, ifStatement as _if, ctor as _ctor,
    throwExpression as _throw, awaitExpression as _await,
    assignStatement as _assign, nullishCoalesce as _nullishCoalesce,
    constStatement as _const,
    newExpression as _new, objectExpression as _object,
    arrayExpression as _array, ternaryExpression as _ternary,
    literal as _literal, unionType as _union, intersectionType as _intersection,
    typeRef as _typeRef, functionDeclaration as _function,
    forOf as _forOf, tryCatch as _tryCatch,
    indexSignature as _indexSignature,
    type Property, type MethodNode, type ArrowFunctionNode,
    type TypeAliasNode, type TypeDeclarationNode, type ParamDef,
    type TsClassDeclaration, type TsInterfaceDeclaration,
    type NewExpression, type ObjectExpression, type ArrayExpression, type TernaryExpression, type Literal,
    type UnionType, type IntersectionType,
    type TypeRefNode, type FunctionDeclarationNode, type ForOfStatement, type TryCatchStatement, type IndexSignatureNode,
} from "./nodes.js";
import type { TypeScriptReference } from "./Reference.js";
import type { IndentStyle } from "../core/AbstractWriter.js";
import { type AstArg, type RawNode, makeRaw } from "../core/AstTemplate.js";

const _raw = makeRaw("typescript");

export const ts = {
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
    ctor:          _ctor,
    arrowFunction: _arrowFunction,

    // -- Raw escape hatch --
    raw: _raw,

    // -- Statements / expressions --
    return:          _return,
    if:              _if,
    throw:           _throw,
    await:           _await,
    assign:          _assign,
    nullishCoalesce: _nullishCoalesce,
    const:           _const,
    new:             _new,
    object:          _object,
    array:           _array,
    ternary:         _ternary,
    literal:         _literal,
    union:           _union,
    intersection:    _intersection,
    typeRef:         _typeRef,
    function:        _function,
    forEach:         _forOf,
    tryCatch:        _tryCatch,
    indexSignature:  _indexSignature,
};

// Re-export types for use in signatures
export type {
    RawNode,
    TypeScriptReference,
    Property,
    MethodNode, ArrowFunctionNode,
    TypeAliasNode, TypeDeclarationNode,
    TsClassDeclaration, TsInterfaceDeclaration,
    NewExpression, ObjectExpression, ArrayExpression, TernaryExpression, Literal, UnionType, IntersectionType,
    TypeRefNode, FunctionDeclarationNode, ForOfStatement, TryCatchStatement, IndexSignatureNode,
    ParamDef,
    AstArg, IndentStyle,
};
