from __future__ import annotations
from typing import Any
from backend.tools.er.models import Attribute, Entity, ERModel, Relationship
from backend.tools.mapping.models import Column, ForeignKeyDef, RelationalSchema, Table


def _fk_name(table: str, pk: str) -> str:
    """FK column name: reuse `member_id` as-is instead of producing `member_member_id`."""
    t = table.lower()
    return pk if pk.lower().startswith(t + "_") or pk.lower() == t + "id" else f"{t}_{pk}"


def _map_attribute(attr: Attribute) -> list[Column]:
    """Map an ER attribute to relational columns (flattens composite attributes)."""
    if attr.is_composite and attr.sub_attributes:
        cols: list[Column] = []
        for sub in attr.sub_attributes:
            cols.append(
                Column(
                    name=f"{attr.name}_{sub.name}",
                    type=sub.type,
                    is_pk=attr.is_pk,
                    is_nullable=sub.is_nullable and not attr.is_pk,
                )
            )
        return cols
    return [
        Column(
            name=attr.name,
            type=attr.type,
            is_pk=attr.is_pk,
            is_nullable=attr.is_nullable and not attr.is_pk,
        )
    ]


def er_to_relational(er_model: ERModel) -> RelationalSchema:
    """Transform an ERModel into a normalized RelationalSchema following formal ER-to-relational mapping:
      1. Strong entity -> Base table with PK
      2. Composite attribute -> Flattened columns
      3. Multivalued attribute -> Separate table with composite PK (owner_pk + value)
      4. Weak entity -> Table with owner PK + partial key
      5. 1:1 relationship -> FK on side with total participation (or e2)
      6. 1:N relationship -> FK on the N side
      7. M:N relationship -> Junction table with composite PK of both entity PKs + relationship attributes
      8. Generalization (ISA) -> Table-per-subclass with parent PK
    """
    tables: dict[str, Table] = {}
    entity_dict = {e.name: e for e in er_model.entities}

    # Step 1: Strong Entities
    for entity in er_model.entities:
        if entity.is_weak:
            continue

        cols: list[Column] = []
        pk_cols: list[str] = []
        multivalued_attrs: list[Attribute] = []

        for attr in entity.attributes:
            if attr.is_multivalued:
                multivalued_attrs.append(attr)
                continue
            mapped = _map_attribute(attr)
            cols.extend(mapped)
            if attr.is_pk:
                pk_cols.extend([c.name for c in mapped])

        table_name = entity.name.lower()
        tables[table_name] = Table(
            name=table_name,
            columns=cols,
            primary_key=pk_cols,
            foreign_keys=[],
        )

        # Handle multivalued attributes
        for mv in multivalued_attrs:
            mv_table_name = f"{table_name}_{mv.name.lower()}"
            mv_cols: list[Column] = []
            mv_pk: list[str] = []
            fk_cols: list[str] = []

            for pk in pk_cols:
                pk_col_obj = next((c for c in cols if c.name == pk), None)
                col_type = pk_col_obj.type if pk_col_obj else "INT"
                mv_cols.append(
                    Column(
                        name=pk,
                        type=col_type,
                        is_pk=True,
                        is_fk=True,
                        fk_ref_table=table_name,
                        fk_ref_col=pk,
                        is_nullable=False,
                    )
                )
                mv_pk.append(pk)
                fk_cols.append(pk)

            val_col_name = f"{mv.name.lower()}_val"
            mv_cols.append(
                Column(
                    name=val_col_name,
                    type=mv.type,
                    is_pk=True,
                    is_nullable=False,
                )
            )
            mv_pk.append(val_col_name)

            tables[mv_table_name] = Table(
                name=mv_table_name,
                columns=mv_cols,
                primary_key=mv_pk,
                foreign_keys=[
                    ForeignKeyDef(
                        columns=fk_cols,
                        ref_table=table_name,
                        ref_columns=fk_cols,
                    )
                ],
            )

    # Step 2: Weak Entities
    for entity in er_model.entities:
        if not entity.is_weak:
            continue

        owner_entity = entity_dict.get(entity.owner_entity or "")
        owner_table_name = (owner_entity.name.lower()) if owner_entity else "owner"
        owner_pks = [a.name for a in owner_entity.pk_attributes()] if owner_entity else ["id"]

        cols = []
        pk_cols = []
        fk_cols = []

        # Inherit owner PKs as FK and part of PK
        for pk_name in owner_pks:
            owner_pk_obj = next((a for a in owner_entity.attributes if a.name == pk_name), None) if owner_entity else None
            pk_type = owner_pk_obj.type if owner_pk_obj else "INT"
            col_name = _fk_name(owner_table_name, pk_name)
            cols.append(
                Column(
                    name=col_name,
                    type=pk_type,
                    is_pk=True,
                    is_fk=True,
                    fk_ref_table=owner_table_name,
                    fk_ref_col=pk_name,
                    is_nullable=False,
                )
            )
            pk_cols.append(col_name)
            fk_cols.append(col_name)

        # Add partial keys and other attributes
        for attr in entity.attributes:
            mapped = _map_attribute(attr)
            cols.extend(mapped)
            if attr.name in entity.partial_keys or attr.is_pk:
                pk_cols.extend([c.name for c in mapped])

        table_name = entity.name.lower()
        tables[table_name] = Table(
            name=table_name,
            columns=cols,
            primary_key=pk_cols,
            foreign_keys=[
                ForeignKeyDef(
                    columns=fk_cols,
                    ref_table=owner_table_name,
                    ref_columns=owner_pks,
                )
            ],
        )

    # Step 3: Relationships (1:1, 1:N, M:N)
    for rel in er_model.relationships:
        if len(rel.entities) < 2:
            continue

        e1_name, e2_name = rel.entities[0], rel.entities[1]
        t1_name, t2_name = e1_name.lower(), e2_name.lower()
        t1 = tables.get(t1_name)
        t2 = tables.get(t2_name)

        if not t1 or not t2:
            continue

        if rel.cardinality == "1:1":
            # Add FK to side with total participation, or t2
            part1 = rel.participation.get(e1_name, "partial")
            part2 = rel.participation.get(e2_name, "partial")
            target_table = t1 if part1 == "total" else t2
            ref_table = t2 if target_table == t1 else t1

            fk_cols = []
            for pk in ref_table.primary_key:
                pk_col = next((c for c in ref_table.columns if c.name == pk), None)
                col_name = _fk_name(ref_table.name, pk)
                if any(c.name == col_name for c in target_table.columns):
                    fk_cols.append(col_name)
                    continue
                target_table.columns.append(
                    Column(
                        name=col_name,
                        type=pk_col.type if pk_col else "INT",
                        is_fk=True,
                        fk_ref_table=ref_table.name,
                        fk_ref_col=pk,
                        is_unique=True,
                        is_nullable=True,
                    )
                )
                fk_cols.append(col_name)

            target_table.foreign_keys.append(
                ForeignKeyDef(
                    columns=fk_cols,
                    ref_table=ref_table.name,
                    ref_columns=ref_table.primary_key,
                )
            )

        elif rel.cardinality in ("1:N", "1:M"):
            # FK goes into N-side table (t2)
            fk_cols = []
            for pk in t1.primary_key:
                pk_col = next((c for c in t1.columns if c.name == pk), None)
                col_name = _fk_name(t1.name, pk)
                if not any(c.name == col_name for c in t2.columns):
                    t2.columns.append(
                        Column(
                            name=col_name,
                            type=pk_col.type if pk_col else "INT",
                            is_fk=True,
                            fk_ref_table=t1.name,
                            fk_ref_col=pk,
                            is_nullable=True,
                        )
                    )
                fk_cols.append(col_name)

            t2.foreign_keys.append(
                ForeignKeyDef(
                    columns=fk_cols,
                    ref_table=t1.name,
                    ref_columns=t1.primary_key,
                )
            )

        elif rel.cardinality in ("N:1", "M:1"):
            # FK goes into N-side table (t1)
            fk_cols = []
            for pk in t2.primary_key:
                pk_col = next((c for c in t2.columns if c.name == pk), None)
                col_name = _fk_name(t2.name, pk)
                if not any(c.name == col_name for c in t1.columns):
                    t1.columns.append(
                        Column(
                            name=col_name,
                            type=pk_col.type if pk_col else "INT",
                            is_fk=True,
                            fk_ref_table=t2.name,
                            fk_ref_col=pk,
                            is_nullable=True,
                        )
                    )
                fk_cols.append(col_name)

            t1.foreign_keys.append(
                ForeignKeyDef(
                    columns=fk_cols,
                    ref_table=t2.name,
                    ref_columns=t2.primary_key,
                )
            )

        else:  # M:N Relationship -> Junction Table
            junction_name = rel.name.lower().replace(" ", "_")
            if junction_name in tables:
                junction_name = f"{t1_name}_{junction_name}_{t2_name}"

            j_cols: list[Column] = []
            j_pk: list[str] = []
            j_fks: list[ForeignKeyDef] = []

            # Add PK from t1
            t1_fk_cols = []
            for pk in t1.primary_key:
                pk_col = next((c for c in t1.columns if c.name == pk), None)
                col_name = _fk_name(t1_name, pk)
                j_cols.append(
                    Column(
                        name=col_name,
                        type=pk_col.type if pk_col else "INT",
                        is_pk=True,
                        is_fk=True,
                        fk_ref_table=t1_name,
                        fk_ref_col=pk,
                        is_nullable=False,
                    )
                )
                j_pk.append(col_name)
                t1_fk_cols.append(col_name)

            j_fks.append(
                ForeignKeyDef(
                    columns=t1_fk_cols,
                    ref_table=t1_name,
                    ref_columns=t1.primary_key,
                )
            )

            # Add PK from t2
            t2_fk_cols = []
            for pk in t2.primary_key:
                pk_col = next((c for c in t2.columns if c.name == pk), None)
                col_name = _fk_name(t2_name, pk)
                j_cols.append(
                    Column(
                        name=col_name,
                        type=pk_col.type if pk_col else "INT",
                        is_pk=True,
                        is_fk=True,
                        fk_ref_table=t2_name,
                        fk_ref_col=pk,
                        is_nullable=False,
                    )
                )
                j_pk.append(col_name)
                t2_fk_cols.append(col_name)

            j_fks.append(
                ForeignKeyDef(
                    columns=t2_fk_cols,
                    ref_table=t2_name,
                    ref_columns=t2.primary_key,
                )
            )

            # Add relationship attributes
            for attr in rel.attributes:
                for col in _map_attribute(attr):
                    j_cols.append(col)

            tables[junction_name] = Table(
                name=junction_name,
                columns=j_cols,
                primary_key=j_pk,
                foreign_keys=j_fks,
            )

    # Step 4: Generalizations (ISA) -> Table-per-subclass
    for gen in er_model.generalizations:
        parent_table = tables.get(gen.parent_entity.lower())
        if not parent_table:
            continue

        for child in gen.child_entities:
            child_entity = entity_dict.get(child)
            child_name = child.lower()

            c_cols = []
            c_pk = []
            c_fk = []

            for pk in parent_table.primary_key:
                pk_col = next((c for c in parent_table.columns if c.name == pk), None)
                col_name = pk
                c_cols.append(
                    Column(
                        name=col_name,
                        type=pk_col.type if pk_col else "INT",
                        is_pk=True,
                        is_fk=True,
                        fk_ref_table=parent_table.name,
                        fk_ref_col=pk,
                        is_nullable=False,
                    )
                )
                c_pk.append(col_name)
                c_fk.append(col_name)

            if child_entity:
                for attr in child_entity.attributes:
                    if not attr.is_pk:
                        c_cols.extend(_map_attribute(attr))

            tables[child_name] = Table(
                name=child_name,
                columns=c_cols,
                primary_key=c_pk,
                foreign_keys=[
                    ForeignKeyDef(
                        columns=c_fk,
                        ref_table=parent_table.name,
                        ref_columns=parent_table.primary_key,
                    )
                ],
            )

    return RelationalSchema(tables=list(tables.values()))
