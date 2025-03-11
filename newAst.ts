import {
  classReference,
  ast,
  scope,
  newLine,
} from "./ast";

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
  ast`${jsonObjReference} json = value.${discriminantPropertyName} switch`.newLine(),
  scope(
    ...unions.flatMap((type) => {
      return [
        ast`"${type.discriminantValue.wireValue}" => `,
        () => {
          switch (type.shape.propertiesType) {
            case "samePropertiesAsObject":
              return "JsonSerializer.SerializeToNode(value.Value, options),";
            case "singleProperty":
              return [
                ast`new ${jsonObjReference}`.newLine(),
                scope(
                  ast`["${type.shape.name.wireValue}"] = JsonSerializer.SerializeToNode(value.${valuePropertyName}, options)`
                ).indent(),
                ",",
              ];
            case "noProperties":
              return "null,";
            default:
              return "";
          }
        },
        newLine(),
      ];
    }),
    "_ => JsonSerializer.SerializeToNode(value.Value, options)"
  ),
  ast` ?? new ${jsonObjReference}()`.statement(),
];
