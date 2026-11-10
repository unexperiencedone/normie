import pytest
from backend.tools.er.models import Attribute, Entity, Relationship, Generalization, ERModel
from backend.tools.er.validator import validate_er
from backend.tools.er.mermaid import render_mermaid
from backend.tools.mapping.er_to_relational import er_to_relational
from backend.tools.mapping.ddl import generate_ddl


def test_er_validation_valid_and_invalid():
    # Valid model
    valid_model = ERModel(
        entities=[
            Entity(
                name="Student",
                attributes=[
                    Attribute(name="student_id", type="INT", is_pk=True),
                    Attribute(name="name", type="VARCHAR(100)"),
                ],
            )
        ]
    )
    ok, errors = validate_er(valid_model)
    assert ok is True
    assert len(errors) == 0

    # Invalid: strong entity without PK
    invalid_model = ERModel(
        entities=[
            Entity(
                name="Student",
                attributes=[
                    Attribute(name="name", type="VARCHAR(100)"),
                ],
            )
        ]
    )
    ok2, errors2 = validate_er(invalid_model)
    assert ok2 is False
    assert any("no primary key" in e for e in errors2)


def test_er_mermaid_render():
    model = ERModel(
        entities=[
            Entity(
                name="Doctor",
                attributes=[
                    Attribute(name="doctor_id", type="INT", is_pk=True),
                    Attribute(name="name", type="VARCHAR(100)"),
                ],
            ),
            Entity(
                name="Patient",
                attributes=[
                    Attribute(name="patient_id", type="INT", is_pk=True),
                    Attribute(name="name", type="VARCHAR(100)"),
                ],
            ),
        ],
        relationships=[
            Relationship(
                name="Treats",
                entities=["Doctor", "Patient"],
                cardinality="M:N",
            )
        ],
    )
    mermaid_str = render_mermaid(model)
    assert "erDiagram" in mermaid_str
    assert "DOCTOR" in mermaid_str
    assert "PATIENT" in mermaid_str
    assert "treats" in mermaid_str


def test_er_to_relational_full_mapping():
    # Model with strong entity, weak entity, 1:N relationship, M:N relationship, and multivalued attribute
    model = ERModel(
        entities=[
            Entity(
                name="Department",
                attributes=[
                    Attribute(name="dept_id", type="INT", is_pk=True),
                    Attribute(name="dept_name", type="VARCHAR(100)"),
                    Attribute(name="locations", type="VARCHAR(100)", is_multivalued=True),
                ],
            ),
            Entity(
                name="Employee",
                attributes=[
                    Attribute(name="emp_id", type="INT", is_pk=True),
                    Attribute(name="emp_name", type="VARCHAR(100)"),
                ],
            ),
            Entity(
                name="Dependent",
                is_weak=True,
                owner_entity="Employee",
                identifying_relationship="Has_Dependent",
                partial_keys=["dep_name"],
                attributes=[
                    Attribute(name="dep_name", type="VARCHAR(100)"),
                    Attribute(name="birth_date", type="DATE"),
                ],
            ),
            Entity(
                name="Project",
                attributes=[
                    Attribute(name="proj_id", type="INT", is_pk=True),
                    Attribute(name="title", type="VARCHAR(100)"),
                ],
            ),
        ],
        relationships=[
            Relationship(
                name="Works_In",
                entities=["Department", "Employee"],
                cardinality="1:N",
            ),
            Relationship(
                name="Works_On",
                entities=["Employee", "Project"],
                cardinality="M:N",
                attributes=[Attribute(name="hours", type="NUMERIC(5,2)")],
            ),
        ],
    )

    schema = er_to_relational(model)
    table_names = {t.name for t in schema.tables}

    # Verify tables created
    assert "department" in table_names
    assert "department_locations" in table_names  # multivalued attribute table
    assert "employee" in table_names
    assert "dependent" in table_names  # weak entity table
    assert "works_on" in table_names or "employee_works_on_project" in table_names  # junction table

    # Verify 1:N FK in employee
    emp_table = next(t for t in schema.tables if t.name == "employee")
    assert any(c.name == "department_dept_id" for c in emp_table.columns)

    # Verify weak entity composite PK
    dep_table = next(t for t in schema.tables if t.name == "dependent")
    assert "employee_emp_id" in dep_table.primary_key
    assert "dep_name" in dep_table.primary_key

    # Generate DDL and check output
    ddl = generate_ddl(schema)
    assert "CREATE TABLE IF NOT EXISTS department" in ddl
    assert "CREATE TABLE IF NOT EXISTS employee" in ddl
    assert "CONSTRAINT pk_department PRIMARY KEY (dept_id)" in ddl
    assert "CREATE INDEX" in ddl
