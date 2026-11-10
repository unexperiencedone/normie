import pytest
from backend.tools.sql.validator import validate_sql, RoleSchemaContext
from backend.tools.sql.algebra import to_relational_algebra


def test_validator_rejects_stacked_statements():
    res = validate_sql("SELECT * FROM student; DROP TABLE student;")
    assert res.ok is False
    assert "Stacked statements" in str(res.reason)


def test_validator_rejects_denied_functions():
    res = validate_sql("SELECT name FROM student WHERE id = pg_sleep(5);")
    assert res.ok is False
    assert "restricted" in str(res.reason).lower() or "forbidden" in str(res.reason).lower()


def test_validator_enforces_where_on_writes():
    # UPDATE without WHERE
    res_up = validate_sql("UPDATE student SET name = 'Alice';")
    assert res_up.ok is False
    assert "WHERE clause" in str(res_up.reason)

    # DELETE without WHERE
    res_del = validate_sql("DELETE FROM student;")
    assert res_del.ok is False
    assert "WHERE clause" in str(res_del.reason)

    # DELETE with WHERE is accepted
    res_ok = validate_sql("DELETE FROM student WHERE student_id = 10;")
    assert res_ok.ok is True


def test_validator_role_access_control():
    receptionist = RoleSchemaContext(
        role_name="receptionist",
        allowed_statements=["SELECT"],
        visible_tables={"patient", "appointment"},
        visible_columns={"patient": {"patient_id", "name", "phone"}},
    )

    # Allowed query
    res1 = validate_sql("SELECT name FROM patient WHERE patient_id = 1", role_context=receptionist)
    assert res1.ok is True

    # Unauthorized table
    res2 = validate_sql("SELECT * FROM doctor_salary", role_context=receptionist)
    assert res2.ok is False
    assert "not accessible" in str(res2.reason)

    # Unauthorized statement type
    res3 = validate_sql("DELETE FROM patient WHERE patient_id = 1", role_context=receptionist)
    assert res3.ok is False
    assert "not authorized" in str(res3.reason)


def test_validator_injects_limit():
    res = validate_sql("SELECT name FROM student WHERE grade > 80")
    assert res.ok is True
    assert "LIMIT 1000" in res.sanitized_sql


def test_relational_algebra_generator():
    sql = "SELECT s.name FROM student s JOIN enrollment e ON s.id = e.student_id WHERE e.grade > 80"
    res = to_relational_algebra(sql)
    assert "π_" in res.unicode_str
    assert "σ_" in res.unicode_str
    assert "⋈" in res.unicode_str
    assert "\\pi" in res.latex_str
    assert "PROJECTION" in res.operators
    assert "SELECTION" in res.operators
    assert "JOIN" in res.operators
