from backend.tools.normalization.models import NF, NormalFormReport, Violation
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.chase import is_lossless
from backend.tools.normalization.preservation import preserves_dependencies
from backend.tools.normalization.decompose import decompose_3nf, decompose_bcnf

__all__ = [
    "NF",
    "NormalFormReport",
    "Violation",
    "check_normal_form",
    "is_lossless",
    "preserves_dependencies",
    "decompose_3nf",
    "decompose_bcnf",
]
