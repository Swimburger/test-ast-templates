import { classReference, line, ast, scope, callback, indent, empty, statement } from "./ast";

const jsonObjReference = classReference("JsonObject");
const unions = [
  {
    discriminantValue: { wireValue: "type1" },
    shape: {
      propertiesType: "samePropertiesAsObject",
      name: { wireValue: "shape1" },
    },
  },
  {
    discriminantValue: { wireValue: "type2" },
    shape: {
      propertiesType: "singleProperty",
      name: { wireValue: "shape2" },
    },
  },
  {
    discriminantValue: { wireValue: "type3" },
    shape: {
      propertiesType: "noProperties",
      name: { wireValue: "shape3" },
    },
  },
];
const discriminantPropertyName = "Type";
const valuePropertyName = "Value";
export default [
  line(
    ast`${jsonObjReference} json = value.${discriminantPropertyName} switch`
  ),
  scope(
    ...unions.map((type) => {
      return line(
        ast`"${type.discriminantValue.wireValue}" => `,
        callback(() => {
          switch (type.shape.propertiesType) {
            case "samePropertiesAsObject":
              return ast`JsonSerializer.SerializeToNode(value.Value, options),`;
            case "singleProperty":
              return [
                line(ast`new ${jsonObjReference}`),
                indent(
                  scope(
                    ast`["${type.shape.name.wireValue}"] = JsonSerializer.SerializeToNode(value.${valuePropertyName}, options)`
                  )
                ),
                ast`,`,
              ];
            case "noProperties":
              return ast`null,`;
            default:
              return empty();
          }
        })
      );
    }),
    ast`_ => JsonSerializer.SerializeToNode(value.Value, options)`
  ),
  statement(ast` ?? new ${jsonObjReference}()`),
];