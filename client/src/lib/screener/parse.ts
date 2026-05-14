/**
 * Best-effort recursive-descent parser: expression string → BuilderTree.
 *
 * Grammar:
 *   expr       := or_expr
 *   or_expr    := and_expr ('or' and_expr)*
 *   and_expr   := atom ('and' atom)*          // 'not' not supported — hand off to Expression mode
 *   atom       := comparison | '(' expr ')'
 *   comparison := value cmp_op value
 *   value      := arith_expr
 *   arith_expr := mul (('+' | '-') mul)*
 *   mul        := factor (('*' | '/') factor)*
 *   factor     := number | field_name | '(' arith_expr ')'
 *   field_name := ident with optional '_shift_<n>' suffix
 *
 * A leading '(' is ambiguous: it can wrap a boolean sub-expression (atom level)
 * OR an arithmetic operand of an outer comparison (factor level). parseAtom
 * disambiguates by peeking at the token immediately after the matching ')':
 * if it's a comparison or arithmetic operator, the parens are an arith operand
 * and we route through parseComparison (which handles '(arith)' via parseFactor).
 *
 * Returns {ok:false, reason} on any unsupported construct (not, function calls, **,
 * identifiers we don't recognise). Callers should fall back to Expression mode.
 */

import { compile } from "./compile";
import { resolveFieldName } from "./fields";
import type {
  ArithOp,
  BuilderTree,
  Clause,
  ConditionRow,
  Group,
  GroupChild,
  Operator,
  ValueRef,
  Variant,
} from "./types";

type ParseResult =
  | { ok: true; tree: BuilderTree }
  | { ok: false; reason: string };

// ── Tokenizer ──────────────────────────────────────────────────────────────

type TokenType =
  | "number"
  | "ident"
  | "lparen"
  | "rparen"
  | "op"      // + - * /
  | "cmp"     // > < >= <= == !=
  | "and"
  | "or"
  | "not"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

function tokenize(input: string): Token[] | string {
  const toks: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];

    // whitespace
    if (/\s/.test(c)) { i++; continue; }

    // parens
    if (c === "(") { toks.push({ type: "lparen", value: "(", pos: i++ }); continue; }
    if (c === ")") { toks.push({ type: "rparen", value: ")", pos: i++ }); continue; }

    // comparison operators (2-char first)
    if (c === ">" || c === "<" || c === "=" || c === "!") {
      const two = input.slice(i, i + 2);
      if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
        toks.push({ type: "cmp", value: two, pos: i });
        i += 2; continue;
      }
      if (c === ">" || c === "<") {
        toks.push({ type: "cmp", value: c, pos: i++ });
        continue;
      }
      return `Unexpected character '${c}' at position ${i}`;
    }

    // arithmetic ops
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      // Reject ** (power) — not in our subset
      if (c === "*" && input[i + 1] === "*") {
        return "Power operator (**) is not supported in the visual builder";
      }
      toks.push({ type: "op", value: c, pos: i++ });
      continue;
    }

    // numbers
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(input[j])) j++;
      // Optional scientific notation: 1e9, 1E+9, 1.5e-3
      if (j < n && (input[j] === "e" || input[j] === "E")) {
        j++;
        if (j < n && (input[j] === "+" || input[j] === "-")) j++;
        while (j < n && /[0-9]/.test(input[j])) j++;
      }
      toks.push({ type: "number", value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // identifiers + keywords
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_]/.test(input[j])) j++;
      const raw = input.slice(i, j);
      const low = raw.toLowerCase();
      if (low === "and") toks.push({ type: "and", value: "and", pos: i });
      else if (low === "or") toks.push({ type: "or", value: "or", pos: i });
      else if (low === "not") toks.push({ type: "not", value: "not", pos: i });
      else toks.push({ type: "ident", value: raw, pos: i });
      i = j;
      continue;
    }

    return `Unexpected character '${c}' at position ${i}`;
  }

  toks.push({ type: "eof", value: "", pos: n });
  return toks;
}

// ── Parser ─────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(
    tokens: Token[],
    private variant: Variant,
  ) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private consume(type: TokenType): Token | null {
    const t = this.peek();
    if (t.type === type) { this.pos++; return t; }
    return null;
  }
  private expect(type: TokenType): Token {
    const t = this.consume(type);
    if (!t) throw new ParseError(`Expected ${type} but got ${this.peek().type}='${this.peek().value}' at position ${this.peek().pos}`);
    return t;
  }

  // Assumes the current token is "(". Scans forward to find the matching ")"
  // and returns the token immediately after it (or null if no match).
  // Used by parseAtom to disambiguate boolean-wrap parens from arith-operand parens.
  private peekAfterMatchingParen(): Token | null {
    if (this.peek().type !== "lparen") return null;
    let depth = 0;
    for (let i = this.pos; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type === "lparen") {
        depth++;
      } else if (t.type === "rparen") {
        depth--;
        if (depth === 0) {
          return this.tokens[i + 1] ?? null;
        }
      } else if (t.type === "eof") {
        return null;
      }
    }
    return null;
  }

  // expr := or_expr
  parseExpr(): Clause {
    const clause = this.parseOr();
    if (this.peek().type !== "eof" && this.peek().type !== "rparen") {
      throw new ParseError(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
    }
    return clause;
  }

  // or_expr := and_expr ('or' and_expr)*
  private parseOr(): Clause {
    const first = this.parseAnd();
    const rest: Clause[] = [];
    while (this.consume("or")) {
      rest.push(this.parseAnd());
    }
    if (rest.length === 0) return first;
    // Build a group joined by OR
    const children: GroupChild[] = [{ join: "and", clause: first }];
    rest.forEach((c) => children.push({ join: "or", clause: c }));
    return { kind: "group", id: newId(), children };
  }

  // and_expr := atom ('and' atom)*
  private parseAnd(): Clause {
    const first = this.parseAtom();
    const rest: Clause[] = [];
    while (this.consume("and")) {
      rest.push(this.parseAtom());
    }
    if (rest.length === 0) return first;
    const children: GroupChild[] = [{ join: "and", clause: first }];
    rest.forEach((c) => children.push({ join: "and", clause: c }));
    return { kind: "group", id: newId(), children };
  }

  // atom := '(' expr ')' | comparison
  // A leading '(' is ambiguous: peek past the matching ')' to decide. If what
  // follows is a cmp/arith operator, the parens open an arith operand of an
  // outer comparison — route through parseComparison so parseFactor can consume
  // the '(' as a factor. Otherwise, treat the '(' as wrapping a boolean clause.
  private parseAtom(): Clause {
    if (this.consume("not")) {
      throw new ParseError("The 'not' operator is not supported in the visual builder");
    }
    if (this.peek().type === "lparen") {
      const after = this.peekAfterMatchingParen();
      const opensArithOperand =
        after !== null &&
        (after.type === "cmp" ||
          (after.type === "op" &&
            (after.value === "+" ||
              after.value === "-" ||
              after.value === "*" ||
              after.value === "/")));
      if (opensArithOperand) {
        return this.parseComparison();
      }
      this.consume("lparen");
      const inner = this.parseOr();
      this.expect("rparen");
      return inner;
    }
    return this.parseComparison();
  }

  // comparison := value cmp_op value
  private parseComparison(): ConditionRow {
    const lhs = this.parseArith();
    const cmpTok = this.consume("cmp");
    if (!cmpTok) {
      throw new ParseError(`Expected comparison operator at position ${this.peek().pos}`);
    }
    const op = cmpTok.value as Operator;
    const rhs = this.parseArith();
    return { kind: "condition", id: newId(), lhs, op, rhs };
  }

  // arith_expr := mul (('+' | '-') mul)*
  private parseArith(): ValueRef {
    let left = this.parseMul();
    while (this.peek().type === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const opTok = this.consume("op")!;
      const right = this.parseMul();
      left = { kind: "arith", op: opTok.value as ArithOp, lhs: left, rhs: right };
    }
    return left;
  }

  // mul := factor (('*' | '/') factor)*
  private parseMul(): ValueRef {
    let left = this.parseFactor();
    while (this.peek().type === "op" && (this.peek().value === "*" || this.peek().value === "/")) {
      const opTok = this.consume("op")!;
      const right = this.parseFactor();
      left = { kind: "arith", op: opTok.value as ArithOp, lhs: left, rhs: right };
    }
    return left;
  }

  // factor := number | field_name | '(' arith ')'
  private parseFactor(): ValueRef {
    const t = this.peek();
    if (t.type === "number") {
      this.pos++;
      return { kind: "number", value: parseFloat(t.value) };
    }
    if (t.type === "ident") {
      this.pos++;
      return this.identToField(t.value, t.pos);
    }
    if (t.type === "lparen") {
      this.pos++;
      const inner = this.parseArith();
      this.expect("rparen");
      return inner;
    }
    // Unary minus
    if (t.type === "op" && t.value === "-") {
      this.pos++;
      const inner = this.parseFactor();
      if (inner.kind === "number") return { kind: "number", value: -inner.value };
      return { kind: "arith", op: "-", lhs: { kind: "number", value: 0 }, rhs: inner };
    }
    throw new ParseError(`Unexpected token '${t.value}' at position ${t.pos}`);
  }

  private identToField(ident: string, pos: number): ValueRef {
    // Strip trailing _shift_<N>
    let offset: number | undefined;
    const shiftMatch = ident.match(/^(.*)_shift_(\d+)$/);
    let baseName = ident;
    if (shiftMatch) {
      baseName = shiftMatch[1];
      offset = parseInt(shiftMatch[2], 10);
    }

    const resolved = resolveFieldName(baseName, this.variant);
    if (!resolved) {
      throw new ParseError(`Unknown field '${ident}' at position ${pos}`);
    }

    return {
      kind: "field",
      field: resolved.def.name,
      period: resolved.period,
      offset,
    };
  }
}

class ParseError extends Error {}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse an expression string into a BuilderTree. Always returns a root Group
 * (even if the expression is a single condition — wrapped in a 1-child group).
 */
export function parse(input: string, variant: Variant): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, tree: { kind: "group", id: newId(), children: [] } };

  const toksOrErr = tokenize(trimmed);
  if (typeof toksOrErr === "string") {
    return { ok: false, reason: toksOrErr };
  }

  try {
    const parser = new Parser(toksOrErr, variant);
    const clause = parser.parseExpr();

    let tree: BuilderTree;
    if (clause.kind === "group") {
      tree = clause;
    } else {
      tree = { kind: "group", id: newId(), children: [{ join: "and", clause }] };
    }
    return { ok: true, tree };
  } catch (e) {
    const msg = e instanceof ParseError ? e.message : String(e);
    return { ok: false, reason: msg };
  }
}

/** Round-trip sanity helper (for tests / dev console). */
export function roundTrip(input: string, variant: Variant): string | null {
  const r = parse(input, variant);
  if (!r.ok) return null;
  return compile(r.tree);
}
