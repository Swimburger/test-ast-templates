const jsonObjReference = "JsonObject" as any;
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
var writer = {} as any;
writer.writeNode(this.context.getJsonNodeClassReference());
writer.writeLine(` json = value.${discriminantPropertyName} switch`);
writer.writeLine("{");
writer.indent();
this.unionDeclaration.types.forEach((type) => {
    writer.write(`"${type.discriminantValue.wireValue}" => `);
    switch (type.shape.propertiesType) {
        case "samePropertiesAsObject":
            writer.write("JsonSerializer.SerializeToNode(value.Value, options),");
            break;
        case "singleProperty":
            writer.write("new ");
            writer.writeNode(jsonObjReference);
            writer.writeLine();
            writer.writeLine("{");
            writer.indent();
            writer.writeLine(
                `["${type.shape.name.wireValue}"] = JsonSerializer.SerializeToNode(value.${valuePropertyName}, options)`
            );
            writer.dedent();
            writer.writeLine("},");
            break;
        case "noProperties":
            writer.writeLine("null,");
            break;
    }
});
writer.write("_ => JsonSerializer.SerializeToNode(value.Value, options)");
writer.dedent();
writer.write("} ?? new ");
writer.writeNode(jsonObjReference);
writer.writeTextStatement("()");