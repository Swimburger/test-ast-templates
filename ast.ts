type StringOrAstNode = string | AstNode;

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
}

class StatementNode extends AstNode {
  constructor(private nodes: AstNode[]) {
    super();
  }

  public write(writer: Writer) {
    writer.write(...this.nodes, ";", line());
  }
}

function statement(...nodes: AstNode[]) {
  return new StatementNode(nodes);
}

class LineNode extends AstNode {
  constructor(private nodes: AstNode[]) {
    super();
  }
  public write(writer: Writer) {
    writer.write(...this.nodes);
    writer.newLine();
  }
}

function line(...nodes: AstNode[]) {
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
  constructor(private nodes: AstNode[]) {
    super();
  }
  public write(writer: Writer) {
    writer.indent();
    writer.write(...this.nodes);
    writer.dedent();
  }
}

function indent(...nodes: AstNode[]) {
  return new IndentNode(nodes);
}

class ScopeNode extends AstNode {
  constructor(private nodes: AstNode[]) {
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

function scope(...nodes: AstNode[]) {
  return new ScopeNode(nodes);
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

class AstCallback extends AstNode {
  private nodes: AstNode | AstNode[];
  constructor(getNodes: () => AstNode | AstNode[]) {
    super();
    this.nodes = getNodes();
  }
  public write(writer: Writer) {
    if (this.nodes instanceof AstNode) {
      this.nodes.write(writer);
    } else if (Array.isArray(this.nodes)) {
      for (const node of this.nodes) {
        if (node instanceof AstNode) {
          node.write(writer);
        } else {
          throw new Error(`Unsupported node type: ${typeof node}`);
        }
      }
    } else {
      throw new Error(`Unsupported node type: ${typeof this.nodes}`);
    }
  }
}

function callback(getNodes: () => AstNode | AstNode[]) {
  return new AstCallback(getNodes);
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
  constructor(private nodes: AstNode[]) {
    super();
  }
  public write(writer: Writer) {
    writer.write(...this.nodes);
  }
}

function nodeList(...nodes: AstNode[]) {
  return new AstNodeList(nodes);
}

class Writer {
  private static readonly INDENTATION = "  ";
  private buffer: string = "";
  private indentation: string = "";

  public write(...stringsOrNodes: StringOrAstNode[]): void {
    for (const node of stringsOrNodes) {
      if (typeof node === "string") {
        this.buffer += node;
      } else if (node instanceof AstNode) {
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
      ...values: StringOrAstNode[]
    ): AstNode => {
      const nodes: AstNode[] = [];
      for (let i = 0; i < strings.length; i++) {
        if (i > 0) {
          const value = values[i - 1];
          if (value instanceof AstNode) {
            nodes.push(value);
          } else if (typeof value === "string") {
            nodes.push(new TextNode(value));
          } else {
            throw new Error(`Unsupported value type: ${typeof value}`);
          }
        }
        nodes.push(new TextNode(strings[i]));
      }
      return new AstNodeList(nodes);
    };
  }

  public toString() {
    return this.buffer;
  }
}

// example usage
const writer = new Writer();
const ast = writer.ast;

export {
  ast,
  statement,
  line,
  newLineIfNotLastNode,
  empty,
  indent,
  scope,
  text,
  callback,
  classReference,
  nodeList,
  Writer
}