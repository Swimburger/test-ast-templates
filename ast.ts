type AstNodeLike =
  | (string | AstNode)
  | AstNodeLike[]
  | (() => AstNodeLike | AstNodeLike[]);

abstract class AstNode {
  constructor() {}

  toJSON() {
    return {
      astType: this.constructor.name,
      ...this,
    };
  }

  public abstract write(writer: Writer): void;

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }

  public newLine(): AstNodeLike {
    return [this, newLine()];
  }

  public newLineIfNotLast(): AstNodeLike {
    return [this, newLineIfNotLastNode()];
  }

  public statement(): StatementNode {
    return statement(this);
  }

  public indent(): IndentNode {
    return indent(this);
  }
}

class NewLineAstNode extends AstNode {
  public write(writer: Writer) {
    writer.newLine();
  }
}

function newLine() : NewLineAstNode{
  return new NewLineAstNode();
}

class StatementNode extends AstNode {
  constructor(private nodes: AstNodeLike[]) {
    super();
  }

  public write(writer: Writer) {
    writer.write(...this.nodes, ";", line());
  }
}

function statement(...nodes: AstNodeLike[]) {
  return new StatementNode(nodes);
}

class LineNode extends AstNode {
  constructor(private nodes: AstNodeLike[]) {
    super();
  }
  public write(writer: Writer) {
    writer.write(...this.nodes);
    writer.newLine();
  }
}

function line(...nodes: AstNodeLike[]) {
  return new LineNode(nodes);
}

class NewLineIfNotLastNode extends AstNode {
  public write(writer: Writer) {
    writer.newLineIfNotLast();
  }
}

function newLineIfNotLastNode() {
  return new NewLineIfNotLastNode();
}

class EmptyNode extends AstNode {
  constructor() {
    super();
  }
  public write(_: Writer) {}
}

function empty() {
  return new EmptyNode();
}

class IndentNode extends AstNode {
  constructor(private nodes: AstNodeLike[]) {
    super();
  }
  public write(writer: Writer) {
    writer.indent();
    writer.write(...this.nodes);
    writer.dedent();
  }
}

function indent(...nodes: AstNodeLike[]) {
  return new IndentNode(nodes);
}

class ScopeNode extends AstNode {
  constructor(private nodes: AstNodeLike[]) {
    super();
  }
  public write(writer: Writer) {
    writer.write(
      "{",
      indent(line(), ...this.nodes, newLineIfNotLastNode()),
      "}"
    );
  }
}

function scope(...nodes: AstNodeLike[]) {
  return new ScopeNode(astNodeLikeToNodes(nodes));
}

class TextNode extends AstNode {
  constructor(private text: string) {
    super();
  }
  public write(writer: Writer) {
    writer.write(this.text);
  }
}

function text(text: string) {
  return new TextNode(text);
}

class ClassReferenceNode extends AstNode {
  constructor(private classReference: string) {
    super();
  }
  public write(writer: Writer) {
    writer.write(this.classReference);
  }
}

function classReference(classReference: string) {
  return new ClassReferenceNode(classReference);
}

class AstNodeList extends AstNode {
  constructor(private nodes: AstNodeLike[]) {
    super();
  }
  public write(writer: Writer) {
    writer.write(...this.nodes);
  }
}

function nodeList(...nodes: AstNode[]) {
  return new AstNodeList(nodes);
}

function astNodeLikeToNodes(nodes: AstNodeLike | AstNodeLike[]): AstNode[] {
  if (typeof nodes === "function") {
    nodes = nodes();
  }
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  return nodes.flatMap(
    (node: AstNode | string | AstNodeLike): AstNode | AstNode[] => {
      if (node instanceof AstNode) {
        return node;
      } else if (typeof node === "string") {
        return new TextNode(node);
      } else if (Array.isArray(node)) {
        return astNodeLikeToNodes(node);
      } else if (typeof node === "function") {
        return astNodeLikeToNodes(node());
      } else {
        throw new Error(`Unsupported node type: ${typeof node}`);
      }
    }
  );
}

class Writer {
  private static readonly INDENTATION = "  ";
  private buffer: string = "";
  private indentation: string = "";

  public write(...nodeLikes: AstNodeLike[]): void {
    for (const node of nodeLikes) {
      if (typeof node === "string") {
        this.buffer += node;
        continue;
      }
      const nodes = astNodeLikeToNodes(node);
      for (const node of nodes) {
        node.write(this);
      }
    }
  }

  public newLine(): void {
    this.buffer += `\n${this.indentation}`;
  }

  public newLineIfNotLast(): void {
    if (!this.buffer.endsWith(`\n${this.indentation}`)) {
      this.newLine();
    }
  }

  public indent() {
    this.indentation += Writer.INDENTATION;
    this.buffer += Writer.INDENTATION;
  }
  public dedent() {
    if (this.buffer.endsWith(`\n${this.indentation}`)) {
      this.buffer = this.buffer.slice(0, -Writer.INDENTATION.length);
    }
    this.indentation = this.indentation.slice(0, -Writer.INDENTATION.length);
  }

  public get ast() {
    return (
      strings: TemplateStringsArray,
      ...values: AstNodeLike[]
    ): AstNode => {
      const nodes: AstNodeLike[] = [];
      for (let i = 0; i < strings.length; i++) {
        if (i > 0) {
          const value = values[i - 1];
          nodes.push(...astNodeLikeToNodes(value));
        }
        nodes.push(strings[i]);
      }
      return new AstNodeList(nodes);
    };
  }

  public toString() {
    return this.buffer;
  }
}

const writer = new Writer();
const ast = writer.ast;

export {
  ast,
  statement,
  line,
  newLine,
  newLineIfNotLastNode,
  empty,
  indent,
  scope,
  text,
  classReference,
  nodeList,
  Writer,
};
