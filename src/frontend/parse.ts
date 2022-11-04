import nearley from "nearley";
import {
  Expr,
  functionCall,
  Identifier,
  Program,
  Statement,
  forRange,
  Block,
  ifStatement,
  listConstructor,
  BinaryOpCodeArray,
  polygolfOp,
  ValueType,
  simpleType,
  listType,
  arrayType,
  tableType,
  setType,
  integerType as intType,
  IntegerLiteral,
  int,
  UnaryOpCodeArray,
  OpCodeArray,
  assignment,
  OpCode,
  PolygolfOp,
  block,
  whileLoop,
} from "../IR";
import grammar from "./grammar";

export function sexpr(
  callee: Identifier,
  args: (Expr | Block)[]
): Expr | Statement {
  const opCode = canonicalOp(callee.name, args.length);
  function expectArity(low: number, high: number = low) {
    if (args.length < low || args.length > high) {
      throw new Error(
        `Invalid argument count in application of ${opCode}: ` +
          `Expected ${low}${low === high ? "" : ".." + String(high)} but got ${
            args.length
          }.`
      );
    }
  }
  function assertIdentifier(e: Expr | Block): asserts e is Identifier {
    if (e.type !== "Identifier")
      throw new Error(
        `Application first argument must be identifier, but got ${args[0].type}`
      );
  }
  function assertExpr(e: Expr | Block): asserts e is Expr {
    if (e.type === "Block")
      throw new Error(`Application ${opCode} cannot take a block as argument`);
  }
  function assertExprs(e: (Expr | Block)[]): asserts e is Expr[] {
    e.forEach(assertExpr);
  }
  function assertBlock(e: Expr | Block): asserts e is Block {
    if (e.type !== "Block")
      throw new Error(
        `Application ${opCode} requires a block where you passed a non-block`
      );
  }
  switch (opCode) {
    case "for": {
      expectArity(4, 5);
      let variable, low, high, increment, body: Expr | Block;
      if (args.length === 5) {
        [variable, low, high, increment, body] = args;
      } else {
        [variable, low, high, body] = args;
        increment = int(1n);
      }
      assertIdentifier(variable);
      assertExpr(low);
      assertExpr(high);
      assertExpr(increment);
      assertBlock(body);
      return forRange(variable, low, high, increment, body);
    }
    case "if": {
      expectArity(2, 3);
      const condition = args[0];
      const consequent = args[1];
      const alternate = args[2] ?? block([]);
      assertExpr(condition);
      assertBlock(consequent);
      assertBlock(alternate);
      return ifStatement(condition, consequent, alternate);
    }
    case "while": {
      expectArity(2);
      const [condition, body] = args;
      assertExpr(condition);
      assertBlock(body);
      return whileLoop(condition, body);
    }
  }
  assertExprs(args);
  if (!callee.builtin) {
    return functionCall(args, callee);
  }
  switch (opCode) {
    case "assign":
      expectArity(2);
      assertIdentifier(args[0]);
      return assignment(args[0], args[1]);
    case "list":
      return listConstructor(args);
  }
  if (OpCodeArray.includes(opCode)) {
    if (UnaryOpCodeArray.includes(opCode)) {
      expectArity(1);
    } else if (BinaryOpCodeArray.includes(opCode)) {
      const allowNary = [
        "add",
        "mul",
        "bitand",
        "bitor",
        "bitxor",
        "str_concat",
      ].includes(opCode);
      expectArity(2, allowNary ? 99 : 2);
      return composedPolygolfOp(opCode, args);
    }
    return polygolfOp(opCode, ...args);
  }
  throw new Error(`Unrecognized builtin: ${opCode}`);
}

export const canonicalOpTable: Record<string, OpCode> = {
  "+": "add",
  // neg, sub handled as special case in canonicalOp
  "-": "",
  "*": "mul",
  "^": "exp",
  "&": "bitand",
  "|": "bitor",
  // bitxor, bitnot handled as special case in canonicalOp
  "~": "",
  "==": "eq",
  "!=": "neq",
  "<=": "leq",
  "<": "lt",
  ">=": "geq",
  ">": "gt",
  "<-": "assign",
  "#": "cardinality",
  "..": "str_concat",
};

function canonicalOp(op: string, arity: number): string {
  if (op === "-") return arity < 2 ? "neg" : "sub";
  if (op === "~") return arity < 2 ? "bitnot" : "bitxor";
  return canonicalOpTable[op] ?? op;
}

function composedPolygolfOp(op: OpCode, args: Expr[]): PolygolfOp {
  if (args.length < 3) return polygolfOp(op, ...args);
  return polygolfOp(
    op,
    composedPolygolfOp(op, args.slice(0, -1)),
    args[args.length - 1]
  );
}

export function typeSexpr(
  callee: string,
  args: (ValueType | IntegerLiteral)[]
): ValueType {
  function expectArity(n: number) {
    if (args.length !== n) {
      throw new Error(
        `Invalid argument count in application of ${callee}: ` +
          `Expected ${n} but got ${args.length}.`
      );
    }
  }
  function assertNumber(
    e: ValueType | IntegerLiteral
  ): asserts e is IntegerLiteral {
    if (e.type !== "IntegerLiteral")
      throw new Error(`Expected number, got type.`);
  }
  function assertType(e: ValueType | IntegerLiteral): asserts e is ValueType {
    if (e.type === "IntegerLiteral")
      throw new Error(`Expected type, got number.`);
  }
  switch (callee) {
    case "Void":
      expectArity(0);
      return simpleType("void");
    case "Text":
      expectArity(0);
      return simpleType("string");
    case "Bool":
      expectArity(0);
      return simpleType("boolean");
    case "Array":
      expectArity(2);
      assertType(args[0]);
      assertNumber(args[1]);
      return arrayType(args[0], Number(args[1].value));
    case "List":
      expectArity(1);
      assertType(args[0]);
      return listType(args[0]);
    case "Table":
      expectArity(2);
      assertType(args[0]);
      assertType(args[1]);
      if (args[0].type === "integer") return tableType(args[0], args[1]);
      if (args[0].type === "string") return tableType("string", args[1]);
      throw new Error("Unexpected key type for table.");
    case "Set":
      expectArity(1);
      assertType(args[0]);
      return setType(args[0]);
    default:
      throw new Error(`Unrecognized type: ${callee}`);
  }
}

export function annotate(expr: Expr, valueType: [any, ValueType] | null): Expr {
  if (valueType === null) return expr;
  return { ...expr, valueType: valueType[1] };
}

export function integerType(
  low: "-oo" | "-∞" | IntegerLiteral,
  high: "oo" | "∞" | IntegerLiteral
): ValueType {
  return intType(
    typeof low === "string" ? undefined : low.value,
    typeof high === "string" ? undefined : high.value
  );
}

export default function parse(code: string) {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  parser.feed(code);
  const results = parser.results;
  if (results.length > 1) throw new Error("Ambiguous parse of code");
  if (results.length === 0) throw new Error("Unexpected end of code");
  return results[0] as Program;
}