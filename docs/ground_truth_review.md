# Reference-label review

Status: **provisional; no independent human sign-off**.

These explicit fixtures were authored during implementation from the source documents and project definitions, before running any benchmark provider. They are not model-generated benchmark answers and are never derived from a tested model's responses. However, implementation was AI-assisted: calling these independently human-defined ground truth would be misleading. A technically competent human must check and ratify them before using scores as evidence of model superiority. The application runs with this status displayed so implementation can be inspected meanwhile.

Review all four JSON files under `data/ground_truth/` and the source registry. Record your name/date and reasoning here, change `ground_truth_status` in the manifest only after approval, and increment `ground_truth_version`. Changes to any file change the automatic comparison fingerprint; old snapshots remain untouched. The app has no automatic ground-truth editing endpoint.

## Source checks made during implementation

| Component | Official location | Facts used |
|---|---|---|
| Noctua NF-A4x10 5V | Detailed PDF p4 §2.2; p6 §3.1; p7 remarks | 0.05 A rated ±10%; 4500 rpm ±10%; 5 V rated; 4–5.5 V operating; stated test conditions |
| TI TMP117AIDRVR | SNOSD82D p5 §6.3 | 1.8–5.5 V across −55 to 150 °C; 1.7 V is only the lower-temperature subrange minimum |
| TI TPS22919DCKR | SLVSEN5B p1; p4 §§6.1, 6.3 | 1.5 A continuous ceiling; 1.6–5.5 V recommended input; ON high 1–5.5 V, low 0–0.35 V |
| Noctua NF-A4x20 5V, change only | Detailed PDF p4 §2.2; p6 §3.1 | 0.10 A rated ±10%; 5000 rpm ±10%; 5 V rated |
| TI TPS22917DBVR, change only | SLVSDW8B p1 | 2 A continuous ceiling; 1–5.5 V input |

Manufacturer PDFs remain authoritative. Noctua's web summary labels current as maximum while the detailed PDFs label rated current with tolerance; the benchmark follows the PDFs. The alternative TPS22917 is a DBV package, not the baseline TPS22919's DCK package. Substitution is documentary and is not a pin-compatible hardware recommendation.

## Relationship rationale

There are 17 nodes and 11 edges. All Level 1 edges are directly stated in the supplied documents and the bounded graph scope. A fixed ID vocabulary deliberately removes open-world naming ambiguity.

| Source | Relationship | Target | Why |
|---|---|---|---|
| FAN | has_parameter | P-FAN-CURRENT | Fan's current rating |
| FAN | has_parameter | P-FAN-SPEED | Fan's speed rating |
| SENSOR | has_parameter | P-SENSOR-SUPPLY | Sensor's full-temperature voltage envelope |
| DRIVER | has_parameter | P-DRIVER-CURRENT | Switch's published rating |
| REQ-001 | constrains | P-FAN-CURRENT | Project current acceptance criterion |
| REQ-002 | constrains | P-FAN-SPEED | Project speed acceptance criterion |
| REQ-003 | depends_on | CFG-THRESHOLD | Software comparison boundary |
| REQ-004 | depends_on | CFG-SENSOR-SUPPLY | Configured voltage to review |
| REQ-004 | constrains | P-SENSOR-SUPPLY | Adopted recommended envelope |
| REQ-005 | constrains | P-DRIVER-CURRENT | Fixed documentary allocation check |
| REQ-002 | verified_by | V-SPEED | Tachometer verification procedure |

Some scoped nodes have no scored edges. This is intentional: extracting a voltage value does not require scoring every possible voltage relationship in the initial graph.

## Change rationale

| Change | Expected affected requirements | Scope rationale |
|---|---|---|
| CHG-001 fan replacement | 001, 002 | New current/speed evidence; switch allocation is a fixed documentary criterion |
| CHG-002 switch replacement | 005 | New switch's rating document; current/speed tests explicitly hold the fan-terminal operating point fixed |
| CHG-003 tighter current limit | 001 | Acceptance criterion changes |
| CHG-004 higher minimum speed | 002 | Acceptance criterion changes |
| CHG-005 threshold setting | 003 | Injected-temperature decision boundary changes |
| CHG-006 1.7 V sensor rail | 004 | Adopted full-temperature envelope excludes it |
| CHG-007 internal envelope transcription correction | 004 | Review source provenance and accepted envelope; no manufacturer revision is invented |
| CHG-008 display name | None | No technical content changes |
| CHG-009 document formatting | None | Technical content and evidence stay identical |
| CHG-010 real NF-A4x20 5V replacement, L2 | 001, 002 | Review current and speed evidence from ALT-FAN without direct mapping hints |
| CHG-011 5.7 V rail, transfer | 004 | One-step comparison to upper supply envelope |
| CHG-012 5000 rpm product speed target, transfer | 002 | Compare the existing documented fan rating with a new project criterion; no invented component rating |

REQ-001, REQ-004 and REQ-005 are designated critical **for this experiment**, not by a safety certification. The definition is fixed before provider calls and used to count missed requirement/scenario pairs.

Important boundaries: the current and speed tests force ON independently; threshold verification injects a software measured value, not real sensor temperature. Neither a sensor-rail change nor a threshold change propagates into those forced-ON tests. No motor dynamics, sensor latency, airflow, board thermal design or physical response-time claims are inferred. The load switch is on/off control, not current or speed regulation. Datasheet ratings are review inputs, never fabricated hardware passes.

## Human approval record

- Reviewer: pending
- Review date: pending
- Source facts checked: pending
- Relationship direction and completeness checked: pending
- All impact/unaffected labels checked: pending
- Approved ground-truth version: pending

Dataset 1.1 removes the two hypothetical candidate-part ratings. CHG-010 uses the documented alternative fan; CHG-012 changes a product target while keeping the real installed fan. Proposed configuration values remain test inputs, never claimed measurements or manufacturer limits.

## Revisão pela interface

A tela **Gabarito revisável / Reviewable reference** apresenta os 58 itens da referência inicial sem um despejo de JSON. Confirmar ou recusar registra uma decisão humana explícita vinculada ao hash do dataset. Não presumimos que esse registro equivale a revisão independente por especialista. A porcentagem apresentada conta itens confirmados, não resultados de modelos.

Edições de entradas, prompts ou gabarito criam versões locais no SQLite. Não alteram o dataset original do repositório, os arquivos já exportados ou o gabarito de execuções anteriores. A referência efetivamente usada e as decisões de revisão são preservadas no snapshot de cada nova execução. Itens recusados impedem novas chamadas de benchmark nessa versão.
