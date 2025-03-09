import { Writer } from "./ast";
import newAst from "./newAst";

var writer = new Writer();
writer.write(...newAst);
console.log(writer.toString());