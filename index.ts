import { Writer } from "./ast";
import newAst from "./newAst";

var writer = new Writer();
writer.write(...newAst);
console.log(writer.toString());
console.log();
console.log("AST: ", JSON.stringify(newAst, null, 2));