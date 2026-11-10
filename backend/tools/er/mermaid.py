from __future__ import annotations
from backend.tools.er.models import ERModel


def render_mermaid(er_model: ERModel) -> str:
    """Render an ERModel as a standard Mermaid erDiagram code block string."""
    lines: list[str] = ["erDiagram"]

    # Map cardinalities and participations to Mermaid line styles
    # Cardinality syntax in Mermaid:
    #   ||--|| : 1:1 exactly
    #   ||--o{ : 1:N zero-or-more
    #   }|--o{ : M:N
    for rel in er_model.relationships:
        if len(rel.entities) == 2:
            e1, e2 = rel.entities[0], rel.entities[1]
            card = rel.cardinality
            part1 = rel.participation.get(e1, "partial")
            part2 = rel.participation.get(e2, "partial")

            left = "||" if part1 == "total" else "|o"
            if card == "1:1":
                right = "||" if part2 == "total" else "o|"
                rel_symbol = f"{left}--{right}"
            elif card in ("1:N", "1:M"):
                rel_symbol = f"{left}--o{{"
            elif card in ("N:1", "M:1"):
                rel_symbol = f"}}o--{left}"
            else:  # M:N
                rel_symbol = "}o--o{"

            rel_label = rel.name.lower().replace(" ", "_")
            lines.append(f"    {e1.upper()} {rel_symbol} {e2.upper()} : {rel_label}")

    for gen in er_model.generalizations:
        for child in gen.child_entities:
            lines.append(f"    {gen.parent_entity.upper()} ||--|| {child.upper()} : isa")

    # Render entity attribute blocks
    for entity in er_model.entities:
        lines.append(f"    {entity.name.upper()} {{")
        for attr in entity.attributes:
            type_str = attr.type.lower().split("(")[0]
            pk_mark = " PK" if attr.is_pk else ""
            lines.append(f"        {type_str} {attr.name}{pk_mark}")
        if entity.is_weak and entity.partial_keys:
            for pkey in entity.partial_keys:
                if not any(a.name == pkey for a in entity.attributes):
                    lines.append(f"        string {pkey}")
        lines.append("    }")

    return "\n".join(lines)
