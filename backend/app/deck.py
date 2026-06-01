"""Single source of truth for the presentation's clinical content.

This module is deliberately the *only* place slide content is defined. Both the
on-screen deck (served to the frontend) and the voice agent's grounding prompt
(assembled in ``assistant.py``) are derived from this list, so the two can never
drift apart. In a regulated pharma setting that drift, the screen showing one
efficacy figure while the agent speaks another, is a compliance defect, not a
cosmetic bug. Keeping one source removes the possibility by construction.

Clinical facts below are drawn from the public DUPIXENT (dupilumab) FDA label and
the LIBERTY AD SOLO 1 / SOLO 2 pivotal trials. They are illustrative content for a
demo, not medical advice.
"""

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Slide:
    """One slide. ``id`` is 1-based to match how a presenter refers to slides
    ("go to slide 3") and how the ``goto_slide`` tool argument is defined."""

    id: int
    title: str
    bullets: list[str]
    # Spoken-delivery guidance for the voice agent. Fed into the system prompt so
    # the agent narrates like a presenter instead of reading bullets verbatim.
    speaker_notes: str

    def to_dict(self) -> dict:
        return asdict(self)


DECK: list[Slide] = [
    Slide(
        id=1,
        title="DUPIXENT (dupilumab): Overview",
        bullets=[
            "Fully human monoclonal antibody",
            "First targeted biologic approved for moderate-to-severe atopic dermatitis in adults",
            "Approved across multiple type 2 inflammatory conditions: atopic dermatitis, "
            "asthma, chronic rhinosinusitis with nasal polyps (CRSwNP), eosinophilic "
            "esophagitis (EoE), prurigo nodularis, and COPD with eosinophilic phenotype",
            "Targeted mechanism, not a broad systemic immunosuppressant",
        ],
        speaker_notes=(
            "Open by positioning Dupixent as a targeted biologic, not a broad "
            "immunosuppressant. That distinction is what HCPs care about first. "
            "It was the first biologic approved for moderate-to-severe atopic "
            "dermatitis in adults and has since expanded across type 2 inflammatory "
            "diseases."
        ),
    ),
    Slide(
        id=2,
        title="Mechanism of Action",
        bullets=[
            "Binds the IL-4 receptor alpha (IL-4Ralpha) subunit",
            "That subunit is shared by both IL-4 and IL-13 signaling",
            "Blocking it inhibits signaling of both cytokines at once",
            "IL-4 and IL-13 are central drivers of type 2 inflammation",
            "Net effect: dampens the type 2 inflammatory response underlying these diseases",
        ],
        speaker_notes=(
            "The key mechanistic insight: by binding the shared IL-4 receptor alpha "
            "subunit, one antibody blocks both IL-4 and IL-13 signaling. Those two "
            "cytokines are the central drivers of type 2 inflammation, which is why a "
            "single target produces effects across several type 2 diseases."
        ),
    ),
    Slide(
        id=3,
        title="Efficacy: Atopic Dermatitis (SOLO 1 / SOLO 2)",
        bullets=[
            "Pivotal 16-week monotherapy trials in adults with moderate-to-severe AD",
            "Clear or almost-clear skin (IGA 0/1): 38% (SOLO 1) and 36% (SOLO 2) on "
            "Dupixent q2w vs 10% and 9% on placebo",
            "EASI-75 (>=75% skin improvement): 51% (SOLO 1) and 44% (SOLO 2) vs 15% and "
            "12% on placebo",
            "Significant reduction in itch (pruritus NRS) versus placebo",
        ],
        speaker_notes=(
            "Ground efficacy in the two identically-designed pivotal trials, SOLO 1 and "
            "SOLO 2. At 16 weeks, roughly a third of patients reached clear or almost-"
            "clear skin versus about one in ten on placebo, and about half achieved "
            "EASI-75. Itch reduction is the outcome patients feel first, so call it out."
        ),
    ),
    Slide(
        id=4,
        title="Dosing & Administration",
        bullets=[
            "Subcutaneous injection",
            "Adult atopic dermatitis: 600 mg loading dose (two 300 mg injections), then "
            "300 mg every two weeks",
            "Can be self-administered after training, or given by a caregiver",
            "No routine laboratory monitoring required",
            "Dosing varies by indication and age; confirm against the prescribing information",
        ],
        speaker_notes=(
            "Walk through dosing simply: a 600 mg loading dose given as two injections, "
            "then 300 mg every two weeks for adult atopic dermatitis. Emphasize the two "
            "practical advantages HCPs ask about: it can be self-administered after "
            "training, and there's no routine lab monitoring. Only state the adult "
            "atopic dermatitis regimen shown here; if asked about dosing for other "
            "indications, don't improvise. Say it's outside what you can share and "
            "offer to connect them with Medical Information."
        ),
    ),
    Slide(
        id=5,
        title="Safety Profile",
        bullets=[
            "Most common adverse reactions: injection-site reactions, conjunctivitis, "
            "and nasopharyngitis",
            "Warnings: hypersensitivity reactions (including rare anaphylaxis)",
            "Conjunctivitis and keratitis: advise patients to report new or worsening "
            "eye symptoms",
            "Caution with pre-existing eosinophilic conditions",
            "Treat pre-existing helminth (parasitic) infections before initiating",
        ],
        speaker_notes=(
            "Lead with the most common adverse reactions: injection-site reactions, "
            "conjunctivitis, and nasopharyngitis. Then the clinically important warnings: "
            "hypersensitivity, the ocular signal (conjunctivitis and keratitis), caution "
            "with eosinophilic conditions, and treating helminth infections first. Keep "
            "it factual and on-label."
        ),
    ),
    Slide(
        id=6,
        title="Access & Patient Support",
        bullets=[
            "Typically dispensed through specialty pharmacy",
            "Often requires prior authorization; benefits verification supports the process",
            "Manufacturer patient-support program: copay assistance for eligible "
            "commercially-insured patients, plus nursing and injection-training support",
            "Onboarding and adherence support across the patient journey",
        ],
        speaker_notes=(
            "Close on the practical path to therapy: specialty pharmacy dispensing, prior "
            "authorization with benefits verification, and the manufacturer support "
            "program: copay assistance for eligible commercially-insured patients plus "
            "nursing and injection training. This is the onboarding and adherence layer "
            "that determines whether a prescription becomes a patient on therapy."
        ),
    ),
]


def deck_as_dicts() -> list[dict]:
    """Slides serialized for the frontend."""
    return [s.to_dict() for s in DECK]
