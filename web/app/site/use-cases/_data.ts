
export type Lane = "document" | "software" | "media" | "anyfile";

export type Guarantee = { h: string; p: string };
export type Step = { h: string; p: string };
export type QA = { q: string; a: string };

export type Sector = {
  slug: string;
  name: string;
  built: boolean;
  lane: Lane;
  who: string;
  documents: string[];
  seo: string[];
  eyebrow?: string;
  h1?: string;
  lede?: string;
  metaDescription?: string;
  proves?: Guarantee[];
  webSteps?: Step[];
  cli?: string;
  cliNote?: string;
  example?: { label: string; note: string; proofUrl: string };
  faq?: QA[];
};

export const PROOF: Record<string, string> = {
  law: "https://app.letsseal.org/d/sd_b50fe22546407aa24f08d51120ad5e6a",
  insurance: "https://app.letsseal.org/d/sd_44fde03d6de97836aa3bc7f3d6376abd",
  "software-supply-chain": "",
  compliance: "https://app.letsseal.org/d/sd_10baa15b26867808d52c24ca1e842517",
};

const LAW: Sector = {
  slug: "law",
  name: "Law & legal",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Law",
  h1: "Seal and verify legal documents",
  lede:
    "Executed agreements, deeds, opinions, and court filings that prove their own authenticity — sealed to a published root, timestamped on Bitcoin, and verifiable by any court, counterparty, or regulator. This is how a legal document stands on its own.",
  metaDescription:
    "Seal executed contracts, deeds, and court filings so any court or counterparty can prove they're authentic and unaltered — free, standards-based, verifiable by anyone. Step-by-step in the web app and the CLI.",
  who: "Solicitors, barristers, in-house counsel, paralegals, and eDiscovery teams",
  documents: [
    "Contracts & deeds", "Legal opinions", "Engagement letters", "Wills", "Affidavits",
    "Powers of attorney", "Court filings", "Disclosure bundles", "Settlement agreements",
  ],
  seo: [
    "prove a contract wasn't altered", "tamper-proof legal documents", "timestamp a legal agreement",
    "verify an executed contract", "authenticate a settlement agreement",
  ],
  proves: [
    { h: "The executed version is the version", p: "A changed clause, amount, or date — a single altered byte — fails verification instantly. What was signed is what verifies." },
    { h: "A named signer of record", p: "Every seal names the firm that issued it, chaining to a published root. Not a vague “verified” badge — a specific certificate." },
    { h: "Fixed in time", p: "An OpenTimestamps proof on Bitcoin pins the moment the document existed — decisive for deadlines, priority, and which version came first." },
    { h: "Checked by anyone", p: "Opposing counsel, a court, or a notary confirms the proof at a permalink — free, and standing on public infrastructure rather than on us." },
  ],
  webSteps: [
    { h: "Sign in as your firm", p: "Open app.letsseal.org and sign in. Your firm gets its own certificate authority the first time — every seal you issue chains to it." },
    { h: "Upload the executed PDF", p: "Drop in the signed agreement. Let's Seal seals the whole file with your firm's certificate as a PAdES signature covering every byte." },
    { h: "It's anchored for you", p: "The file's fingerprint is timestamped on Bitcoin and written to the public transparency log. You get back a normal PDF that also verifies." },
    { h: "Share the proof link", p: "Every sealed document has a permanent proof page. Put the link in the closing bundle; anyone opens it to confirm the document is authentic and unchanged." },
  ],
  cli:
    `# Seal an executed agreement under your firm's certificate
$ sealbot seal settlement-agreement.pdf --org examples
sealed   settlement-agreement.pdf
  sha256 9f2c4e…a41b
  proof  https://letsseal.org/d/9f2c4e…a41b
  anchored to Bitcoin · recorded in the transparency log

# Anyone confirms it — public, free, offline-capable
$ sealbot verify settlement-agreement.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Sealing uses your firm's key — an API key or your own instance. Verifying is public: opposing counsel or a court runs it against the portal, or offline with a standard PAdES validator.",
  example: {
    label: "A sealed settlement agreement",
    note: "Open the proof page the way opposing counsel would: it shows the document is authentic, unaltered since sealing, sealed by the issuing firm, and timestamped on Bitcoin.",
    proofUrl: "",
  },
  faq: [
    { q: "Does this replace a wet signature or a notary?", a: "No. A seal proves the document is authentic, unaltered, sealed by your firm, and existed by a date — integrity, issuer, and time. It doesn't witness a person's identity the way a notary does. It's the cryptographic layer beneath whatever signing or witnessing your matter requires." },
    { q: "Can the other side verify without an account?", a: "Yes. Verification is public and free — opposing counsel or a court opens the proof link, or runs the standard tools offline. The proof carries everything they need." },
    { q: "What happens if the document is amended later?", a: "Seal the amended version too. Each version gets its own seal and timestamp, so the record shows exactly what existed when — useful when a dispute turns on which draft was in force." },
    { q: "Is it standards-based and durable?", a: "The seal is a standard PAdES/X.509 signature and an OpenTimestamps Bitcoin anchor — the same primitives courts and auditors already recognise, delivered inside the PDF and verifiable for years." },
  ],
};

const INSURANCE: Sector = {
  slug: "insurance",
  name: "Insurance",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Insurance",
  h1: "Seal and verify insurance documents",
  lede:
    "Policy documents, certificates of insurance, and claims paperwork that carry their own proof — so a broker, a bank, or a contractor can confirm a certificate is genuine in seconds, and forged cover has nowhere to hide.",
  metaDescription:
    "Seal certificates of insurance, policies, and claims documents so anyone can verify they're genuine and unaltered in seconds — free, standards-based, and issued in bulk. Web app and CLI walkthrough.",
  who: "Insurers, brokers, MGAs, loss adjusters, and surveyors",
  documents: [
    "Policy documents", "Certificates of insurance", "Claims paperwork",
    "Loss-adjuster reports", "Surveyor reports", "Binders",
  ],
  seo: [
    "verify certificate of insurance", "authenticate an insurance policy", "fraud-proof claims documents",
    "fake COI detection", "tamper-proof insurance certificate",
  ],
  proves: [
    { h: "A COI that can't be faked", p: "A changed limit, name, or effective date fails verification. The forged certificate-of-insurance problem, closed." },
    { h: "The issuing insurer, named", p: "Every policy and certificate names the insurer or broker that sealed it, chaining to a published root." },
    { h: "The moment of issue, fixed", p: "Issue and cover dates are timestamped on Bitcoin — decisive for cover periods, claims timelines, and disputes." },
    { h: "Verified without a phone call", p: "A bank, a landlord, or a main contractor confirms a certificate at a permalink — instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your business", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority the first time you seal." },
    { h: "Upload the policy or certificate", p: "Drop in the PDF. It's sealed with your certificate (PAdES) over the whole file, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on Bitcoin and written to the public transparency log. The recipient gets a normal PDF that also verifies." },
    { h: "Send the proof link with the certificate", p: "Every document has a permanent proof page. The requesting party opens it to confirm the certificate is genuine and current." },
  ],
  cli:
    `# Seal a single certificate of insurance
$ sealbot seal certificate-of-insurance.pdf --org examples
sealed   certificate-of-insurance.pdf
  proof  https://letsseal.org/d/7b1a9c…e204
  anchored to Bitcoin · recorded in the transparency log

# Issue at volume: seal every policy PDF as it lands in a folder
$ sealbot watch /srv/policies --mode seal --org examples
watching /srv/policies … sealing new & changed PDFs (idempotent)

# A third party confirms a certificate — public, no account
$ sealbot verify certificate-of-insurance.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder or your document pipeline at Let's Seal and every policy leaves already sealed, timestamped, and carrying a proof link — one command, no per-document fee.",
  example: {
    label: "A sealed certificate of insurance",
    note: "This is what a bank or contractor sees when they check a COI: genuine, unaltered, issued by the named insurer, and timestamped — no call to your team required.",
    proofUrl: "",
  },
  faq: [
    { q: "Can I seal thousands of policies automatically?", a: "Yes. Point the CLI or a watched folder at your document pipeline and every PDF leaves already sealed, timestamped, and carrying a proof link. One command per document, no per-seal fee." },
    { q: "How does a third party check a certificate of insurance?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the certificate is genuine, unaltered, and issued by you — with no call to your team." },
    { q: "Does the recipient need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
    { q: "Does this prove the cover is valid?", a: "It proves the certificate is authentic, unaltered, and was issued by you at a fixed time. Whether cover is currently in force is a matter for the policy itself — but nobody can hand over a doctored certificate and pass verification." },
  ],
};

const SOFTWARE: Sector = {
  slug: "software-supply-chain",
  name: "Software supply chain",
  built: true,
  lane: "software",
  eyebrow: "Use cases · Software supply chain",
  h1: "Sign and verify software artifacts, containers & SBOMs",
  lede:
    "Release binaries, container images, and SBOMs signed under your own certificate authority — verifiable with stock cosign, anchored on Bitcoin and a public transparency log. Supply-chain proof that drops into the pipeline you already run.",
  metaDescription:
    "Sign build artifacts, container images, and SBOM/SLSA attestations under your own CA, verifiable with stock cosign — free and open. Step-by-step CLI walkthrough with real verification output.",
  who: "Dev teams, DevOps, platform and security engineers",
  documents: [
    "Build artifacts", "Container images", "SBOMs (SPDX / CycloneDX)",
    "Release binaries", "SLSA provenance attestations",
  ],
  seo: [
    "sign a build artifact free", "cosign-compatible signing", "SBOM attestation",
    "SLSA provenance", "sign a container image", "software supply chain integrity",
  ],
  proves: [
    { h: "The exact bytes that shipped", p: "A signed artifact can't be swapped or tampered — the signature is over its precise contents, and cosign catches any change." },
    { h: "Your own code-signing root", p: "Every signature and attestation chains to a published root you control — no third-party trust list, no Fulcio dependency." },
    { h: "An independent record of the release", p: "Artifacts are timestamped on Bitcoin and recorded in the public transparency log — provable evidence of what shipped, and when." },
    { h: "Verified with stock cosign", p: "Downstream consumers run unmodified cosign — no bespoke tooling, and no dependency on Let's Seal to check a signature." },
  ],
  webSteps: [
    { h: "Create your org and code cert", p: "Sign in at app.letsseal.org and create your organisation. It provisions a code-signing certificate (EKU codeSigning) that cosign recognises." },
    { h: "Get an API key for CI", p: "Generate an API key in Settings and add it to your CI secrets. From here, sealing is one CLI call in the pipeline." },
    { h: "Sign in the pipeline", p: "Run sealbot on your build artifacts, images, and SBOMs (below). Nothing but the digest leaves the runner." },
    { h: "Publish the proof", p: "Ship the signature, cert, and attestation next to the release. Consumers verify with stock cosign — or open the transparency-log record." },
  ],
  cli:
    `# Sign a release artifact (cosign-compatible)
$ sealbot sign-blob app-2.1.0.tar.gz --org examples
signed   app-2.1.0.tar.gz  (cosign-compatible artifact seal)
  sig    app-2.1.0.tar.gz.sig
  cert   app-2.1.0.tar.gz.pem  (+ app-2.1.0.tar.gz.chain.pem)

# Attest an SBOM (SPDX / CycloneDX / SLSA provenance)
$ sealbot attest app-2.1.0.tar.gz --org examples \\
    --predicate sbom.spdx.json --type spdxjson
wrote    app-2.1.0.tar.gz.att.bundle

# Anyone verifies with stock cosign — no Let's Seal required
$ cosign verify-blob --certificate app-2.1.0.tar.gz.pem \\
    --certificate-chain app-2.1.0.tar.gz.chain.pem \\
    --signature app-2.1.0.tar.gz.sig \\
    --certificate-identity-regexp '.*' \\
    --certificate-oidc-issuer-regexp '.*' --insecure-ignore-tlog \\
    app-2.1.0.tar.gz
Verified OK`,
  cliNote:
    "sign-image signs an OCI image in its registry so `cosign verify <image>` works; attest-image attaches an SBOM or SLSA provenance to an image. Everything chains to your own published root.",
  example: {
    label: "A signed release + SBOM attestation",
    note: "The proof here is the verification itself: stock cosign confirms the artifact's signature and the SBOM attestation against your published root — reproducible on any machine.",
    proofUrl: "",
  },
  faq: [
    { q: "Does this work with stock cosign?", a: "Yes. Signatures and attestations verify with unmodified `cosign verify-blob` and `cosign verify-blob-attestation` — the artifacts are cosign's native format, chained to your published root." },
    { q: "Do I need Fulcio or a public Sigstore?", a: "No. Let's Seal is your own CA, so you sign under a root you control and publish. The same cosign commands verify against it, with no keyless-OIDC round trip required." },
    { q: "Container images and SBOMs too?", a: "Yes — `sealbot sign-image` signs an OCI image in its registry, and `sealbot attest` / `attest-image` attach SPDX, CycloneDX, or SLSA provenance that cosign verifies." },
    { q: "Where does the timestamp come from?", a: "Each seal is anchored on Bitcoin via OpenTimestamps and recorded in a public, append-only transparency log — an independent record of the release that doesn't depend on your CI logs." },
  ],
};

const COMPLIANCE: Sector = {
  slug: "compliance",
  name: "Compliance & audit",
  built: true,
  lane: "anyfile",
  eyebrow: "Use cases · Compliance",
  h1: "Tamper-evident compliance & audit evidence",
  lede:
    "Audit trails, evidence, and controlled records that are provably unaltered and independently timestamped — the integrity layer regulators, auditors, and data-integrity frameworks ask for, recorded on a public ledger no one can quietly rewrite.",
  metaDescription:
    "Seal and timestamp audit trails, controlled records, and evidence so any auditor or regulator can prove they're unaltered and contemporaneous — independent of your systems. Web app and CLI.",
  who: "Compliance, risk, quality, and audit teams",
  documents: [
    "Audit trails", "Evidence records", "SOC / ISO evidence",
    "Data-integrity records (ALCOA+)", "Retention records", "Incident logs",
  ],
  seo: [
    "tamper-evident audit trail", "data integrity ALCOA+", "timestamp compliance evidence",
    "prove records weren't altered", "independent audit evidence",
  ],
  proves: [
    { h: "Provably unaltered records", p: "A controlled document or audit log is byte-for-byte as captured — any later edit is caught on verification." },
    { h: "Attributable to a signer", p: "Each record is sealed by your organisation's certificate, chaining to a published root — the attribution auditors expect." },
    { h: "Contemporaneous by construction", p: "Every entry is timestamped on Bitcoin and appended to a public, append-only transparency log — an independent “this existed then”." },
    { h: "Verifiable without your systems", p: "An auditor or regulator checks the record and its timestamp against public infrastructure — no access to, or trust in, your internal systems required." },
  ],
  webSteps: [
    { h: "Sign in as your organisation", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing controlled documents." },
    { h: "Seal controlled documents", p: "Upload reports and evidence PDFs; each is sealed over the whole file and timestamped, so the record is fixed the moment you capture it." },
    { h: "Timestamp raw evidence too", p: "For logs, exports, and forensic files, anchor the file's hash from the CLI — the bytes never leave your machine, only the 32-byte digest." },
    { h: "Hand auditors the proof", p: "Give the auditor the proof link or the .ots file. They verify independently, against Bitcoin and the transparency log." },
  ],
  cli:
    `# Seal a controlled document under your org
$ sealbot seal soc2-evidence-2026-q2.pdf --org examples
sealed   soc2-evidence-2026-q2.pdf
  proof  https://letsseal.org/d/3d5f21…9ac0

# Timestamp any evidence file — only its hash leaves the machine
$ sealbot anchor access-log-2026-06.jsonl --publish
anchored access-log-2026-06.jsonl → access-log-2026-06.jsonl.ots
  proof  https://letsseal.org/d/…

# An auditor re-checks the timestamp against Bitcoin, with stock tooling
$ ots verify access-log-2026-06.jsonl.ots
Success! Bitcoin attests existence as of 2026-06-30`,
  cliNote:
    "Sealing a PDF binds it to your certificate; anchoring a raw file proves existence-and-date without the file ever leaving your machine. Both are recorded in the public transparency log.",
  example: {
    label: "A sealed compliance record",
    note: "The proof page is what you hand an auditor: it shows the record is unaltered, sealed by your organisation, and timestamped on Bitcoin — verifiable without touching your systems.",
    proofUrl: "",
  },
  faq: [
    { q: "Does this satisfy ALCOA+ / data-integrity requirements?", a: "It delivers the integrity and contemporaneous-record pillars cryptographically: each record is attributable to a signer, provably unaltered, and independently timestamped on a public ledger. It complements your quality system; it doesn't replace it." },
    { q: "Can an auditor verify without access to our systems?", a: "Yes — that's the point. They verify the seal and the Bitcoin timestamp against public infrastructure, so the evidence stands even if your systems are unavailable." },
    { q: "What about records we must keep for years?", a: "The seal and the Bitcoin anchor outlive any single vendor. A record sealed today stays verifiable indefinitely, by anyone, with standard tools." },
    { q: "Do sensitive files have to be uploaded?", a: "No. For raw evidence you can anchor just the SHA-256 — the file never leaves your machine, only its 32-byte digest, and the timestamp still verifies against Bitcoin." },
  ],
};

const STUBS: Sector[] = [
  { slug: "intellectual-property", name: "Intellectual property", built: false, lane: "anyfile", who: "Patent & IP attorneys, inventors, R&D teams", documents: ["Invention disclosures", "Prior-art records", "Trade-secret proof", "Design files", "Lab notebooks"], seo: ["prove prior art date", "timestamp an invention", "trade secret existence proof"] },
  { slug: "banking-lending", name: "Banking & lending", built: false, lane: "document", who: "Banks, lenders, fintechs, building societies", documents: ["Statements", "Loan & mortgage agreements", "KYC documents", "Letters of credit", "Guarantees"], seo: ["verify a bank statement is genuine", "tamper-proof loan documents", "authenticate a bank letter"] },
  { slug: "accounting-audit", name: "Accounting & audit", built: false, lane: "document", who: "Accountants, auditors, tax advisers, bookkeepers", documents: ["Financial statements", "Audit reports", "Tax returns", "Management accounts", "SOC reports"], seo: ["verify audited accounts", "tamper-evident financial statements", "authenticate an audit report"] },
  { slug: "investment-asset-management", name: "Investment & asset management", built: false, lane: "document", who: "Fund managers, wealth managers, IFAs, custodians", documents: ["Factsheets & KIIDs", "Prospectuses", "Investor statements", "Capital-call notices", "Proof-of-reserves"], seo: ["verify fund factsheet", "authenticate investor statement", "proof of reserves attestation"] },
  { slug: "construction-engineering", name: "Construction & engineering", built: false, lane: "document", who: "Contractors, architects, structural & civil engineers", documents: ["Building certificates", "Structural calculations", "Inspection reports", "As-built drawings", "Handover packs"], seo: ["verify a building certificate", "tamper-proof inspection report", "authenticate structural calculations"] },
  { slug: "surveying-property-reports", name: "Surveying & property reports", built: false, lane: "document", who: "Chartered surveyors, valuers, EPC assessors", documents: ["Valuation reports", "Homebuyer surveys", "EPCs", "Party-wall awards", "Condition reports"], seo: ["verify a valuation report", "authenticate an EPC", "tamper-proof survey report"] },
  { slug: "property-conveyancing", name: "Property & conveyancing", built: false, lane: "document", who: "Conveyancers, estate & letting agents, developers", documents: ["Title documents", "Transfer deeds (TR1)", "Leases & tenancy agreements", "Inventories", "Property searches"], seo: ["verify a tenancy agreement", "authenticate title deeds", "tamper-proof lease"] },
  { slug: "healthcare", name: "Healthcare", built: false, lane: "document", who: "Hospitals, GPs, clinics, dentists, vets", documents: ["Medical records", "Discharge summaries", "Referral letters", "Fit notes", "Lab & imaging results"], seo: ["verify a medical certificate", "authenticate a fit note", "tamper-proof medical records"] },
  { slug: "pharma-life-sciences", name: "Pharma & life sciences", built: false, lane: "anyfile", who: "Pharma, CROs, clinical trials, medical devices", documents: ["Batch records", "Certificates of analysis", "Trial data", "GMP documents", "Regulatory submissions"], seo: ["data integrity ALCOA+", "verify certificate of analysis", "tamper-evident batch record"] },
  { slug: "education-credentials", name: "Education & credentials", built: false, lane: "document", who: "Universities, colleges, awarding & professional bodies", documents: ["Degree certificates", "Transcripts", "Diplomas", "Enrolment letters", "CPD records"], seo: ["verify a degree certificate", "authenticate a transcript", "digital credential verification free"] },
  { slug: "government-public-sector", name: "Government & public sector", built: false, lane: "document", who: "Councils, agencies, regulators, courts, registrars", documents: ["Permits & licences", "Planning permissions", "Benefit & tax letters", "Court orders", "Official certificates"], seo: ["verify a government letter", "authenticate a permit", "tamper-proof official document"] },
  { slug: "hr-corporate", name: "HR & corporate", built: false, lane: "document", who: "HR teams, company secretaries, boards, startups", documents: ["Employment contracts", "Offer & reference letters", "Payslips & P60s", "Board minutes", "Share certificates"], seo: ["verify an employment reference", "authenticate a payslip", "tamper-proof board minutes"] },
  { slug: "procurement-supply-chain", name: "Procurement & supply chain", built: false, lane: "document", who: "Buyers, suppliers, tender teams, trade finance", documents: ["Purchase orders", "Contracts & NDAs", "Tender submissions", "Invoices", "Certificates of origin"], seo: ["timestamp a tender submission", "verify a certificate of origin", "tamper-proof invoice"] },
  { slug: "manufacturing-trade", name: "Manufacturing & trade", built: false, lane: "anyfile", who: "Manufacturers, logistics, food & agri, automotive", documents: ["Certificates of conformity", "Mill / material certs", "Test reports", "Bills of lading", "Customs documents"], seo: ["verify certificate of conformity", "authenticate a mill certificate", "product provenance proof"] },
  { slug: "media-journalism", name: "Media, journalism & creative", built: false, lane: "media", who: "Photographers, newsrooms, publishers, artists, film", documents: ["Photos & video", "Published articles", "Master files", "Brand assets", "Creative sign-offs"], seo: ["prove a photo is real", "anti-deepfake content credentials", "image provenance C2PA free"] },
  { slug: "individuals-freelancers", name: "Individuals & freelancers", built: false, lane: "anyfile", who: "Anyone with a file worth proving", documents: ["Personal agreements", "Creative work", "Important documents", "Photos / video", "Freelance deliverables"], seo: ["prove I wrote this first", "free document timestamp", "prove a file hasn't changed"] },
];

export const SECTORS: Sector[] = [LAW, INSURANCE, SOFTWARE, COMPLIANCE, ...STUBS];

export const BUILT_SECTORS = SECTORS.filter((s) => s.built);

export function getSector(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug && s.built);
}

export const JOBS: { n: string; h: string; p: string }[] = [
  { n: "01", h: "Prove authenticity & integrity", p: "Show a document is genuine and hasn't been altered since issue — the anti-forgery, anti-tamper case." },
  { n: "02", h: "Timestamp — prove it existed", p: "Prove a file existed by a certain date: prior art, priority, deadlines, “I had this first”." },
  { n: "03", h: "Prove authorship & provenance", p: "Show who created or issued a work — for IP, attribution, and anti-plagiarism." },
  { n: "04", h: "Bulk-issue verifiable documents", p: "Seal thousands of statements, certificates, or invoices automatically inside an existing workflow." },
  { n: "05", h: "Media provenance vs. deepfakes", p: "Content Credentials on photos and video: this is real, this is who shot it, this is unedited." },
  { n: "06", h: "Evidence & chain of custody", p: "Forensic files, disclosure, incident records — provably unchanged from collection onward." },
  { n: "07", h: "Software supply-chain integrity", p: "Sign build artifacts, containers, and SBOMs; prove a release is genuine and untampered." },
  { n: "08", h: "Verifiable credentials", p: "Degrees, licences, memberships, and certificates anyone can check without phoning the issuer." },
  { n: "09", h: "Long-term archival integrity", p: "Records that must stay provable for years — the seal and Bitcoin anchor outlive any single vendor." },
  { n: "10", h: "Regulatory & compliance evidence", p: "Audit trails, data integrity, retention — provable, timestamped, and independently checkable." },
];

export const FORMS: { for: string; form: string }[] = [
  { for: "PDF", form: "PAdES (embedded)" },
  { for: "Images / video / audio", form: "C2PA Content Credentials" },
  { for: "XML", form: "XML-DSig" },
  { for: "Email", form: "S/MIME" },
  { for: "Any other file", form: "detached CMS .sig" },
  { for: "Code & artifacts", form: "cosign-compatible" },
];
