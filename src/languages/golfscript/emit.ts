import { TokenTree } from "../../common/Language";
import { EmitError, emitStringLiteral } from "../../common/emit";
import { IR, isIntLiteral } from "../../IR";

export default function emitProgram(program: IR.Program): TokenTree {
  return emitStatement(program.body, program);
}

function emitMultiExpr(baseExpr: IR.Expr, parent: IR.Node): TokenTree {
  const children = baseExpr.kind === "Block" ? baseExpr.children : [baseExpr];
  if (["Program", "ForRange", "ForEach"].includes(parent.kind)) {
    return children.map((stmt) => emitStatement(stmt, baseExpr));
  }

  return ["{", children.map((stmt) => emitStatement(stmt, baseExpr)), "}"];
}

function emitStatement(stmt: IR.Expr, parent: IR.Node): TokenTree {
  switch (stmt.kind) {
    case "Block":
      return emitMultiExpr(stmt, parent);
    case "ImportStatement":
      return [stmt.name, ...stmt.modules]; // TODO the ... could be avoided if TokenTree was made readonly??
    case "WhileLoop":
      return [
        emitMultiExpr(stmt.condition, stmt),
        emitMultiExpr(stmt.body, stmt),
        "while",
      ];
    case "ForRange":
      return [
        emitExpr(stmt.high),
        ",",
        isIntLiteral(stmt.low, 0n) ? [] : [emitExpr(stmt.low), ">"],
        isIntLiteral(stmt.increment, 1n) ? [] : [emitExpr(stmt.increment), "%"],
        "{",
        ":",
        emitExpr(stmt.variable),
        ";",
        emitMultiExpr(stmt.body, stmt),
        "}",
        "%",
      ];
    case "ForEach":
      return [
        emitExpr(stmt.collection),
        "{",
        ":",
        emitExpr(stmt.variable),
        ";",
        emitMultiExpr(stmt.body, stmt),
        "}",
        "%",
      ];
    case "IfStatement":
      return [
        emitExpr(stmt.condition),
        emitMultiExpr(stmt.consequent, stmt),
        stmt.alternate !== undefined
          ? emitMultiExpr(stmt.alternate, stmt)
          : "{}",
        "if",
      ];
    case "Variants":
    case "ForEachKey":
    case "ForEachPair":
    case "ForCLike":
      throw new EmitError(stmt);
    default:
      return emitExpr(stmt);
  }
}

function emitExpr(expr: IR.Expr): TokenTree {
  switch (expr.kind) {
    case "Assignment":
      return [emitExpr(expr.expr), ":", emitExpr(expr.variable), ";"];
    case "Identifier":
      return [expr.name];
    case "StringLiteral":
      return emitStringLiteral(expr.value, [
        [
          `"`,
          [
            [`\\`, `\\\\`],
            [`"`, `\\"`],
          ],
        ],
        [
          `"`,
          [
            [`\\`, `\\\\`],
            [`'`, `\\'`],
          ],
        ],
      ]);
    case "IntegerLiteral":
      return expr.value.toString();
    case "FunctionCall":
      return [expr.args.map(emitExpr), expr.ident.name];
    case "BinaryOp":
      return [emitExpr(expr.left), emitExpr(expr.right), expr.name];
    case "UnaryOp":
      return [emitExpr(expr.arg), expr.name];
    case "ListConstructor":
      return ["[", expr.exprs.map(emitExpr), "]"];
    case "ConditionalOp":
      return [
        emitExpr(expr.condition),
        emitExpr(expr.consequent),
        emitExpr(expr.alternate),
        "if",
      ];
    case "IndexCall":
      if (expr.oneIndexed) throw new EmitError(expr, "one indexed");
      return [emitExpr(expr.collection), emitExpr(expr.index), "="];
    case "RangeIndexCall": {
      if (expr.oneIndexed)
        throw new Error("GolfScript only supports zeroIndexed access.");

      return [
        emitExpr(expr.collection),
        emitExpr(expr.high),
        "<",
        emitExpr(expr.low),
        ">",
        isIntLiteral(expr.step, 1n) ? [] : [emitExpr(expr.step), "%"],
      ];
    }
    default:
      throw new EmitError(expr);
  }
}
