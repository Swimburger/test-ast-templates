import { AbstractAstNode } from "./AbstractAstNode.js";

// Marker base class for self-terminating statements.
// Nodes that extend Statement are already fully terminated (include their own
// semicolon or closing brace), so body writers skip the trailing semicolon.
export abstract class Statement extends AbstractAstNode {}
