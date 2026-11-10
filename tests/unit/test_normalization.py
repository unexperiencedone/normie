import pytest
from backend.tools.fd.models import FD
from backend.tools.fd.closure import attribute_closure, candidate_keys, is_superkey
from backend.tools.fd.cover import minimal_cover
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.models import NF
from backend.tools.normalization.chase import is_lossless
from backend.tools.normalization.preservation import preserves_dependencies
from backend.tools.normalization.decompose import decompose_3nf, decompose_bcnf


def test_textbook_closure():
    # R(A, B, C, D, E)
    # F = { A -> B, BC -> E, ED -> A }
    fds = [
        FD({"A"}, {"B"}),
        FD({"B", "C"}, {"E"}),
        FD({"E", "D"}, {"A"}),
    ]
    # Closure of {C, D}
    # {C, D} -> not directly firing yet
    # But what about {C, D, E}? {C, D, E} -> A (from ED->A) -> B (from A->B) => {A, B, C, D, E}
    c_cd = attribute_closure({"C", "D"}, fds)
    assert c_cd == {"C", "D"}

    c_cde = attribute_closure({"C", "D", "E"}, fds)
    assert c_cde == {"A", "B", "C", "D", "E"}

    c_b_c_d = attribute_closure({"B", "C", "D"}, fds)
    # BC -> E, then ED -> A, then A -> B => {A, B, C, D, E}
    assert c_b_c_d == {"A", "B", "C", "D", "E"}


def test_candidate_keys():
    # R(A, B, C, D)
    # F = { A -> B, B -> C, C -> D, D -> A }
    # All attributes should be candidate keys individually: {A}, {B}, {C}, {D}
    fds = [
        FD({"A"}, {"B"}),
        FD({"B"}, {"C"}),
        FD({"C"}, {"D"}),
        FD({"D"}, {"A"}),
    ]
    keys = candidate_keys({"A", "B", "C", "D"}, fds)
    assert len(keys) == 4
    assert {frozenset(["A"]), frozenset(["B"]), frozenset(["C"]), frozenset(["D"])} == set(keys)


def test_minimal_cover():
    # F = { A -> B, B -> C, A -> C, AB -> D }
    # A -> C is redundant (A -> B -> C)
    # in AB -> D, B is extraneous because A -> B
    fds = [
        FD({"A"}, {"B"}),
        FD({"B"}, {"C"}),
        FD({"A"}, {"C"}),
        FD({"A", "B"}, {"D"}),
    ]
    cover = minimal_cover(fds)
    cover_tuples = [(sorted(list(f.lhs)), sorted(list(f.rhs))) for f in cover]
    assert (["A"], ["B"]) in cover_tuples
    assert (["B"], ["C"]) in cover_tuples
    assert (["A"], ["D"]) in cover_tuples
    assert (["A"], ["C"]) not in cover_tuples


def test_normal_forms_analysis():
    # Case 1: 2NF violation (partial dependency)
    # R(StudentID, CourseID, Grade, CourseName)
    # Key: {StudentID, CourseID}
    # FD: CourseID -> CourseName (CourseName non-prime depends on subset of key)
    table1 = {"StudentID", "CourseID", "Grade", "CourseName"}
    fds1 = [
        FD({"StudentID", "CourseID"}, {"Grade"}),
        FD({"CourseID"}, {"CourseName"}),
    ]
    rep1 = check_normal_form(table1, fds1)
    assert rep1.highest_nf == NF.NF1
    assert any(v.normal_form == NF.NF2 for v in rep1.violations)

    # Case 2: 3NF violation (transitive dependency)
    # R(StudentID, Dept, DeptBuilding)
    # Key: {StudentID}
    # FD: StudentID -> Dept, Dept -> DeptBuilding
    # Dept -> DeptBuilding: LHS not superkey, DeptBuilding non-prime
    table2 = {"StudentID", "Dept", "DeptBuilding"}
    fds2 = [
        FD({"StudentID"}, {"Dept"}),
        FD({"Dept"}, {"DeptBuilding"}),
    ]
    rep2 = check_normal_form(table2, fds2)
    assert rep2.highest_nf == NF.NF2
    assert any(v.normal_form == NF.NF3 for v in rep2.violations)

    # Case 3: BCNF achieved
    # R(StudentID, Email) with StudentID -> Email, Email -> StudentID
    table3 = {"StudentID", "Email"}
    fds3 = [
        FD({"StudentID"}, {"Email"}),
        FD({"Email"}, {"StudentID"}),
    ]
    rep3 = check_normal_form(table3, fds3)
    assert rep3.highest_nf == NF.BCNF
    assert len(rep3.violations) == 0


def test_3nf_synthesis_properties():
    # R(A, B, C, D, E)
    # F = { A -> B, BC -> E, ED -> A }
    attrs = {"A", "B", "C", "D", "E"}
    fds = [
        FD({"A"}, {"B"}),
        FD({"B", "C"}, {"E"}),
        FD({"E", "D"}, {"A"}),
    ]
    parts = decompose_3nf(attrs, fds)
    # Verify lossless using chase
    lossless, tableau, order = is_lossless(attrs, parts, fds)
    assert lossless is True

    # Verify dependency preservation
    preserved, unpreserved = preserves_dependencies(attrs, parts, fds)
    assert preserved is True


def test_bcnf_decomposition_properties():
    # Classic BCNF violation: R(City, Street, ZipCode)
    # Keys: {City, Street}, {Street, ZipCode} (if ZipCode -> City)
    # ZipCode -> City violates BCNF because ZipCode is not a superkey
    attrs = {"City", "Street", "ZipCode"}
    fds = [
        FD({"City", "Street"}, {"ZipCode"}),
        FD({"ZipCode"}, {"City"}),
    ]
    parts = decompose_bcnf(attrs, fds)
    assert len(parts) >= 2
    lossless, _, _ = is_lossless(attrs, parts, fds)
    assert lossless is True
