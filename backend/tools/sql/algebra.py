from __future__ import annotations
from dataclasses import dataclass
import sqlglot
from sqlglot import exp


@dataclass
class RelationalAlgebraResult:
    unicode_str: str
    latex_str: str
    operators: list[str]


def to_relational_algebra(sql: str) -> RelationalAlgebraResult:
    """Translate a SQL query into its equivalent Relational Algebra expression.
    Extracts operators:
      - Projection (pi): SELECT columns
      - Selection (sigma): WHERE condition
      - Join (bowtie): INNER/LEFT/RIGHT JOINs
      - Group/Aggregate (gamma): GROUP BY and aggregate functions
      - Rename (rho): Table / column aliases
    """
    try:
        ast = sqlglot.parse_one(sql, read="postgres")
    except Exception:
        return RelationalAlgebraResult(
            unicode_str=f"Could not parse algebra from: {sql}",
            latex_str=f"\\text{{Could not parse: }} {sql}",
            operators=[],
        )

    if not isinstance(ast, exp.Select):
        return RelationalAlgebraResult(
            unicode_str=f"Non-SELECT statement: {ast.key.upper()}",
            latex_str=f"\\text{{{ast.key.upper()}}}",
            operators=[ast.key.upper()],
        )

    operators: list[str] = []

    # 1. From and Joins
    from_table = ast.find(exp.From)
    base_relation = from_table.this.name if from_table and hasattr(from_table.this, "name") else "R"
    rel_expr = base_relation

    for join in ast.find_all(exp.Join):
        operators.append("JOIN")
        join_table = join.this.name if hasattr(join.this, "name") else "S"
        join_on = join.args.get("on")
        if join_on:
            on_str = join_on.sql()
            rel_expr = f"({rel_expr} ⋈_{{{on_str}}} {join_table})"
        else:
            rel_expr = f"({rel_expr} ⋈ {join_table})"

    # 2. Where / Selection (sigma)
    where = ast.find(exp.Where)
    if where:
        operators.append("SELECTION")
        cond_str = where.this.sql()
        rel_expr = f"σ_{{{cond_str}}}({rel_expr})"

    # 3. Group by / Aggregates (gamma)
    group_by = ast.find(exp.Group)
    if group_by:
        operators.append("AGGREGATION")
        group_cols = ", ".join(c.sql() for c in group_by.expressions)
        aggs = [e.sql() for e in ast.expressions if isinstance(e, exp.AggFunc)]
        agg_str = ", ".join(aggs)
        rel_expr = f"γ_{{{group_cols}; {agg_str}}}({rel_expr})"

    # 4. Select / Projection (pi)
    select_cols = [c.sql() for c in ast.expressions if not isinstance(c, exp.AggFunc)]
    if select_cols:
        operators.append("PROJECTION")
        proj_str = ", ".join(select_cols)
        rel_expr = f"π_{{{proj_str}}}({rel_expr})"
    elif ast.expressions:
        operators.append("PROJECTION")
        proj_str = ", ".join(c.sql() for c in ast.expressions)
        rel_expr = f"π_{{{proj_str}}}({rel_expr})"

    # Format LaTeX string
    latex_expr = (
        rel_expr.replace("π", "\\pi")
        .replace("σ", "\\sigma")
        .replace("⋈", "\\bowtie")
        .replace("γ", "\\gamma")
        .replace("ρ", "\\rho")
    )

    return RelationalAlgebraResult(
        unicode_str=rel_expr,
        latex_str=latex_expr,
        operators=operators,
    )
