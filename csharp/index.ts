import { attributeRef as _attributeRef, classAttribute, methodAttribute, propertyAttribute, returnAttribute, paramAttribute, fieldAttribute, type AttributeScope, type AttributeRef, type ClassAttribute, type MethodAttribute, type PropertyAttribute, type ReturnAttribute, type ParamAttribute, type FieldAttribute } from "./attributes.js";
import { classRef as _classRef } from "./ClassReference.js";
import { field as _field, constant as _constant, type FieldNode, type ConstantNode } from "./Field.js";
import { method as _method, ctor as _ctor, type MethodNode, type ConstructorNode, type Access, type ParamDef } from "./Method.js";
import { property as _property, type Property } from "./Property.js";
import { record as _record, csClass as _csClass, csInterface as _csInterface, struct as _struct, recordStruct as _recordStruct, type TypeDeclarationNode, type PrimaryCtorParam, type ClassDeclaration, type RecordDeclaration, type InterfaceDeclaration, type StructDeclaration } from "./TypeDeclaration.js";
import { ifStatement as _ifStatement, switchExpression as _switchExpression, switchStatement as _switchStatement, returnStatement as _returnStatement, forEach as _forEach, invoke as _invoke, instantiate as _instantiate } from "./nodes.js";
import { typeRef as _typeRef, type TypeRefNode } from "./TypeRef.js";
import { awaitExpr as _awaitExpr, throwExpr as _throwExpr, assign as _assign, nullCoalesce as _nullCoalesce } from "./Expressions.js";
import { csEnum as _csEnum, type EnumNode } from "./Enum.js";
import { usingStatement as _usingStatement } from "./UsingStatement.js";
import { renderFile as _renderFile } from "./renderFile.js";
import type { CSharpReference } from "./Reference.js";
import type { IndentStyle } from "../core/AbstractWriter.js";
import { type AstArg, type RawNode, makeRaw } from "../core/AstTemplate.js";

const _raw = makeRaw("csharp");
import type { XmlDoc } from "./docComment.js";

export const cs = {
    // -- References --
    classRef:     _classRef,
    attributeRef: _attributeRef,

    // -- Rendering --
    renderFile: _renderFile,

    // -- Type declarations --
    record:       _record,
    class:        _csClass,
    interface:    _csInterface,
    struct:       _struct,
    recordStruct: _recordStruct,
    enum:         _csEnum,

    // -- Members --
    property:  _property,
    field:     _field,
    constant:  _constant,
    method:    _method,
    ctor:      _ctor,

    // -- Type references --
    typeRef: _typeRef,

    // -- Raw escape hatch --
    raw: _raw,

    // -- Statements / expressions --
    if:               _ifStatement,
    return:           _returnStatement,
    forEach:          _forEach,
    switchExpression: _switchExpression,
    switch:           _switchStatement,
    invoke:           _invoke,
    instantiate:      _instantiate,
    await:            _awaitExpr,
    throw:            _throwExpr,
    assign:           _assign,
    nullCoalesce:     _nullCoalesce,
    using:            _usingStatement,

    // -- Attributes --
    classAttribute,
    methodAttribute,
    propertyAttribute,
    returnAttribute,
    paramAttribute,
    fieldAttribute,
};

// Re-export types for use in signatures
export type {
    RawNode,
    AttributeScope, AttributeRef,
    ClassAttribute, MethodAttribute, PropertyAttribute, ReturnAttribute, ParamAttribute, FieldAttribute,
    CSharpReference,
    FieldNode, ConstantNode,
    MethodNode, ConstructorNode,
    Property,
    TypeDeclarationNode, PrimaryCtorParam,
    ClassDeclaration, RecordDeclaration, InterfaceDeclaration, StructDeclaration,
    EnumNode,
    TypeRefNode,
    Access, ParamDef,
    XmlDoc,
    AstArg, IndentStyle,
};
