/**
 * Compiles the builder AST to a Python-style expression string that the
 * existing backend ConditionEvaluator accepts.
 *
 * - Field + period + offset → `<name>_<period>_shift_<N>` (drop _shift_0)
 * - crossed_above  → `((lhs_shift_1 <= rhs_shift_1) and (lhs > rhs))`
 * - crossed_below  → `((lhs_shift_1 >= rhs_shift_1) and (lhs < rhs))`
 * - Groups wrap in parens only when needed (first-level root is never wrapped).
 */

import type {
  ArithOp,
  BuilderTree,
  Clause,
  ConditionRow,
  FieldValue,
  Group,
  Operator,
  ValueRef,
} from "./types";

// Operator precedence for minimal parenthesisation of arith expressions.
const ARITH_PREC: Record<ArithOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function compileField(f: FieldValue): string {
  let s = f.field;
  if (f.period !== undefined && f.period !== null) {
    s += `_${f.period}`;
  }
  if (f.offset && f.offset > 0) {
    s += `_shift_${f.offset}`;
  }
  return s;
}

function compileValue(v: ValueRef, parentPrec = 0): string {
  if (v.kind === "field") return compileField(v);
  if (v.kind === "number") return formatNumber(v.value);
  // arith
  const myPrec = ARITH_PREC[v.op];
  const lhs = compileValue(v.lhs, myPrec);
  const rhs = compileValue(v.rhs, myPrec + 1); // +1 so right side of same op wraps (for non-associative)
  const core = `${lhs} ${v.op} ${rhs}`;
  return myPrec < parentPrec ? `(${core})` : core;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Avoid "1e+21" for big numbers the user entered as integers
  if (Number.isInteger(n) && Math.abs(n) < 1e18) return n.toString();
  return n.toString();
}

/** Walk a ValueRef and add a shift offset to every FieldValue. */
function applyShift(v: ValueRef, delta: number): ValueRef {
  if (v.kind === "field") {
    return { ...v, offset: (v.offset ?? 0) + delta };
  }
  if (v.kind === "arith") {
    return { ...v, lhs: applyShift(v.lhs, delta), rhs: applyShift(v.rhs, delta) };
  }
  return v;
}

function compileCondition(row: ConditionRow): string {
  const { lhs, op, rhs } = row;
  if (op === "crossed_above") {
    const lhsPrev = compileValue(applyShift(lhs, 1));
    const rhsPrev = compileValue(applyShift(rhs, 1));
    const lhsNow = compileValue(lhs);
    const rhsNow = compileValue(rhs);
    return `((${lhsPrev} <= ${rhsPrev}) and (${lhsNow} > ${rhsNow}))`;
  }
  if (op === "crossed_below") {
    const lhsPrev = compileValue(applyShift(lhs, 1));
    const rhsPrev = compileValue(applyShift(rhs, 1));
    const lhsNow = compileValue(lhs);
    const rhsNow = compileValue(rhs);
    return `((${lhsPrev} >= ${rhsPrev}) and (${lhsNow} < ${rhsNow}))`;
  }
  return `${compileValue(lhs)} ${op} ${compileValue(rhs)}`;
}

function compileClause(c: Clause): string {
  return c.kind === "condition" ? compileCondition(c) : compileGroup(c, false);
}

/**
 * @param isRoot When true, don't wrap the whole group in parens (top-level).
 */
function compileGroup(g: Group, isRoot: boolean): string {
  if (g.children.length === 0) return "";
  if (g.children.length === 1) {
    // Single child: no join needed. Still wrap if nested group.
    const inner = compileClause(g.children[0].clause);
    return isRoot ? inner : wrapIfNeeded(g.children[0].clause, inner);
  }

  const parts: string[] = [];
  g.children.forEach((child, i) => {
    const piece = compileClause(child.clause);
    const wrapped = wrapIfNeeded(child.clause, piece);
    if (i === 0) {
      parts.push(wrapped);
    } else {
      parts.push(child.join);
      parts.push(wrapped);
    }
  });
  const body = parts.join(" ");
  return isRoot ? body : `(${body})`;
}

/**
 * Wrap the inner expression in parens when:
 *   - The child is a condition row (already atomic — skip).
 *   - The child is a nested group (already wraps itself via compileGroup).
 * Leaving it simple here; compileGroup handles the parens at its level.
 */
function wrapIfNeeded(_clause: Clause, inner: string): string {
  return inner;
}

/** Public entry point. */
export function compile(tree: BuilderTree): string {
  return compileGroup(tree, true).trim();
}

/** Is the builder tree empty (no children)? */
export function isEmpty(tree: BuilderTree): boolean {
  return tree.children.length === 0;
}

// ── Operator label helpers (UI) ────────────────────────────────────────────

export function operatorLabel(op: Operator): string {
  switch (op) {
    case ">": return ">";
    case "<": return "<";
    case ">=": return "≥";
    case "<=": return "≤";
    case "==": return "=";
    case "!=": return "≠";
    case "crossed_above": return "crossed above";
    case "crossed_below": return "crossed below";
  }
}

export const COMMON_OPERATORS: Operator[] = [">", "<", ">=", "<=", "==", "!="];
export const CROSSOVER_OPERATORS: Operator[] = ["crossed_above", "crossed_below"];
