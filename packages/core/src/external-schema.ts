/** Small, non-recursive JSON Schema subset for untrusted upstream catalogs.
 * No references, regexes, or branching combinators: these can amplify CPU cost.
 */
export function assertExternalSchema(schema: unknown): void {
  if (JSON.stringify(schema).length > 64000)
    throw new Error("External schema is too large");
  let nodes = 0;
  const blocked = new Set([
    "$ref",
    "$dynamicRef",
    "$recursiveRef",
    "pattern",
    "patternProperties",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "if",
    "then",
    "else",
    "dependentSchemas",
  ]);
  function visit(value: unknown, depth: number): void {
    if (++nodes > 1000 || depth > 20)
      throw new Error("External schema is too complex");
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (blocked.has(key))
        throw new Error("Unsupported external schema keyword");
      visit(child, depth + 1);
    }
  }
  visit(schema, 0);
}
