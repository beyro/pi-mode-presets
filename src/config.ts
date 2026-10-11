import * as fs from "node:fs";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import type { z } from "zod";

const getLineAndColumn = (content: string, offset: number) => {
  const beforeOffset = content.slice(0, offset);
  const lines = beforeOffset.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
};

/**
 * Read a JSONC file and validate it with a Zod schema.
 * A missing file is treated as `{}`, so Zod defaults apply.
 */
export const loadConfig = <Schema extends z.ZodType>(
  filePath: string,
  schema: Schema,
): z.infer<Schema> => {
  if (!fs.existsSync(filePath)) return schema.parse({});

  const content = fs.readFileSync(filePath, "utf8");
  const errors: ParseError[] = [];
  const value = parse(content, errors, { allowTrailingComma: true, disallowComments: false });

  if (errors.length > 0) {
    const error = errors[0]!;
    const { line, column } = getLineAndColumn(content, error.offset);
    throw new Error(
      `Invalid JSONC in ${filePath}:${line}:${column}: ${printParseErrorCode(error.error)}`,
    );
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid config in ${filePath}:\n${result.error.message}`);
  }

  return result.data;
};
