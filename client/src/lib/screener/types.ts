/**
 * Shared types for the visual condition builder used by the Expert Screener
 * and Fundamental Scanner. The builder compiles this AST to the exact
 * expression string that the existing ConditionEvaluator already understands.
 */

export type Variant = "expert" | "fundamental";

export type Operator =
  | ">"
  | "<"
  | ">="
  | "<="
  | "=="
  | "!="
  | "crossed_above"
  | "crossed_below";

export type ArithOp = "+" | "-" | "*" | "/";

export type ValueRef =
  | FieldValue
  | NumberValue
  | ArithValue;

export interface FieldValue {
  kind: "field";
  /** Base field name, e.g. "close", "ema", "rsi", "trailing_pe" */
  field: string;
  /** Only set when field accepts a period (ema_50, rsi_14, sma_200). Fundamentals always undefined. */
  period?: number;
  /** Offset in bars (positive = N bars ago). Expert only. Compiled to `_shift_N`. */
  offset?: number;
}

export interface NumberValue {
  kind: "number";
  value: number;
}

export interface ArithValue {
  kind: "arith";
  op: ArithOp;
  lhs: ValueRef;
  rhs: ValueRef;
}

export interface ConditionRow {
  kind: "condition";
  id: string;
  lhs: ValueRef;
  op: Operator;
  rhs: ValueRef;
}

export interface Group {
  kind: "group";
  id: string;
  children: GroupChild[];
}

export interface GroupChild {
  /** How this child joins the sibling above it. Ignored for the first child. */
  join: "and" | "or";
  clause: ConditionRow | Group;
}

export type Clause = ConditionRow | Group;

/** The builder always stores a root Group. Empty group = empty builder. */
export type BuilderTree = Group;

// ── Field catalog types ────────────────────────────────────────────────────

export interface FieldDef {
  /** Base name used in expressions (e.g. "ema", "close", "trailing_pe") */
  name: string;
  /** Human label shown in UI */
  label: string;
  /** UI group heading */
  group: string;
  /** True if this field requires a period suffix (ema_50). */
  hasPeriod?: boolean;
  /** Default period if hasPeriod. */
  defaultPeriod?: number;
  /** Common periods offered in the dropdown. User can type any integer too. */
  commonPeriods?: number[];
  /**
   * Some fields are stored as flat strings that already include a suffix the
   * user never edits (macd_line, bb_upper_20_2, high_52_W). For those, we
   * treat the full name as the "field" and hasPeriod = false.
   */
  suffixOnly?: boolean;
}
