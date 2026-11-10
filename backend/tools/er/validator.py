from __future__ import annotations
from backend.tools.er.models import ERModel


def validate_er(er_model: ERModel) -> tuple[bool, list[str]]:
    """Validate that the ER model conforms to database design constraints:
    - Every strong entity must have a designated primary key.
    - Weak entities must have owner entities and partial keys.
    - Relationships must reference existing entities.
    - Generalizations must reference existing entities.
    """
    errors: list[str] = []
    entity_names = {e.name for e in er_model.entities}

    if not er_model.entities:
        errors.append("ER model must contain at least one entity.")

    for entity in er_model.entities:
        if not entity.is_weak:
            pk_attrs = entity.pk_attributes()
            if not pk_attrs:
                errors.append(f"Strong entity '{entity.name}' has no primary key defined.")
        else:
            if not entity.owner_entity:
                errors.append(f"Weak entity '{entity.name}' must have an owner_entity defined.")
            elif entity.owner_entity not in entity_names:
                errors.append(f"Weak entity '{entity.name}' references non-existent owner '{entity.owner_entity}'.")

            if not entity.partial_keys:
                errors.append(f"Weak entity '{entity.name}' must have at least one partial key attribute.")

    for rel in er_model.relationships:
        if len(rel.entities) < 2:
            errors.append(f"Relationship '{rel.name}' must connect at least two entities.")
        for ent in rel.entities:
            if ent not in entity_names:
                errors.append(f"Relationship '{rel.name}' references non-existent entity '{ent}'.")

        if rel.cardinality not in {"1:1", "1:N", "M:N", "N:1"}:
            errors.append(f"Relationship '{rel.name}' has invalid cardinality '{rel.cardinality}'.")

    for gen in er_model.generalizations:
        if gen.parent_entity not in entity_names:
            errors.append(f"Generalization parent '{gen.parent_entity}' does not exist.")
        for child in gen.child_entities:
            if child not in entity_names:
                errors.append(f"Generalization child '{child}' does not exist.")

    return len(errors) == 0, errors
