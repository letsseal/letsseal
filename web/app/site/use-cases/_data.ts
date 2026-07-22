
export type Lane = "document" | "software" | "media" | "anyfile";

export type Guarantee = { h: string; p: string };
export type Step = { h: string; p: string };
export type QA = { q: string; a: string };
export type Example = { label: string; note: string; proofUrl?: string };

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
  examples?: Example[];
  faq?: QA[];
};

export function primaryProof(s: Sector): Example | undefined {
  return s.examples?.find((e) => e.proofUrl);
}

const LAW: Sector = {
  slug: "law",
  name: "Law & legal",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Law",
  h1: "Seal and verify legal documents",
  lede:
    "Executed agreements, deeds, opinions, and court filings that prove their own authenticity, sealed to a published root, timestamped on the blockchain, and verifiable by any court, counterparty, or regulator. This is how a legal document stands on its own.",
  metaDescription:
    "Seal executed contracts, deeds, and court filings so any court or counterparty can prove they're authentic and unaltered, free, standards-based, verifiable by anyone. Step-by-step in the web app and the CLI.",
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
    { h: "The executed version is the version", p: "A changed clause, amount, or date, a single altered byte, fails verification instantly. What was signed is what verifies." },
    { h: "A named signer of record", p: "Every seal names the firm that issued it, chaining to a published root. Not a vague “verified” badge, a specific certificate." },
    { h: "Fixed in time", p: "An OpenTimestamps proof on the blockchain pins the moment the document existed, decisive for deadlines, priority, and which version came first." },
    { h: "Checked by anyone", p: "Opposing counsel, a court, or a notary confirms the proof at a permalink, free, and standing on public infrastructure rather than on us." },
  ],
  webSteps: [
    { h: "Sign in as your firm", p: "Open app.letsseal.org and sign in. Your firm gets its own certificate authority the first time. Every seal you issue chains to it." },
    { h: "Upload the executed PDF", p: "Drop in the signed agreement. Let's Seal seals the whole file with your firm's certificate as a PAdES signature covering every byte." },
    { h: "It's anchored for you", p: "The file's fingerprint is timestamped on the blockchain and written to the public transparency log. You get back a normal PDF that also verifies." },
    { h: "Share the proof link", p: "Every sealed document has a permanent proof page. Put the link in the closing bundle; anyone opens it to confirm the document is authentic and unchanged." },
  ],
  cli:
    `# Seal an executed agreement under your firm's certificate
$ sealbot seal settlement-agreement.pdf --org examples
sealed   settlement-agreement.pdf
  sha256 9f2c4e…a41b
  proof  https://letsseal.org/d/9f2c4e…a41b
  anchored to the blockchain · recorded in the transparency log

# Anyone confirms it, public, free, offline-capable
$ sealbot verify settlement-agreement.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Sealing uses your firm's key, an API key or your own instance. Verifying is public: opposing counsel or a court runs it against the portal, or offline with a standard PAdES validator.",
  examples: [
    { label: "A sealed settlement agreement", note: "Open the proof page the way opposing counsel would: it shows the document is authentic, unaltered since sealing, sealed by the issuing firm, and timestamped on the blockchain.", proofUrl: "https://app.letsseal.org/d/sd_32d613e740929448b626fe9c5f6000e0" },
    { label: "An executed contract or deed", note: "The same holds for any executed agreement, a share purchase, a lease, a loan agreement: seal the signed PDF and the exact executed version is the one that verifies. A changed clause or amount is caught instantly." },
    { label: "A legal opinion or engagement letter", note: "Advice and engagement terms sealed under the firm's certificate, so a client or regulator can confirm the document they hold is the one the firm actually issued." },
    { label: "A disclosure bundle in litigation", note: "Seal each item as it's collected and the bundle is provably unchanged from disclosure onward, a clean chain of custody an opponent can't dispute." },
  ],
  faq: [
    { q: "Does this replace a wet signature or a notary?", a: "No. A seal proves the document is authentic, unaltered, sealed by your firm, and existed by a date, integrity, issuer, and time. It doesn't witness a person's identity the way a notary does. It's the cryptographic layer beneath whatever signing or witnessing your matter requires." },
    { q: "Can the other side verify without an account?", a: "Yes. Verification is public and free. Opposing counsel or a court opens the proof link, or runs the standard tools offline. The proof carries everything they need." },
    { q: "What happens if the document is amended later?", a: "Seal the amended version too. Each version gets its own seal and timestamp, so the record shows exactly what existed when, useful when a dispute turns on which draft was in force." },
    { q: "Is it standards-based and durable?", a: "The seal is a standard PAdES/X.509 signature and an OpenTimestamps blockchain anchor, the same primitives courts and auditors already recognise, delivered inside the PDF and verifiable for years." },
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
    "Policy documents, certificates of insurance, and claims paperwork that carry their own proof, so a broker, a bank, or a contractor can confirm a certificate is genuine in seconds, and forged cover has nowhere to hide.",
  metaDescription:
    "Seal certificates of insurance, policies, and claims documents so anyone can verify they're genuine and unaltered in seconds, free, standards-based, and issued in bulk. Web app and CLI walkthrough.",
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
    { h: "The moment of issue, fixed", p: "Issue and cover dates are timestamped on the blockchain, decisive for cover periods, claims timelines, and disputes." },
    { h: "Verified without a phone call", p: "A bank, a landlord, or a main contractor confirms a certificate at a permalink, instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your business", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority the first time you seal." },
    { h: "Upload the policy or certificate", p: "Drop in the PDF. It's sealed with your certificate (PAdES) over the whole file, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The recipient gets a normal PDF that also verifies." },
    { h: "Send the proof link with the certificate", p: "Every document has a permanent proof page. The requesting party opens it to confirm the certificate is genuine and current." },
  ],
  cli:
    `# Seal a single certificate of insurance
$ sealbot seal certificate-of-insurance.pdf --org examples
sealed   certificate-of-insurance.pdf
  proof  https://letsseal.org/d/7b1a9c…e204
  anchored to the blockchain · recorded in the transparency log

# Issue at volume: seal every policy PDF as it lands in a folder
$ sealbot watch /srv/policies --mode seal --org examples
watching /srv/policies … sealing new & changed PDFs (idempotent)

# A third party confirms a certificate, public, no account
$ sealbot verify certificate-of-insurance.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder or your document pipeline at Let's Seal and every policy leaves already sealed, timestamped, and carrying a proof link, one command, no per-document fee.",
  examples: [
    { label: "A sealed certificate of insurance", note: "This is what a bank or contractor sees when they check a COI: genuine, unaltered, issued by the named insurer, and timestamped, no call to your team required.", proofUrl: "https://app.letsseal.org/d/sd_f02690a1d8ed809171686486be2aed10" },
    { label: "A policy document or schedule", note: "Seal the policy wording and schedule so the insured, and any lender relying on it, can confirm the cover terms are exactly as issued, with nothing altered." },
    { label: "A loss-adjuster or surveyor report", note: "A claims report sealed the moment it's finalised: provably the version that was filed, timestamped, and attributable to the adjuster who produced it." },
    { label: "A binder or cover note", note: "Interim cover confirmations sealed on issue, so a broker or client can verify the binder is genuine and current before the full policy follows." },
  ],
  faq: [
    { q: "Can I seal thousands of policies automatically?", a: "Yes. Point the CLI or a watched folder at your document pipeline and every PDF leaves already sealed, timestamped, and carrying a proof link. One command per document, no per-seal fee." },
    { q: "How does a third party check a certificate of insurance?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the certificate is genuine, unaltered, and issued by you, with no call to your team." },
    { q: "Does the recipient need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
    { q: "Does this prove the cover is valid?", a: "It proves the certificate is authentic, unaltered, and was issued by you at a fixed time. Whether cover is currently in force is a matter for the policy itself, but nobody can hand over a doctored certificate and pass verification." },
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
    "Release binaries, container images, and SBOMs signed under your own certificate authority, verifiable with stock cosign, anchored on the blockchain and a public transparency log. Supply-chain proof that drops into the pipeline you already run.",
  metaDescription:
    "Sign build artifacts, container images, and SBOM/SLSA attestations under your own CA, verifiable with stock cosign, free and open. Step-by-step CLI walkthrough with real verification output.",
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
    { h: "The exact bytes that shipped", p: "A signed artifact can't be swapped or tampered. The signature is over its precise contents, and cosign catches any change." },
    { h: "Your own code-signing root", p: "Every signature and attestation chains to a published root you control, no third-party trust list, no Fulcio dependency." },
    { h: "An independent record of the release", p: "Artifacts are timestamped on the blockchain and recorded in the public transparency log, provable evidence of what shipped, and when." },
    { h: "Verified with stock cosign", p: "Downstream consumers run unmodified cosign, no bespoke tooling, and no dependency on Let's Seal to check a signature." },
  ],
  webSteps: [
    { h: "Create your org and code cert", p: "Sign in at app.letsseal.org and create your organisation. It provisions a code-signing certificate (EKU codeSigning) that cosign recognises." },
    { h: "Get an API key for CI", p: "Generate an API key in Settings and add it to your CI secrets. From here, sealing is one CLI call in the pipeline." },
    { h: "Sign in the pipeline", p: "Run sealbot on your build artifacts, images, and SBOMs (below). Nothing but the digest leaves the runner." },
    { h: "Publish the proof", p: "Ship the signature, cert, and attestation next to the release. Consumers verify with stock cosign, or open the transparency-log record." },
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

# Anyone verifies with stock cosign, no Let's Seal required
$ cosign verify-blob --certificate app-2.1.0.tar.gz.pem \\
    --certificate-chain app-2.1.0.tar.gz.chain.pem \\
    --signature app-2.1.0.tar.gz.sig \\
    --certificate-identity-regexp '.*' \\
    --certificate-oidc-issuer-regexp '.*' --insecure-ignore-tlog \\
    app-2.1.0.tar.gz
Verified OK`,
  cliNote:
    "sign-image signs an OCI image in its registry so `cosign verify <image>` works; attest-image attaches an SBOM or SLSA provenance to an image. Everything chains to your own published root.",
  examples: [
    { label: "A signed release artifact", note: "The proof here is the verification itself: stock cosign confirms the artifact's signature against your published root, reproducible on any machine, no Let's Seal required." },
    { label: "A container image", note: "Sign an OCI image in its registry so `cosign verify <image>` passes for anyone pulling it, provenance that travels with the image." },
    { label: "An SBOM or SLSA provenance attestation", note: "Attach an SPDX or CycloneDX SBOM, or SLSA build provenance, as a cosign attestation, a signed, timestamped statement of what's in the release and how it was built." },
  ],
  faq: [
    { q: "Does this work with stock cosign?", a: "Yes. Signatures and attestations verify with unmodified `cosign verify-blob` and `cosign verify-blob-attestation`. The artifacts are cosign's native format, chained to your published root." },
    { q: "Do I need Fulcio or a public Sigstore?", a: "No. Let's Seal is your own CA, so you sign under a root you control and publish. The same cosign commands verify against it, with no keyless-OIDC round trip required." },
    { q: "Container images and SBOMs too?", a: "Yes, `sealbot sign-image` signs an OCI image in its registry, and `sealbot attest` / `attest-image` attach SPDX, CycloneDX, or SLSA provenance that cosign verifies." },
    { q: "Where does the timestamp come from?", a: "Each seal is anchored on the blockchain via OpenTimestamps and recorded in a public, append-only transparency log, an independent record of the release that doesn't depend on your CI logs." },
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
    "Audit trails, evidence, and controlled records that are provably unaltered and independently timestamped, the integrity layer regulators, auditors, and data-integrity frameworks ask for, recorded on a public ledger no one can quietly rewrite.",
  metaDescription:
    "Seal and timestamp audit trails, controlled records, and evidence so any auditor or regulator can prove they're unaltered and contemporaneous, independent of your systems. Web app and CLI.",
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
    { h: "Provably unaltered records", p: "A controlled document or audit log is byte-for-byte as captured. Any later edit is caught on verification." },
    { h: "Attributable to a signer", p: "Each record is sealed by your organisation's certificate, chaining to a published root, the attribution auditors expect." },
    { h: "Contemporaneous by construction", p: "Every entry is timestamped on the blockchain and appended to a public, append-only transparency log, an independent “this existed then”." },
    { h: "Verifiable without your systems", p: "An auditor or regulator checks the record and its timestamp against public infrastructure, no access to, or trust in, your internal systems required." },
  ],
  webSteps: [
    { h: "Sign in as your organisation", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing controlled documents." },
    { h: "Seal controlled documents", p: "Upload reports and evidence PDFs; each is sealed over the whole file and timestamped, so the record is fixed the moment you capture it." },
    { h: "Timestamp raw evidence too", p: "For logs, exports, and forensic files, anchor the file's hash from the CLI. The bytes never leave your machine, only the 32-byte digest." },
    { h: "Hand auditors the proof", p: "Give the auditor the proof link or the .ots file. They verify independently, against the blockchain and the transparency log." },
  ],
  cli:
    `# Seal a controlled document under your org
$ sealbot seal soc2-evidence-2026-q2.pdf --org examples
sealed   soc2-evidence-2026-q2.pdf
  proof  https://letsseal.org/d/3d5f21…9ac0

# Timestamp any evidence file. Only its hash leaves the machine
$ sealbot anchor access-log-2026-06.jsonl --publish
anchored access-log-2026-06.jsonl → access-log-2026-06.jsonl.ots
  proof  https://letsseal.org/d/…

# An auditor re-checks the timestamp against the blockchain, with stock tooling
$ ots verify access-log-2026-06.jsonl.ots
Success! Bitcoin attests existence as of 2026-06-30`,
  cliNote:
    "Sealing a PDF binds it to your certificate; anchoring a raw file proves existence-and-date without the file ever leaving your machine. Both are recorded in the public transparency log.",
  examples: [
    { label: "A sealed compliance record", note: "The proof page is what you hand an auditor: it shows the record is unaltered, sealed by your organisation, and timestamped on the blockchain, verifiable without touching your systems.", proofUrl: "https://app.letsseal.org/d/sd_49f81a644d737fef3dc7a3cf8bf1634f" },
    { label: "SOC 2 / ISO evidence", note: "Seal each piece of control evidence as it's captured, so an assessor can confirm it's the contemporaneous record, not something assembled the night before the audit." },
    { label: "A raw access or incident log", note: "Anchor a log file's hash, the file never leaves your machine, only its digest, and prove it existed unchanged as of that date, independent of your SIEM." },
    { label: "A retention or data-integrity record", note: "GxP / ALCOA+ records sealed and timestamped on capture, giving the attributable, contemporaneous, unaltered evidence data-integrity frameworks ask for." },
  ],
  faq: [
    { q: "Does this satisfy ALCOA+ / data-integrity requirements?", a: "It delivers the integrity and contemporaneous-record pillars cryptographically: each record is attributable to a signer, provably unaltered, and independently timestamped on a public ledger. It complements your quality system; it doesn't replace it." },
    { q: "Can an auditor verify without access to our systems?", a: "Yes. That's the point. They verify the seal and the blockchain timestamp against public infrastructure, so the evidence stands even if your systems are unavailable." },
    { q: "What about records we must keep for years?", a: "The seal and the blockchain anchor outlive any single vendor. A record sealed today stays verifiable indefinitely, by anyone, with standard tools." },
    { q: "Do sensitive files have to be uploaded?", a: "No. For raw evidence you can anchor just the SHA-256. The file never leaves your machine, only its 32-byte digest, and the timestamp still verifies against the blockchain." },
  ],
};

const PROPERTY: Sector = {
  slug: "property-conveyancing",
  name: "Property & conveyancing",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Property",
  h1: "Seal and verify property & conveyancing documents",
  lede:
    "Tenancy agreements, leases, transfer deeds, and title documents that carry their own proof, so a tenant, buyer, lender, or agent can confirm a document is genuine and unaltered in seconds. A forged tenancy or an altered deed fails on sight.",
  metaDescription:
    "Seal tenancy agreements, leases, deeds, and title documents so any tenant, buyer, or lender can prove they're genuine and unaltered, free, standards-based, verifiable by anyone. Web app and CLI walkthrough.",
  who: "Conveyancers, estate & letting agents, landlords, and developers",
  documents: [
    "Tenancy agreements", "Leases", "Transfer deeds (TR1)", "Title documents",
    "Inventories", "Property searches", "Completion statements",
  ],
  seo: [
    "verify a tenancy agreement", "authenticate title deeds", "tamper-proof lease",
    "prove a tenancy wasn't altered", "verify a property document is genuine",
  ],
  proves: [
    { h: "The agreement can't be doctored", p: "A changed rent, term, name, or clause, one altered byte, fails verification. What was agreed is what verifies." },
    { h: "The issuing agent or firm, named", p: "Every tenancy, lease, and deed names the agent or conveyancer that sealed it, chaining to a published root, a specific certificate, not a vague badge." },
    { h: "Fixed at the moment of issue", p: "A blockchain timestamp pins when the document existed, decisive for start dates, completion, priority, and which version was signed." },
    { h: "Checked by anyone in the chain", p: "A tenant, a lender, or the other side's solicitor confirms the document at a permalink, instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your agency or firm", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority the first time you seal. Every document you issue chains to it." },
    { h: "Upload the signed document", p: "Drop in the tenancy, lease, or deed. It's sealed with your certificate as a PAdES signature covering every byte, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. You get back a normal PDF that also verifies." },
    { h: "Send the proof link with the document", p: "Every sealed document has a permanent proof page. Give the tenant or buyer the link; anyone opens it to confirm the document is genuine and current." },
  ],
  cli:
    `# Seal a tenancy agreement under your agency's certificate
$ sealbot seal tenancy-agreement.pdf --org examples
sealed   tenancy-agreement.pdf
  proof  https://letsseal.org/d/6c31af…b8e2
  anchored to the blockchain · recorded in the transparency log

# Issue at volume: seal every agreement as it's finalised
$ sealbot watch /srv/tenancies --mode seal --org examples
watching /srv/tenancies … sealing new & changed PDFs (idempotent)

# A tenant or lender confirms it, public, no account
$ sealbot verify tenancy-agreement.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder or your case-management system at Let's Seal and every agreement leaves already sealed, timestamped, and carrying a proof link, one command, no per-document fee.",
  examples: [
    { label: "A sealed tenancy agreement", note: "Open the proof page the way a tenant or lender would: it shows the agreement is authentic, unaltered since sealing, issued by the named agent, and timestamped on the blockchain.", proofUrl: "https://app.letsseal.org/d/sd_ce19dd779999a57720f7d14edc4cba99" },
    { label: "A lease or licence to occupy", note: "Commercial and residential leases sealed on execution, so a lender, guarantor, or incoming tenant can confirm the terms are exactly as granted." },
    { label: "A transfer deed or title document", note: "Seal the TR1 or title pack so the buyer's solicitor can verify the document is genuine and unaltered. An altered deed fails on sight." },
    { label: "A completion statement or inventory", note: "Financial statements and check-in inventories sealed and dated, so there's no dispute later about the figures or the condition recorded at the time." },
  ],
  faq: [
    { q: "Does this replace signatures or witnessing?", a: "No. A seal proves the document is authentic, unaltered, issued by you, and existed by a date. It's the cryptographic layer beneath whatever signing or witnessing the transaction requires, not a substitute for it." },
    { q: "Can a tenant or buyer verify without an account?", a: "Yes. Verification is public and free. They open the proof link, or drop the PDF into the verifier. The proof carries everything they need." },
    { q: "What if the lease is varied later?", a: "Seal the varied version too. Each version gets its own seal and timestamp, so the record shows exactly what was in force when, useful if a dispute turns on which version applied." },
    { q: "Can I seal a whole portfolio of agreements?", a: "Yes. Point the CLI or a watched folder at your document store and every agreement leaves sealed, timestamped, and carrying a proof link, one command per document, no per-seal fee." },
  ],
};

const EDUCATION: Sector = {
  slug: "education-credentials",
  name: "Education & credentials",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Education",
  h1: "Issue and verify degrees, transcripts & credentials",
  lede:
    "Degree certificates, transcripts, and professional credentials that anyone can verify in seconds, no phone call to the registrar, no forgery that survives a check. Issue one or ten thousand, each sealed, timestamped, and carrying its own proof.",
  metaDescription:
    "Issue tamper-proof degree certificates, transcripts, and professional credentials anyone can verify online, free, standards-based, and in bulk. Web app and CLI walkthrough with a real proof.",
  who: "Universities, colleges, and awarding & professional bodies",
  documents: [
    "Degree certificates", "Transcripts", "Diplomas", "Professional licences",
    "Enrolment letters", "CPD records", "Membership certificates",
  ],
  seo: [
    "verify a degree certificate", "authenticate a transcript", "digital credential verification free",
    "tamper-proof diploma", "check a qualification is genuine",
  ],
  proves: [
    { h: "A qualification that can't be faked", p: "A changed grade, name, or award, a single altered byte, fails verification. The forged-degree problem, closed." },
    { h: "The awarding body, named", p: "Every certificate names the institution that issued it, chaining to a published root, a specific certificate, not a printable logo." },
    { h: "Issued at a fixed date", p: "The award date is timestamped on the blockchain, so a certificate's date of issue can't be quietly back- or forward-dated." },
    { h: "Verified without phoning the registrar", p: "An employer, a professional body, or another institution confirms a credential at a permalink, instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your institution", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for issuing sealed credentials." },
    { h: "Issue one or import a spreadsheet", p: "Enter a graduate's details, or upload a CSV of the whole cohort. Let's Seal generates a branded, sealed certificate for each, with a verify QR on it." },
    { h: "Sealed, anchored, and delivered", p: "Every certificate is sealed with your certificate, timestamped on the blockchain, and emailed to the recipient with a proof link." },
    { h: "Anyone verifies at the link", p: "The graduate shares the proof page or QR; an employer opens it to confirm the credential is genuine, unaltered, and issued by you." },
  ],
  cli:
    `# Issue a batch of credentials from a spreadsheet
$ sealbot credentials issue cohort-2026.csv --org examples
issued   248 credentials
  each   sealed · anchored to the blockchain · emailed with a proof link

# Seal a one-off certificate PDF under your institution
$ sealbot seal degree-certificate.pdf --org examples
sealed   degree-certificate.pdf
  proof  https://letsseal.org/d/2a7f10…c93d

# An employer confirms a credential, public, no account
$ sealbot verify degree-certificate.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Issue credentials in bulk from a CSV, or seal existing certificate PDFs. Each carries a permanent proof page and a QR, verifiable by anyone, with no call to your office.",
  examples: [
    { label: "A sealed degree certificate", note: "This is what an employer sees when they scan the QR or open the link: a genuine, unaltered certificate, issued by the named institution and timestamped, no registrar phone call required.", proofUrl: "https://app.letsseal.org/d/sd_fe631f3f1a2072432607375cc2ec6aec" },
    { label: "An academic transcript", note: "Seal the full transcript so a receiving university or employer can confirm every grade and module is exactly as issued, with nothing added or altered." },
    { label: "A professional licence or membership", note: "Awarding and professional bodies seal licences and membership certificates so anyone can check a member's standing is genuine and current." },
    { label: "A CPD or completion record", note: "Course and CPD certificates issued in bulk, each carrying its own proof, verifiable by an employer or regulator without contacting the provider." },
  ],
  faq: [
    { q: "Can I issue thousands of certificates at once?", a: "Yes. Upload a CSV of the cohort and Let's Seal generates a branded, sealed, timestamped certificate for each, emailed with a proof link. One import, the whole graduating class." },
    { q: "How does an employer check a qualification?", a: "They open the proof link or scan the QR on the certificate. It confirms the credential is genuine, unaltered, and issued by you, instantly, and free, with no call to your office." },
    { q: "What if a credential is revoked or expires?", a: "You can mark a credential revoked or set an expiry; the proof page shows it honestly. The seal still proves it was genuinely issued and unaltered. The status sits alongside it." },
    { q: "Does the graduate need an account or app?", a: "No. They get a normal PDF certificate that opens anywhere, plus a proof link and QR that anyone can verify against the public portal." },
  ],
};

const MEDIA: Sector = {
  slug: "media-journalism",
  name: "Media, journalism & creative",
  built: true,
  lane: "media",
  eyebrow: "Use cases · Media",
  h1: "Prove photos and video are real, Content Credentials",
  lede:
    "Photographs, video, and creative work sealed with C2PA Content Credentials and anchored on the blockchain, provenance that stands up against deepfakes and doctored images. This is real, this is who made it, this is unedited since capture.",
  metaDescription:
    "Seal photos and video with C2PA Content Credentials so anyone can prove they're real, unedited, and who shot them, free, standards-based, anti-deepfake. Web app and CLI walkthrough with a real proof.",
  who: "Photographers, newsrooms, publishers, artists, and film teams",
  documents: [
    "Photos & video", "Published articles", "Master files", "Brand assets",
    "Creative sign-offs", "Press images",
  ],
  seo: [
    "prove a photo is real", "anti-deepfake content credentials", "image provenance C2PA free",
    "verify a photo hasn't been edited", "prove who took a photo",
  ],
  proves: [
    { h: "Real, not a deepfake", p: "The image or video carries a signed manifest over its exact pixels. Re-render it, splice it, or synthesise it and the credential no longer matches." },
    { h: "Attributed to the maker", p: "Every asset names the photographer, newsroom, or studio that sealed it, chaining to a published root, provenance you can point to." },
    { h: "Captured at a fixed time", p: "A blockchain timestamp pins when the asset existed, decisive for breaking news, first-publication, and licensing disputes." },
    { h: "Readable in any C2PA tool", p: "The Content Credentials verify in the standard ecosystem, Adobe's verifier, c2patool, any C2PA-aware viewer, not just on Let's Seal." },
  ],
  webSteps: [
    { h: "Sign in as your studio or newsroom", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for signing media." },
    { h: "Upload the image or video", p: "Drop in the file. Let's Seal embeds a C2PA Content Credentials manifest, signed with your certificate over the media's exact contents." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and recorded in the public transparency log. You get back the same file with credentials embedded." },
    { h: "Publish with provenance attached", p: "The credential travels inside the file. Anyone can open it in a C2PA viewer or at the proof link to confirm it's real, unedited, and yours." },
  ],
  cli:
    `# Seal a photo with C2PA Content Credentials
$ sealbot seal frontline-2026-06-30.jpg --org examples
sealed   frontline-2026-06-30.jpg  (C2PA Content Credentials embedded)
  proof  https://letsseal.org/d/8f4c21…a70d
  anchored to the blockchain · recorded in the transparency log

# Anyone confirms the provenance, stock C2PA tooling
$ c2patool frontline-2026-06-30.jpg
  validated · signed by Let's Seal Examples · manifest intact

$ sealbot verify frontline-2026-06-30.jpg
✓ authentic · unedited · sealed by Let's Seal Examples`,
  cliNote:
    "Images and video are sealed as C2PA Content Credentials, the same standard Adobe, camera makers, and newsrooms are adopting. It verifies in any C2PA viewer, chained to your own published root.",
  examples: [
    { label: "A photo with Content Credentials", note: "Open the proof page the way a picture editor would: it shows the image is authentic, unedited since capture, signed by the named maker, and timestamped on the blockchain, the provenance a deepfake can't fake.", proofUrl: "https://app.letsseal.org/d/sd_7b127dc926c62f7e199eddaf04889538" },
    { label: "Video and audio footage", note: "Seal raw footage on capture so a broadcaster or fact-checker can confirm it's the untouched original, the same C2PA manifest, verifiable in standard tooling." },
    { label: "A press or agency image", note: "Wire photos sealed at source, so a newsroom downstream can prove a picture is the photographer's genuine, unedited frame before it runs." },
    { label: "Brand assets and creative sign-offs", note: "Master files and approved creative sealed and dated, so a client or agency can confirm the asset they received is the version that was signed off." },
  ],
  faq: [
    { q: "Is this the same C2PA / Content Credentials as Adobe's?", a: "Yes. Let's Seal embeds a standard C2PA manifest that verifies in the whole Content Credentials ecosystem, Adobe's verifier, c2patool, any C2PA-aware viewer, chained to your own published root." },
    { q: "Does editing break the credential?", a: "Any change to the pixels breaks the match. That's the point. Re-export, splice, or AI-regenerate the image and it no longer verifies as the sealed original, which is exactly how you catch a doctored or synthetic version." },
    { q: "Video and audio too?", a: "Yes. C2PA covers images, video, and audio. The signed manifest travels inside the file and verifies with the same standard tooling." },
    { q: "What does the timestamp add?", a: "It pins when the asset existed on a public ledger, independent evidence of first capture or publication, which settles who had the shot first in a licensing or breaking-news dispute." },
  ],
};

const IP: Sector = {
  slug: "intellectual-property",
  name: "Intellectual property",
  built: true,
  lane: "anyfile",
  eyebrow: "Use cases · IP",
  h1: "Timestamp inventions and prove prior art",
  lede:
    "Invention disclosures, lab notebooks, designs, and trade-secret records anchored on the blockchain, an independent, tamper-proof record of what you had and exactly when. Prior art, priority, and possession you can actually prove.",
  metaDescription:
    "Timestamp invention disclosures, lab notebooks, and trade-secret records on the blockchain to prove prior art and priority, free, standards-based, and the file never leaves your machine. Web app and CLI walkthrough.",
  who: "Patent & IP attorneys, inventors, and R&D teams",
  documents: [
    "Invention disclosures", "Lab notebooks", "Prior-art records", "Design files",
    "Trade-secret documentation", "Research data", "Source code snapshots",
  ],
  seo: [
    "prove prior art date", "timestamp an invention", "trade secret existence proof",
    "prove I invented this first", "establish priority date",
  ],
  proves: [
    { h: "You had it by a certain date", p: "An OpenTimestamps proof on the blockchain pins the moment a disclosure or design existed, the priority evidence that decides who was first." },
    { h: "Unaltered since you recorded it", p: "The record is byte-for-byte as captured. A later edit fails verification, so the dated version is provably the version." },
    { h: "Attributable to you", p: "Seal the document under your organisation's certificate, chaining to a published root, attribution alongside the date." },
    { h: "Provable for years, by anyone", p: "The blockchain anchor outlives any vendor. A record timestamped today stays verifiable indefinitely, with standard tools, by any examiner or court." },
  ],
  webSteps: [
    { h: "Sign in as your organisation", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing disclosures and records." },
    { h: "Seal a disclosure document", p: "Upload the invention disclosure or design PDF; it's sealed over the whole file and timestamped, fixing what you had the moment you record it." },
    { h: "Or timestamp a file privately", p: "For confidential material, source, research data, raw designs, anchor just the file's hash from the CLI. The bytes never leave your machine, only the 32-byte digest." },
    { h: "Keep the proof for the record", p: "Store the proof link or the .ots file with your IP records. It's the independent, dated evidence you produce if priority is ever questioned." },
  ],
  cli:
    `# Timestamp a confidential file. Only its hash leaves the machine
$ sealbot anchor invention-disclosure.pdf --publish
anchored invention-disclosure.pdf → invention-disclosure.pdf.ots
  proof  https://letsseal.org/d/…  (digest only, file never uploaded)

# Or seal a disclosure under your org (binds it to your certificate)
$ sealbot seal invention-disclosure.pdf --org examples
sealed   invention-disclosure.pdf
  proof  https://letsseal.org/d/4e9b22…f10a

# Prove the date later, against the blockchain, with stock tooling
$ ots verify invention-disclosure.pdf.ots
Success! Bitcoin attests existence as of 2026-06-30`,
  cliNote:
    "Anchoring proves existence-and-date without the file ever leaving your machine, only its SHA-256. Sealing additionally binds the document to your certificate. Both are recorded in the public transparency log.",
  examples: [
    { label: "A timestamped invention disclosure", note: "The proof page is the evidence you'd put in front of an examiner: it shows the disclosure is unaltered, sealed by your organisation, and independently timestamped on the blockchain, a priority date no one can move.", proofUrl: "https://app.letsseal.org/d/sd_2e9df042f8a20c68d496dce5c7a4f0dd" },
    { label: "A lab notebook or research record", note: "Anchor each notebook entry or dataset as you record it, only the hash leaves your machine, building a dated, tamper-evident trail of what you found and when." },
    { label: "A design file or trade-secret record", note: "Timestamp confidential designs and trade-secret documentation privately, so you can prove possession by a date without ever disclosing the file." },
    { label: "A source-code snapshot", note: "Anchor a release or milestone snapshot's hash to fix an authorship and existence date, provable prior art for software, with the code kept private." },
  ],
  faq: [
    { q: "Does this replace filing a patent?", a: "No. It's independent, dated evidence that you had an invention or design by a certain time, useful for prior art, priority, and trade-secret records. It complements a patent filing; it isn't a registration." },
    { q: "Can I prove a date without disclosing the file?", a: "Yes. Anchor just the SHA-256. The file never leaves your machine, only its 32-byte digest, and the blockchain timestamp still proves it existed by that date. You reveal the file only if and when you choose." },
    { q: "How durable is the priority evidence?", a: "The blockchain anchor doesn't depend on Let's Seal or any vendor. A record timestamped today stays independently verifiable for years, with standard OpenTimestamps tooling." },
    { q: "Is the timestamp credible to a court or examiner?", a: "It's an OpenTimestamps proof committed to the blockchain, a public, immutable ledger anyone can check. The evidence stands on that ledger, not on trusting us." },
  ],
};

const BANKING: Sector = {
  slug: "banking-lending",
  name: "Banking & lending",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Banking",
  h1: "Seal and verify bank & lending documents",
  lede:
    "Statements, loan and mortgage agreements, KYC packs, and guarantees that carry their own proof, so a lender, a landlord, or a counterparty can confirm a document is genuine in seconds. A doctored statement or a forged bank letter fails on sight.",
  metaDescription:
    "Seal bank statements, loan and mortgage agreements, and KYC documents so any lender or counterparty can prove they're genuine and unaltered in seconds, free, standards-based, and issued in bulk. Web app and CLI walkthrough.",
  who: "Banks, lenders, fintechs, and building societies",
  documents: [
    "Bank statements", "Loan & mortgage agreements", "KYC / onboarding documents",
    "Letters of credit", "Guarantees", "Reference & confirmation letters",
  ],
  seo: [
    "verify a bank statement is genuine", "tamper-proof loan documents", "authenticate a bank letter",
    "detect a fake bank statement", "prove a mortgage agreement wasn't altered",
  ],
  proves: [
    { h: "A statement that can't be doctored", p: "A changed balance, transaction, or name fails verification. The edited-bank-statement problem, closed at the source." },
    { h: "The issuing bank or lender, named", p: "Every statement and agreement names the institution that sealed it, chaining to a published root, a specific certificate, not a letterhead anyone can copy." },
    { h: "Fixed at the moment of issue", p: "Statement periods and agreement dates are timestamped on the blockchain, decisive for affordability checks, drawdown, and disputes over which version was current." },
    { h: "Verified without a callback", p: "A landlord, a broker, or another bank confirms a document at a permalink, instantly, and free, with no call to your fraud desk." },
  ],
  webSteps: [
    { h: "Sign in as your institution", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority the first time you seal. Every document you issue chains to it." },
    { h: "Upload or generate the document", p: "Drop in the statement, agreement, or letter. It's sealed with your certificate as a PAdES signature over the whole file, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The customer gets a normal PDF that also verifies." },
    { h: "Deliver with a proof link", p: "Every document has a permanent proof page. Whoever relies on it, a lender, a letting agent, opens the link to confirm it's genuine and unaltered." },
  ],
  cli:
    `# Seal every statement in a run as it's generated
$ sealbot watch /srv/statements --mode seal --org examples
watching /srv/statements … sealing new & changed PDFs (idempotent)

# Seal a single loan agreement under your institution
$ sealbot seal mortgage-offer.pdf --org examples
sealed   mortgage-offer.pdf
  proof  https://letsseal.org/d/9d10af…7c22

# A third party confirms a statement, public, no account
$ sealbot verify statement-2026-06.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder or your statement-generation pipeline at Let's Seal and every document leaves already sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee.",
  examples: [
    { label: "A sealed bank statement", note: "Open the proof page the way a lender or landlord would: it shows the statement is authentic, unaltered since issue, sealed by the named bank, and timestamped on the blockchain, no callback required.", proofUrl: "https://app.letsseal.org/d/sd_53cf7512c1bf11dfb9667efa04848cc7" },
    { label: "A mortgage or loan agreement", note: "Seal the executed offer or agreement so a broker, solicitor, or borrower can confirm the terms are exactly as issued. An altered rate or amount is caught instantly." },
    { label: "A KYC or onboarding pack", note: "Seal the verified onboarding documents so a downstream institution can confirm the pack is the one you produced, unaltered, provable customer due diligence." },
    { label: "A guarantee or letter of credit", note: "High-value instruments sealed and timestamped on issue, so a beneficiary can verify authenticity before relying on them." },
  ],
  faq: [
    { q: "Does this stop fake bank statements?", a: "A sealed statement can't be edited without failing verification, and anyone can check it against the proof link. The doctored-PDF version simply won't verify as issued by you, which is exactly the fraud a rental or lending check is trying to catch." },
    { q: "Can a third party verify without an account?", a: "Yes. Verification is public and free. A landlord or another bank opens the proof link, or drops the PDF into the verifier. The proof carries everything they need." },
    { q: "Can I seal every statement automatically?", a: "Yes. Point the CLI or a watched folder at your statement pipeline and every document leaves sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee." },
    { q: "Does the customer need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
  ],
};

const ACCOUNTING: Sector = {
  slug: "accounting-audit",
  name: "Accounting & audit",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Accounting",
  h1: "Seal and verify accounts & audit reports",
  lede:
    "Financial statements, audit reports, and tax filings that prove their own authenticity, so a bank, an investor, or a regulator can confirm the accounts are the version you signed off, unaltered and fixed in time.",
  metaDescription:
    "Seal financial statements, audit reports, and tax returns so any bank, investor, or regulator can prove they're the signed-off version, unaltered, free, standards-based, verifiable by anyone. Web app and CLI walkthrough.",
  who: "Accountants, auditors, tax advisers, and bookkeepers",
  documents: [
    "Financial statements", "Audit reports", "Tax returns", "Management accounts",
    "SOC reports", "Engagement & representation letters",
  ],
  seo: [
    "verify audited accounts", "tamper-evident financial statements", "authenticate an audit report",
    "prove accounts weren't altered", "verify a signed-off tax return",
  ],
  proves: [
    { h: "The figures can't be altered", p: "A changed number, note, or opinion fails verification. The signed-off accounts are provably the accounts, no quiet edits after the fact." },
    { h: "The firm that issued them, named", p: "Every statement and report names the practice that sealed it, chaining to a published root, the attribution a bank or regulator expects." },
    { h: "Fixed to the reporting date", p: "The moment of issue is timestamped on the blockchain, so a set of accounts or an audit opinion can't be back- or forward-dated." },
    { h: "Verified independently", p: "A lender, an investor, or a regulator confirms the report against public infrastructure, no access to, or trust in, your systems required." },
  ],
  webSteps: [
    { h: "Sign in as your practice", p: "Open app.letsseal.org and sign in. Your firm gets its own certificate authority for sealing accounts and reports." },
    { h: "Upload the finalised accounts", p: "Drop in the financial statements or audit report. It's sealed over the whole file, so any later edit to a figure or note is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The client gets a normal PDF that also verifies." },
    { h: "Issue with a proof link", p: "Every report has a permanent proof page. The client passes the link to their bank or investors, who confirm the accounts are genuine and unaltered." },
  ],
  cli:
    `# Seal a set of finalised accounts under your practice
$ sealbot seal financial-statements-fy26.pdf --org examples
sealed   financial-statements-fy26.pdf
  proof  https://letsseal.org/d/5a2e88…10bd
  anchored to the blockchain · recorded in the transparency log

# Seal a whole run of client reports at once
$ sealbot watch /srv/reports --mode seal --org examples
watching /srv/reports … sealing new & changed PDFs (idempotent)

# A bank or regulator confirms the report, public, no account
$ sealbot verify audit-report-fy26.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Seal finalised accounts and reports one at a time or in a run. Each carries a permanent proof link. A lender or regulator verifies it against public infrastructure, with no access to your systems.",
  examples: [
    { label: "A sealed set of financial statements", note: "Open the proof page the way a lender reviewing the accounts would: it shows the statements are authentic, unaltered since sign-off, issued by the named firm, and timestamped on the blockchain.", proofUrl: "https://app.letsseal.org/d/sd_23479790d8eb271425c105ed70e55f6d" },
    { label: "An audit report or opinion", note: "Seal the signed audit report so a regulator or investor can confirm the opinion is exactly as issued, decisive when accounts are relied on for a transaction." },
    { label: "A tax return or computation", note: "Seal the filed return so an adviser, lender, or authority can verify it's the version submitted, unaltered and dated." },
    { label: "A SOC 2 / ISO report", note: "Assurance reports sealed on issue, so a customer's security team can confirm the report they received is genuine and current, not a recycled or edited copy." },
  ],
  faq: [
    { q: "Does this replace an auditor's signature?", a: "No. It's the cryptographic layer beneath it: the seal proves the report is authentic, unaltered, issued by your firm, and fixed in time. The professional opinion is still yours. The seal just makes the document tamper-evident and independently checkable." },
    { q: "How does a bank verify a set of accounts?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the accounts are the signed-off version, unaltered, and issued by you, with no call to your practice." },
    { q: "Can accounts stay verifiable for years?", a: "Yes. The seal and the blockchain anchor outlive any single vendor, so a set of accounts sealed today stays independently verifiable indefinitely, with standard tools." },
    { q: "Does the client need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
  ],
};

const INVESTMENT: Sector = {
  slug: "investment-asset-management",
  name: "Investment & asset management",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Investment",
  h1: "Seal and verify fund & investor documents",
  lede:
    "Factsheets, prospectuses, investor statements, and proof-of-reserves attestations that anyone can verify, so an investor or allocator can confirm a document is genuine and current, not a doctored PDF or an out-of-date copy.",
  metaDescription:
    "Seal fund factsheets, prospectuses, investor statements, and proof-of-reserves attestations so any investor or allocator can prove they're genuine and unaltered, free, standards-based, verifiable by anyone. Web app and CLI walkthrough.",
  who: "Fund managers, wealth managers, IFAs, and custodians",
  documents: [
    "Factsheets & KIIDs", "Prospectuses", "Investor statements", "Capital-call notices",
    "Proof-of-reserves attestations", "Valuation reports",
  ],
  seo: [
    "verify fund factsheet", "authenticate investor statement", "proof of reserves attestation",
    "tamper-proof capital call notice", "prove a fund document is genuine",
  ],
  proves: [
    { h: "Figures and holdings can't be altered", p: "A changed NAV, return, or holding fails verification. An investor sees the exact document you published, not a doctored version." },
    { h: "The manager or custodian, named", p: "Every factsheet, statement, and attestation names the firm that sealed it, chaining to a published root, provable issuer, not a copied template." },
    { h: "Pinned to a point in time", p: "The as-at date is timestamped on the blockchain, decisive for valuations, capital calls, and proof-of-reserves, where the moment is the whole point." },
    { h: "Verified by any investor", p: "An LP, an allocator, or an IFA confirms a document at a permalink, instantly and free, without waiting on your investor-relations team." },
  ],
  webSteps: [
    { h: "Sign in as your firm", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing fund and investor documents." },
    { h: "Upload the document", p: "Drop in the factsheet, statement, or notice. It's sealed with your certificate over the whole file, so any later edit to a figure is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The investor gets a normal PDF that also verifies." },
    { h: "Distribute with a proof link", p: "Every document has a permanent proof page. Investors open the link to confirm the factsheet or statement is genuine and current." },
  ],
  cli:
    `# Seal a monthly investor statement run in one pass
$ sealbot watch /srv/investor-statements --mode seal --org examples
watching /srv/investor-statements … sealing new & changed PDFs (idempotent)

# Seal a proof-of-reserves attestation, fix it in time
$ sealbot seal proof-of-reserves-2026-06.pdf --org examples
sealed   proof-of-reserves-2026-06.pdf
  proof  https://letsseal.org/d/1f77c2…9e40
  anchored to the blockchain · recorded in the transparency log

# An investor confirms a factsheet, public, no account
$ sealbot verify factsheet-2026-06.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Seal a whole investor-statement run in one pass, or seal a single attestation to pin it in time. Each carries a permanent proof link an investor verifies against public infrastructure.",
  examples: [
    { label: "A sealed investor statement", note: "Open the proof page the way an LP checking their statement would: it shows the figures are authentic, unaltered since issue, sealed by the named manager, and timestamped on the blockchain.", proofUrl: "https://app.letsseal.org/d/sd_e577b506b9ae3fe63e0053fa7ea9c881" },
    { label: "A fund factsheet or KIID", note: "Seal each monthly factsheet so an allocator or IFA can confirm the returns and holdings are exactly as published, not an edited or stale copy circulating elsewhere." },
    { label: "A proof-of-reserves attestation", note: "Anchor a reserves attestation to fix it at a precise moment on the blockchain, the independent, timestamped evidence proof-of-reserves depends on." },
    { label: "A capital-call notice", note: "Seal drawdown and capital-call notices so an investor can verify the instruction is genuinely from the manager before acting on it." },
  ],
  faq: [
    { q: "Does this prove the figures are correct?", a: "It proves the document is authentic, unaltered, issued by you, and fixed in time. Whether a NAV or return is correct is a matter for your valuation process, but nobody can circulate a doctored factsheet or statement and pass verification." },
    { q: "How is this useful for proof-of-reserves?", a: "Proof-of-reserves is about a specific moment. Sealing and anchoring the attestation pins it to a blockchain timestamp and makes it tamper-evident, so an investor can verify both what was attested and exactly when, independently of you." },
    { q: "Can an investor verify without an account?", a: "Yes. Verification is public and free. An LP or IFA opens the proof link, or drops the PDF into the verifier. No investor-relations round trip required." },
    { q: "Can I seal a whole distribution run at once?", a: "Yes. Point the CLI or a watched folder at your statement run and every document leaves sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee." },
  ],
};

const CONSTRUCTION: Sector = {
  slug: "construction-engineering",
  name: "Construction & engineering",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Construction",
  h1: "Seal and verify construction & engineering documents",
  lede:
    "Building certificates, structural calculations, inspection reports, and handover packs that carry their own proof, so a building-control officer, a client, or an insurer can confirm a document is genuine and unaltered. A doctored sign-off or an altered calculation fails on sight.",
  metaDescription:
    "Seal building certificates, inspection reports, structural calculations, and handover packs so any client, insurer, or building-control officer can prove they're genuine and unaltered, free, standards-based. Web app and CLI walkthrough.",
  who: "Contractors, architects, structural & civil engineers, and building-control teams",
  documents: [
    "Building & completion certificates", "Structural calculations", "Inspection & test reports",
    "As-built drawings", "Handover / O&M packs", "Method statements & RAMS",
  ],
  seo: [
    "verify a building certificate", "tamper-proof inspection report", "authenticate structural calculations",
    "prove an inspection sign-off is genuine", "verify a handover pack",
  ],
  proves: [
    { h: "The record can't be altered", p: "A changed figure, result, or sign-off fails verification. An inspection pass or a load calculation is provably the one that was issued." },
    { h: "The engineer or firm, named", p: "Every certificate and report names the practice that sealed it, chaining to a published root, a specific certificate, not a signature block anyone can paste." },
    { h: "Fixed at the moment of inspection", p: "The issue date is timestamped on the blockchain, decisive for the sequence of works, sign-offs, and who certified what, when." },
    { h: "Checked by client, insurer, or building control", p: "Anyone relying on the document confirms it at a permalink, instantly, and free, without a call to the practice." },
  ],
  webSteps: [
    { h: "Sign in as your firm", p: "Open app.letsseal.org and sign in. Your practice gets its own certificate authority the first time you seal. Every certificate you issue chains to it." },
    { h: "Upload the certificate or report", p: "Drop in the signed-off document. It's sealed with your certificate as a PAdES signature over the whole file, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. You get back a normal PDF that also verifies." },
    { h: "Issue with a proof link", p: "Every document has a permanent proof page. Put the link in the handover pack; the client or insurer opens it to confirm the record is genuine and unaltered." },
  ],
  cli:
    `# Seal every inspection report as it's signed off
$ sealbot watch /srv/site-reports --mode seal --org examples
watching /srv/site-reports … sealing new & changed PDFs (idempotent)

# Seal a completion certificate under your firm
$ sealbot seal completion-certificate.pdf --org examples
sealed   completion-certificate.pdf
  proof  https://letsseal.org/d/8b21af…40c3

# A client or insurer confirms it, public, no account
$ sealbot verify completion-certificate.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder at your document control and every certificate and report leaves already sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee.",
  examples: [
    { label: "A sealed completion certificate", note: "Open the proof page the way building control or an insurer would: it shows the certificate is authentic, unaltered since issue, sealed by the named firm, and timestamped on the blockchain.", proofUrl: "https://app.letsseal.org/d/sd_2f5a57a3d928e56bacde33600f11f79f" },
    { label: "A set of structural calculations", note: "Seal the calculations pack so a checking engineer or client can confirm the figures are exactly as issued. An altered load or span is caught instantly." },
    { label: "An inspection or test report", note: "Site inspections and material tests sealed the moment they're signed off: provably the version filed, timestamped, and attributable to the inspector." },
    { label: "An as-built drawing or handover pack", note: "Seal the final drawings and O&M pack so the record handed over at practical completion can be verified as genuine for the life of the building." },
  ],
  faq: [
    { q: "Does this replace building-control sign-off?", a: "No. It's the cryptographic layer beneath it: the seal proves the certificate is authentic, unaltered, issued by your firm, and fixed in time. The professional sign-off is still yours. The seal just makes it tamper-evident and independently checkable." },
    { q: "How does an insurer or client verify a certificate?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the document is genuine, unaltered, and issued by you, with no call to your practice." },
    { q: "Will it still verify years later, for a warranty claim?", a: "Yes. The seal and the blockchain anchor outlive any single vendor, so a certificate sealed today stays independently verifiable for the life of the building." },
    { q: "Does the recipient need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
  ],
};

const SURVEYING: Sector = {
  slug: "surveying-property-reports",
  name: "Surveying & property reports",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Surveying",
  h1: "Seal and verify surveys, valuations & EPCs",
  lede:
    "Valuation reports, homebuyer surveys, and EPCs that prove their own authenticity, so a lender, a buyer, or a conveyancer can confirm a report is the surveyor's genuine, unaltered version. A forged valuation or a doctored EPC fails on sight.",
  metaDescription:
    "Seal valuation reports, homebuyer surveys, and EPCs so any lender, buyer, or conveyancer can prove they're genuine and unaltered, free, standards-based, verifiable by anyone. Web app and CLI walkthrough.",
  who: "Chartered surveyors, valuers, and EPC assessors",
  documents: [
    "Valuation reports", "Homebuyer & building surveys", "EPCs", "Party-wall awards",
    "Condition reports", "Schedules of condition",
  ],
  seo: [
    "verify a valuation report", "authenticate an EPC", "tamper-proof survey report",
    "prove a valuation wasn't altered", "detect a forged surveyor's report",
  ],
  proves: [
    { h: "Figures and ratings can't be altered", p: "A changed valuation, defect, or EPC rating fails verification. The lender sees the surveyor's real numbers, not a doctored version." },
    { h: "The surveyor or firm, named", p: "Every report names the practice that sealed it, chaining to a published root, provable authorship, not a copied letterhead." },
    { h: "Fixed to the inspection date", p: "The as-inspected date is timestamped on the blockchain, decisive when a valuation or condition report is relied on for a transaction or a claim." },
    { h: "Verified without calling the practice", p: "A lender, a buyer, or a conveyancer confirms the report at a permalink, instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your practice", p: "Open app.letsseal.org and sign in. Your firm gets its own certificate authority for sealing reports." },
    { h: "Upload the report", p: "Drop in the valuation, survey, or EPC. It's sealed over the whole file, so any later edit to a figure or rating is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The client gets a normal PDF that also verifies." },
    { h: "Deliver with a proof link", p: "Every report has a permanent proof page. The client or their lender opens the link to confirm the report is genuine and current." },
  ],
  cli:
    `# Seal a valuation report under your practice
$ sealbot seal valuation-report.pdf --org examples
sealed   valuation-report.pdf
  proof  https://letsseal.org/d/2c74ef…b910
  anchored to the blockchain · recorded in the transparency log

# Seal a run of survey reports as they're finalised
$ sealbot watch /srv/surveys --mode seal --org examples
watching /srv/surveys … sealing new & changed PDFs (idempotent)

# A lender confirms the report, public, no account
$ sealbot verify valuation-report.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Seal reports one at a time or in a run. Each carries a permanent proof link a lender or conveyancer verifies against public infrastructure, no call to your practice.",
  examples: [
    { label: "A sealed valuation report", note: "Open the proof page the way a mortgage lender would: it shows the valuation is authentic, unaltered since issue, produced by the named surveyor, and timestamped on the blockchain, the anti-mortgage-fraud check, built in.", proofUrl: "https://app.letsseal.org/d/sd_9f76e61986658cec80cfce05fdacb263" },
    { label: "A homebuyer or building survey", note: "Seal the survey so a buyer and their conveyancer can confirm the defects and findings are exactly as reported, nothing added or quietly removed." },
    { label: "An EPC", note: "Energy assessments sealed on issue, so a buyer, tenant, or lender can confirm the rating is the assessor's genuine result, not an edited copy." },
    { label: "A party-wall award or condition report", note: "Awards and schedules of condition sealed and dated, so there's no dispute later about what was recorded at the time." },
  ],
  faq: [
    { q: "Does this help against mortgage fraud?", a: "A sealed valuation can't be edited without failing verification, and a lender can check it against the proof link. An inflated or doctored valuation simply won't verify as the surveyor's issued report, which is exactly the fraud the check is trying to catch." },
    { q: "How does a lender verify a report?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the report is genuine, unaltered, and produced by the named surveyor, with no call to your practice." },
    { q: "Does the client need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
    { q: "Does this replace a surveyor's professional judgement?", a: "No. It makes the report tamper-evident and independently checkable. The findings and figures are still the surveyor's; the seal proves the document is exactly as they issued it." },
  ],
};

const HEALTHCARE: Sector = {
  slug: "healthcare",
  name: "Healthcare",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Healthcare",
  h1: "Seal and verify medical documents & records",
  lede:
    "Fit notes, referral letters, discharge summaries, and results that carry their own proof, so an employer, another clinician, or an insurer can confirm a document is genuine, and forged sick notes or altered records fail on sight. Sensitive files can be proven without ever leaving your systems.",
  metaDescription:
    "Seal fit notes, referral letters, discharge summaries, and results so anyone can prove they're genuine and unaltered, or timestamp sensitive records by hash alone, without uploading them. Free, standards-based. Web app and CLI.",
  who: "Hospitals, GPs, clinics, dentists, and vets",
  documents: [
    "Fit notes & sick certificates", "Referral & discharge letters", "Medical records",
    "Lab & imaging results", "Vaccination records", "Test certificates",
  ],
  seo: [
    "verify a medical certificate", "authenticate a fit note", "tamper-proof medical records",
    "detect a fake sick note", "prove a medical letter is genuine",
  ],
  proves: [
    { h: "A certificate that can't be faked", p: "A changed date, name, or finding fails verification. The forged-fit-note and altered-result problem, closed at the source." },
    { h: "The issuing provider, named", p: "Every letter and certificate names the practice or hospital that sealed it, chaining to a published root, provable issuer, not a copied letterhead." },
    { h: "Fixed at the moment of issue", p: "The issue date is timestamped on the blockchain, so a certificate or result can't be back- or forward-dated." },
    { h: "Sensitive records stay private", p: "For confidential files, anchor just the SHA-256. The record never leaves your systems, only its 32-byte digest, and it still proves it existed unaltered by a date." },
  ],
  webSteps: [
    { h: "Sign in as your practice", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing letters and certificates." },
    { h: "Seal the document you issue", p: "Upload the fit note, referral, or result. It's sealed over the whole file, so any later edit is caught, and the recipient gets a normal PDF that also verifies." },
    { h: "Or timestamp a record privately", p: "For sensitive records, anchor the file's hash from the CLI. The bytes never leave your systems, only the digest, and the timestamp still verifies against the blockchain." },
    { h: "Recipient verifies at the link", p: "The patient shares the proof link; an employer or another clinician opens it to confirm the document is genuine and issued by you." },
  ],
  cli:
    `# Seal a fit note or referral under your practice
$ sealbot seal fit-note.pdf --org examples
sealed   fit-note.pdf
  proof  https://letsseal.org/d/6f19ad…c802

# Timestamp a confidential record. Only its hash leaves your systems
$ sealbot anchor patient-record-4821.pdf --publish
anchored patient-record-4821.pdf → patient-record-4821.pdf.ots
  proof  https://letsseal.org/d/…  (digest only, file never uploaded)

# An employer confirms a fit note, public, no account
$ sealbot verify fit-note.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Seal documents you hand out; anchor sensitive records by hash so they never leave your systems. Both prove authenticity and date, and both are recorded in the public transparency log.",
  examples: [
    { label: "A sealed fit note", note: "Open the proof page the way an employer or HR team would: it shows the note is authentic, unaltered, issued by the named practice, and timestamped, the fake-sick-note problem, solved.", proofUrl: "https://app.letsseal.org/d/sd_92e2536461a1be84babd1b2d44ec8a16" },
    { label: "A referral or discharge letter", note: "Seal letters between providers so a receiving clinician can confirm the letter is genuinely from the issuing practice, unaltered in transit." },
    { label: "A lab or imaging result", note: "Results sealed on issue, so a patient, insurer, or another clinician can verify a report is the genuine, unedited result." },
    { label: "A sensitive medical record (hash-only)", note: "Anchor just the record's SHA-256, the file stays in your systems entirely, and still prove it existed unaltered as of a date." },
  ],
  faq: [
    { q: "Do patient records have to be uploaded?", a: "No. For sensitive records you can anchor just the SHA-256. The file never leaves your systems, only its 32-byte digest, and the timestamp still proves it existed unaltered by that date." },
    { q: "Does this stop fake fit notes?", a: "A sealed fit note can't be edited without failing verification, and an employer can check it against the proof link. A forged or altered note simply won't verify as issued by the practice." },
    { q: "How does an employer or clinician verify one?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the document is genuine, unaltered, and issued by the named provider, with no call to the practice." },
    { q: "Does this replace clinical or regulatory systems?", a: "No. It's the integrity and timestamp layer alongside them, making a document tamper-evident and independently checkable. Your records systems and their governance are unchanged." },
  ],
};

const PHARMA: Sector = {
  slug: "pharma-life-sciences",
  name: "Pharma & life sciences",
  built: true,
  lane: "anyfile",
  eyebrow: "Use cases · Life sciences",
  h1: "Tamper-evident batch records, CoAs & trial data",
  lede:
    "Batch records, certificates of analysis, and clinical-trial data that are provably unaltered and independently timestamped, the data-integrity (ALCOA+) layer regulators ask for, recorded on a public ledger no one can quietly rewrite. Confidential data never has to leave your systems.",
  metaDescription:
    "Seal and timestamp batch records, certificates of analysis, and trial data so any regulator or partner can prove they're unaltered and contemporaneous, or anchor by hash alone. ALCOA+ data integrity, free and standards-based. Web app and CLI.",
  who: "Pharma, CROs, clinical trials, and medical-device makers",
  documents: [
    "Batch records", "Certificates of analysis (CoA)", "Clinical-trial data", "GMP / GxP documents",
    "Validation & qualification records", "Regulatory submissions",
  ],
  seo: [
    "data integrity ALCOA+", "verify certificate of analysis", "tamper-evident batch record",
    "GxP data integrity proof", "timestamp clinical trial data",
  ],
  proves: [
    { h: "Provably unaltered records", p: "A batch record, CoA, or dataset is byte-for-byte as captured. Any later edit is caught on verification. The integrity pillar of ALCOA+, cryptographically." },
    { h: "Attributable to a signer", p: "Each record is sealed under your organisation's certificate, chaining to a published root, the attribution GxP data integrity expects." },
    { h: "Contemporaneous by construction", p: "Every record is timestamped on the blockchain and appended to a public, append-only log, an independent “this existed then” that predates any dispute." },
    { h: "Confidential data stays in-house", p: "For trial data and formulations, anchor just the SHA-256. The data never leaves your systems, only the digest, and it still proves existence and integrity." },
  ],
  webSteps: [
    { h: "Sign in as your organisation", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing controlled records." },
    { h: "Seal a controlled document", p: "Upload the batch record or CoA; it's sealed over the whole file and timestamped, fixing the record the moment it's captured." },
    { h: "Or anchor confidential data by hash", p: "For trial data and raw datasets, anchor the file's hash from the CLI. The bytes never leave your systems, only the 32-byte digest." },
    { h: "Hand a regulator the proof", p: "Give the assessor the proof link or the .ots file. They verify independently, against the blockchain and the transparency log, without access to your systems." },
  ],
  cli:
    `# Seal a certificate of analysis under your org
$ sealbot seal coa-batch-A4471.pdf --org examples
sealed   coa-batch-A4471.pdf
  proof  https://letsseal.org/d/3a90cd…7f21

# Anchor confidential trial data. Only its hash leaves your systems
$ sealbot anchor trial-dataset-2026-06.parquet --publish
anchored trial-dataset-2026-06.parquet → …ots  (digest only)

# A regulator re-checks the timestamp against the blockchain, stock tooling
$ ots verify coa-batch-A4471.pdf.ots
Success! Bitcoin attests existence as of 2026-06-30`,
  cliNote:
    "Seal controlled documents; anchor confidential datasets by hash so they never leave your systems. Both deliver attributable, contemporaneous, tamper-evident records recorded in the public transparency log.",
  examples: [
    { label: "A sealed certificate of analysis", note: "Open the proof page the way a QP or customer would: it shows the CoA is authentic, unaltered, issued by your organisation, and timestamped on the blockchain, a batch result no one can quietly change.", proofUrl: "https://app.letsseal.org/d/sd_a94eee65e5eeb4b75c87380d450ce379" },
    { label: "A batch or manufacturing record", note: "Seal each batch record on completion, so an inspector can confirm it's the contemporaneous record, provably unaltered since the batch was made." },
    { label: "Clinical-trial data (hash-only)", note: "Anchor a dataset's SHA-256, the data stays entirely in your systems, and prove it existed unaltered as of that date, independent of your eTMF." },
    { label: "A validation or qualification record", note: "IQ/OQ/PQ and validation evidence sealed and timestamped, giving the attributable, contemporaneous trail data-integrity frameworks require." },
  ],
  faq: [
    { q: "Does this satisfy ALCOA+ / GxP data integrity?", a: "It delivers the integrity and contemporaneous-record pillars cryptographically: each record is attributable to a signer, provably unaltered, and independently timestamped on a public ledger. It complements your quality system; it doesn't replace it." },
    { q: "Can confidential trial data stay private?", a: "Yes. Anchor just the SHA-256. The data never leaves your systems, only its 32-byte digest, and the blockchain timestamp still proves it existed unaltered by that date." },
    { q: "Can an inspector verify without our systems?", a: "Yes. That's the point. They verify the seal and the blockchain timestamp against public infrastructure, so the evidence stands even if your systems are unavailable." },
    { q: "Do records stay verifiable for the retention period?", a: "Yes. The seal and the blockchain anchor outlive any single vendor, so a record sealed today stays independently verifiable for years, with standard tools." },
  ],
};

const GOVERNMENT: Sector = {
  slug: "government-public-sector",
  name: "Government & public sector",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Government",
  h1: "Seal and verify official documents & certificates",
  lede:
    "Permits, licences, planning decisions, and official letters that anyone can verify, so a citizen, a business, or another authority can confirm a document is genuine, and forged permits and doctored official letters fail on sight. Issue one or a whole run, each carrying its own proof.",
  metaDescription:
    "Seal permits, licences, planning permissions, and official letters so any citizen or authority can prove they're genuine and unaltered, free, standards-based, and issued in bulk. Web app and CLI walkthrough.",
  who: "Councils, agencies, regulators, courts, and registrars",
  documents: [
    "Permits & licences", "Planning permissions", "Benefit & tax letters", "Court orders",
    "Official certificates", "Statutory notices",
  ],
  seo: [
    "verify a government letter", "authenticate a permit", "tamper-proof official document",
    "detect a forged official document", "verify a planning permission",
  ],
  proves: [
    { h: "Official documents that can't be forged", p: "A changed name, reference, or decision fails verification. The forged-permit and doctored-letter problem, closed at issue." },
    { h: "The issuing authority, named", p: "Every permit and letter names the body that sealed it, chaining to a published root, a specific certificate, not a crest anyone can copy." },
    { h: "Fixed at the moment of issue", p: "The issue date is timestamped on the blockchain, decisive for deadlines, appeal windows, and which decision was in force when." },
    { h: "Verified by anyone, free", p: "A citizen, a business, or another authority confirms a document at a permalink, instantly, and free, with no office to phone." },
  ],
  webSteps: [
    { h: "Sign in as your authority", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing official documents." },
    { h: "Issue or upload the document", p: "Enter the details or drop in the PDF. It's sealed with your certificate over the whole file, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The recipient gets a normal PDF that also verifies." },
    { h: "Deliver with a proof link", p: "Every document has a permanent proof page. The recipient, or anyone relying on it, opens the link to confirm it's genuine and current." },
  ],
  cli:
    `# Seal a run of letters or permits as they're issued
$ sealbot watch /srv/notices --mode seal --org examples
watching /srv/notices … sealing new & changed PDFs (idempotent)

# Seal a single permit under your authority
$ sealbot seal planning-permission.pdf --org examples
sealed   planning-permission.pdf
  proof  https://letsseal.org/d/7e42bc…a015

# Anyone confirms an official document, public, no account
$ sealbot verify planning-permission.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder or your case system at Let's Seal and every notice, permit, and letter leaves already sealed, timestamped, and carrying a proof link, one command per document, no per-seal fee.",
  examples: [
    { label: "A sealed permit or licence", note: "Open the proof page the way a business or inspector would: it shows the permit is authentic, unaltered, issued by the named authority, and timestamped on the blockchain. A forged permit can't pass.", proofUrl: "https://app.letsseal.org/d/sd_c3bb91a69dd88f9eb77ea33a9ac56631" },
    { label: "A planning permission or decision notice", note: "Seal the decision so an applicant, objector, or conveyancer can confirm the permission is genuine and exactly as granted, appeal window and all." },
    { label: "A benefit, tax, or official letter", note: "Seal outbound letters in bulk, so a recipient or a third party relying on the letter can verify it's genuinely from the authority." },
    { label: "A court order or statutory notice", note: "Orders and notices sealed and timestamped on issue, so their authenticity and date can be proven by anyone acting on them." },
  ],
  faq: [
    { q: "Does this stop forged official documents?", a: "A sealed document can't be edited without failing verification, and anyone can check it against the proof link. A forged permit or doctored letter simply won't verify as issued by the authority." },
    { q: "How does a citizen or business verify a document?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the document is genuine, unaltered, and issued by the named authority, free, with no office to phone." },
    { q: "Can we issue at the scale of a whole department?", a: "Yes. Point the CLI or a watched folder at your case system and every letter and permit leaves sealed, timestamped, and carrying a proof link, one command per document, no per-seal fee." },
    { q: "Will documents stay verifiable long term?", a: "Yes. The seal and the blockchain anchor outlive any single vendor, so an official document sealed today stays independently verifiable for years, with standard tools." },
  ],
};

const HR: Sector = {
  slug: "hr-corporate",
  name: "HR & corporate",
  built: true,
  lane: "document",
  eyebrow: "Use cases · HR",
  h1: "Seal and verify HR & corporate documents",
  lede:
    "Employment contracts, references, payslips, and board minutes that carry their own proof, so a new employer, a lender, or a shareholder can confirm a document is genuine, and forged payslips and fake references fail on sight.",
  metaDescription:
    "Seal employment contracts, references, payslips, and board minutes so any employer, lender, or shareholder can prove they're genuine and unaltered, free, standards-based, issued in bulk. Web app and CLI walkthrough.",
  who: "HR teams, company secretaries, boards, and startups",
  documents: [
    "Employment contracts", "Offer & reference letters", "Payslips & P60s", "Board minutes & resolutions",
    "Share certificates", "Right-to-work documents",
  ],
  seo: [
    "verify an employment reference", "authenticate a payslip", "tamper-proof board minutes",
    "detect a fake payslip", "prove a reference letter is genuine",
  ],
  proves: [
    { h: "A payslip or reference that can't be faked", p: "A changed salary, title, or date fails verification. The forged-payslip and fabricated-reference problem, closed at the source." },
    { h: "The issuing company, named", p: "Every letter, payslip, and minute names the company that sealed it, chaining to a published root, provable issuer, not a copied letterhead." },
    { h: "Fixed at the moment of issue", p: "The issue date is timestamped on the blockchain, useful for start dates, notice periods, and the record of a board decision." },
    { h: "Verified without a call to HR", p: "A new employer, a lender, or a shareholder confirms a document at a permalink, instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your company", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority the first time you seal." },
    { h: "Upload or generate the document", p: "Drop in the contract, reference, or payslip. It's sealed with your certificate over the whole file, so any later edit is caught." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The recipient gets a normal PDF that also verifies." },
    { h: "Deliver with a proof link", p: "Every document has a permanent proof page. The employee shares the link; a new employer or lender opens it to confirm the document is genuine." },
  ],
  cli:
    `# Seal every payslip in a run as it's generated
$ sealbot watch /srv/payslips --mode seal --org examples
watching /srv/payslips … sealing new & changed PDFs (idempotent)

# Seal a single reference letter under your company
$ sealbot seal reference-letter.pdf --org examples
sealed   reference-letter.pdf
  proof  https://letsseal.org/d/4d61af…8b70

# A new employer confirms a reference, public, no account
$ sealbot verify reference-letter.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Point a watched folder or your HR/payroll system at Let's Seal and every payslip and letter leaves already sealed, timestamped, and carrying a proof link, one command per document, no per-seal fee.",
  examples: [
    { label: "A sealed payslip", note: "Open the proof page the way a lender or letting agent would: it shows the payslip is authentic, unaltered, issued by the named employer, and timestamped, the fake-payslip problem, solved.", proofUrl: "https://app.letsseal.org/d/sd_026ddeb0f39384a9f4f981597c76760e" },
    { label: "An employment reference or offer letter", note: "Seal references and offers so a new employer can confirm the letter is genuinely from the issuing company, unaltered, no phone call to HR required." },
    { label: "An employment contract", note: "Seal the executed contract so both parties can prove the terms are exactly as agreed, and which version was signed." },
    { label: "Board minutes or a share certificate", note: "Corporate records sealed and timestamped, so a shareholder, investor, or registrar can verify a resolution or certificate is genuine and dated." },
  ],
  faq: [
    { q: "Does this stop fake payslips and references?", a: "A sealed payslip or reference can't be edited without failing verification, and the recipient can check it against the proof link. A fabricated or altered document simply won't verify as issued by the company." },
    { q: "How does a new employer verify a reference?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the document is genuine, unaltered, and issued by the named company, with no call to your HR team." },
    { q: "Can I seal a whole payroll run at once?", a: "Yes. Point the CLI or a watched folder at your payroll output and every payslip leaves sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee." },
    { q: "Does the recipient need special software?", a: "No. They get a normal PDF that opens anywhere, and it also verifies against the public portal and any standard PAdES validator." },
  ],
};

const PROCUREMENT: Sector = {
  slug: "procurement-supply-chain",
  name: "Procurement & supply chain",
  built: true,
  lane: "document",
  eyebrow: "Use cases · Procurement",
  h1: "Seal and verify procurement & tender documents",
  lede:
    "Purchase orders, tender submissions, invoices, and certificates of origin that prove their own authenticity, so a buyer, a supplier, or a bank can confirm a document is genuine and was submitted on time. Altered invoices and backdated tenders fail on sight.",
  metaDescription:
    "Seal purchase orders, tender submissions, invoices, and certificates of origin so any buyer, supplier, or bank can prove they're genuine, unaltered, and submitted on time, free, standards-based. Web app and CLI walkthrough.",
  who: "Buyers, suppliers, tender teams, and trade-finance desks",
  documents: [
    "Purchase orders", "Contracts & NDAs", "Tender submissions", "Invoices",
    "Certificates of origin", "Delivery & goods-received notes",
  ],
  seo: [
    "timestamp a tender submission", "verify a certificate of origin", "tamper-proof invoice",
    "prove a tender was submitted on time", "detect invoice fraud",
  ],
  proves: [
    { h: "Documents that can't be altered", p: "A changed price, quantity, or bank detail fails verification. Invoice-redirection fraud and doctored POs are caught at the source." },
    { h: "The issuing party, named", p: "Every PO, invoice, and certificate names the organisation that sealed it, chaining to a published root, provable issuer, not a spoofed template." },
    { h: "Submitted on time, provably", p: "A tender or bid is timestamped on the blockchain the moment it's sealed, independent proof it existed before the deadline, settling any dispute over lateness." },
    { h: "Verified by the counterparty, free", p: "A buyer, a supplier, or a trade-finance bank confirms a document at a permalink, instantly, and free." },
  ],
  webSteps: [
    { h: "Sign in as your organisation", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing procurement documents." },
    { h: "Seal the document", p: "Upload the tender, PO, or invoice. It's sealed with your certificate over the whole file, so any later edit is caught, and, for a tender, timestamped as proof of submission time." },
    { h: "Anchored and logged automatically", p: "The fingerprint is timestamped on the blockchain and written to the public transparency log. The counterparty gets a normal PDF that also verifies." },
    { h: "Send with a proof link", p: "Every document has a permanent proof page. The buyer, supplier, or bank opens the link to confirm it's genuine and, for a tender, on time." },
  ],
  cli:
    `# Timestamp a tender submission, proof it existed before the deadline
$ sealbot seal tender-submission.pdf --org examples
sealed   tender-submission.pdf
  proof  https://letsseal.org/d/1b73ce…d902
  anchored to the blockchain · recorded in the transparency log

# Seal every outbound invoice automatically
$ sealbot watch /srv/invoices --mode seal --org examples
watching /srv/invoices … sealing new & changed PDFs (idempotent)

# A buyer confirms an invoice, public, no account
$ sealbot verify invoice-88231.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Seal a tender to prove when it was submitted; seal invoices and POs so a counterparty can verify they're genuine and unaltered, one command per document, no per-seal fee.",
  examples: [
    { label: "A timestamped tender submission", note: "Open the proof page the way a procurement panel would: it shows the bid is authentic, unaltered, and, decisively, timestamped on the blockchain before the deadline, settling any dispute over lateness.", proofUrl: "https://app.letsseal.org/d/sd_1e0477f67a87ed349fda8c8ae23612bf" },
    { label: "An invoice", note: "Seal outbound invoices so a buyer can confirm the amount and bank details are exactly as issued, the direct defence against invoice-redirection fraud." },
    { label: "A purchase order or contract", note: "Seal POs and NDAs so both sides can prove the terms are exactly as agreed, and which version was issued." },
    { label: "A certificate of origin or delivery note", note: "Trade documents sealed and dated, so a customs officer or trade-finance bank can verify they're genuine and unaltered along the chain." },
  ],
  faq: [
    { q: "Can this prove a tender was submitted on time?", a: "Yes. Sealing a tender timestamps it on the blockchain the moment it's sealed, independent evidence it existed before the deadline, which settles a dispute over whether a bid was late." },
    { q: "How does this help against invoice fraud?", a: "A sealed invoice can't be edited. A changed amount or bank detail fails verification, and the buyer can check it against the proof link. Invoice-redirection fraud, which relies on altering a genuine invoice, is caught." },
    { q: "How does a counterparty verify a document?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the document is genuine, unaltered, and issued by you, with no call required." },
    { q: "Can I seal every invoice automatically?", a: "Yes. Point the CLI or a watched folder at your finance system and every invoice leaves sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee." },
  ],
};

const MANUFACTURING: Sector = {
  slug: "manufacturing-trade",
  name: "Manufacturing & trade",
  built: true,
  lane: "anyfile",
  eyebrow: "Use cases · Manufacturing",
  h1: "Seal and verify certificates of conformity & trade documents",
  lede:
    "Certificates of conformity, mill certificates, test reports, and bills of lading that carry their own proof, so a customer, a customs officer, or an auditor can confirm a document is genuine, and forged conformity certs and altered test reports fail on sight.",
  metaDescription:
    "Seal certificates of conformity, mill certificates, test reports, and bills of lading so any customer or auditor can prove they're genuine and unaltered, free, standards-based, issued in bulk. Web app and CLI walkthrough.",
  who: "Manufacturers, logistics, food & agri, and automotive",
  documents: [
    "Certificates of conformity (CoC)", "Mill / material certificates", "Test & inspection reports",
    "Bills of lading", "Customs documents", "Batch / lot records",
  ],
  seo: [
    "verify certificate of conformity", "authenticate a mill certificate", "product provenance proof",
    "detect a fake test report", "tamper-proof certificate of analysis",
  ],
  proves: [
    { h: "Certificates that can't be forged", p: "A changed grade, result, or spec fails verification. The fake-conformity-cert and doctored-mill-cert problem, a real one in steel, materials, and food, closed at the source." },
    { h: "The manufacturer or lab, named", p: "Every certificate and report names the organisation that sealed it, chaining to a published root, provable issuer, not a copied stamp." },
    { h: "Fixed at the moment of issue", p: "The issue date is timestamped on the blockchain, decisive for batch traceability, recalls, and which certificate applied to which lot." },
    { h: "Verified across the supply chain, free", p: "A customer, a customs officer, or an auditor confirms a document at a permalink, instantly, and free, anywhere along the chain." },
  ],
  webSteps: [
    { h: "Sign in as your organisation", p: "Open app.letsseal.org and sign in. Your organisation gets its own certificate authority for sealing certificates and reports." },
    { h: "Seal the certificate or report", p: "Upload the CoC, mill cert, or test report; it's sealed over the whole file, so any later edit to a grade or result is caught." },
    { h: "Or anchor raw test data by hash", p: "For large datasets and instrument output, anchor just the hash. The data never leaves your systems, only the digest." },
    { h: "Ship with a proof link", p: "Every document has a permanent proof page. Put the link with the goods or the shipping pack; anyone downstream verifies it's genuine." },
  ],
  cli:
    `# Seal every certificate of conformity as it's issued
$ sealbot watch /srv/certs --mode seal --org examples
watching /srv/certs … sealing new & changed PDFs (idempotent)

# Seal a mill certificate under your organisation
$ sealbot seal mill-certificate-3.1.pdf --org examples
sealed   mill-certificate-3.1.pdf
  proof  https://letsseal.org/d/9c04af…5d31

# A customer or customs officer confirms it, public, no account
$ sealbot verify mill-certificate-3.1.pdf
✓ authentic · unaltered · sealed by Let's Seal Examples`,
  cliNote:
    "Seal certificates and reports as they're issued, or anchor raw test data by hash. Each carries a permanent proof link verifiable anywhere along the supply chain, no per-seal fee.",
  examples: [
    { label: "A sealed certificate of conformity", note: "Open the proof page the way a customer's goods-in team would: it shows the certificate is authentic, unaltered, issued by the named manufacturer, and timestamped. A forged CoC can't pass.", proofUrl: "https://app.letsseal.org/d/sd_e29270e5bb6566945aebe8e678f29584" },
    { label: "A mill or material certificate", note: "Seal EN 10204 3.1 mill certs so a fabricator or inspector can confirm the material grade and heat data are exactly as certified, a known target for forgery." },
    { label: "A test or inspection report", note: "Lab and QC reports sealed on issue, so a customer or auditor can verify the results are the genuine, unedited findings." },
    { label: "A bill of lading or customs document", note: "Trade and shipping documents sealed and dated, so a customs officer or consignee can confirm they're genuine and unaltered in transit." },
  ],
  faq: [
    { q: "Does this stop fake conformity or mill certificates?", a: "A sealed certificate can't be edited without failing verification, and anyone downstream can check it against the proof link. A forged CoC or doctored mill cert, a real problem in materials and food supply chains, simply won't verify as issued by you." },
    { q: "How does a customer verify a certificate?", a: "They open the proof link, or drop the PDF into the public verifier. It confirms the certificate is genuine, unaltered, and issued by the named manufacturer or lab, with no call required." },
    { q: "Can I seal certificates at production volume?", a: "Yes. Point the CLI or a watched folder at your QA output and every certificate leaves sealed, timestamped, and carrying a proof link, one command per file, no per-seal fee." },
    { q: "What about large raw test datasets?", a: "Anchor just the SHA-256, the data never leaves your systems, only its digest, and still prove it existed unaltered as of a date." },
  ],
};

const INDIVIDUALS: Sector = {
  slug: "individuals-freelancers",
  name: "Individuals & freelancers",
  built: true,
  lane: "anyfile",
  eyebrow: "Use cases · Individuals",
  h1: "Prove any file is yours, and hasn't changed",
  lede:
    "Any file you want to prove you had, unchanged, by a certain date, a manuscript, a design, a contract, a photo. Seal it or timestamp it, and you hold independent, dated evidence anyone can check, free, forever.",
  metaDescription:
    "Prove you had any file, a manuscript, design, contract, or photo, unchanged, by a certain date. Free timestamping and sealing on public infrastructure, verifiable by anyone, forever. Web app and CLI walkthrough.",
  who: "Anyone with a file worth proving",
  documents: [
    "Manuscripts & writing", "Designs & creative work", "Personal agreements", "Photos & video",
    "Freelance deliverables", "Important documents",
  ],
  seo: [
    "prove I wrote this first", "free document timestamp", "prove a file hasn't changed",
    "timestamp a file free", "prove I created something on a date",
  ],
  proves: [
    { h: "You had it by a certain date", p: "A timestamp on the blockchain pins the moment your file existed, the evidence that settles “I had this first” for writing, designs, or ideas." },
    { h: "Unaltered since you sealed it", p: "The file is byte-for-byte as you fixed it. Any later change fails verification, so the dated version is provably the version." },
    { h: "Attributable to you, if you want", p: "Sign in with Google or GitHub to attach your verified email to the seal, attribution by a provider you already use, layered on top of the timestamp." },
    { h: "Free, and provable forever", p: "The blockchain anchor doesn't depend on any company. A file you seal today stays verifiable indefinitely, by anyone, with standard tools." },
  ],
  webSteps: [
    { h: "Sign in, Google or GitHub", p: "Open app.letsseal.org and sign in with an account you already have. No new account to create." },
    { h: "Seal or timestamp your file", p: "Drop in the file. Seal it to attach your verified identity, or just timestamp it to prove existence and date, your choice." },
    { h: "It's anchored on the blockchain", p: "The file's fingerprint is timestamped on the blockchain and recorded in the public transparency log. You get a proof link and, for files, a normal copy that also verifies." },
    { h: "Keep the proof", p: "Save the proof link or the .ots file. It's the independent, dated evidence you produce if anyone ever questions who had the file first." },
  ],
  cli:
    `# Timestamp any file. Only its hash leaves your machine
$ sealbot anchor my-manuscript.docx --publish
anchored my-manuscript.docx → my-manuscript.docx.ots
  proof  https://letsseal.org/d/…  (digest only, file never uploaded)

# Prove the date later, against the blockchain, with stock tooling
$ ots verify my-manuscript.docx.ots
Success! Bitcoin attests existence as of 2026-06-30

# Or verify a file someone sent you is unchanged
$ sealbot verify deliverable.pdf
✓ authentic · unaltered`,
  cliNote:
    "Anchoring proves existence-and-date without the file ever leaving your machine, only its SHA-256. Sign in with Google or GitHub if you also want your verified identity attached. Both are free.",
  examples: [
    { label: "A timestamped manuscript or design", note: "Open the proof page the way you'd show it to prove you had the work first: it shows the file is unaltered and independently timestamped on the blockchain, a date no one can move.", proofUrl: "https://app.letsseal.org/d/sd_b07a9bb4ebb5d4e4b8f320edc5c9e962" },
    { label: "A freelance deliverable", note: "Seal what you hand a client so both of you can prove exactly what was delivered, and when, no argument later about which version was sent." },
    { label: "A personal agreement", note: "Seal an agreement between individuals so each party can prove the terms are exactly as agreed, and which version was signed." },
    { label: "A private file (hash-only)", note: "Anchor just a file's SHA-256, the file never leaves your machine, and still prove you had it, unchanged, by a date. Reveal it only if you choose to." },
  ],
  faq: [
    { q: "Do I need to create an account?", a: "No new account. Sign in with Google or GitHub to attach your verified identity, or just anchor a file's hash from the CLI with no sign-in at all. Either way it's free." },
    { q: "Is it really free?", a: "Yes. Sealing and timestamping are free, and verifying is always free for anyone. The proof stands on public infrastructure, not on paying us." },
    { q: "How does this prove I created something first?", a: "It pins your file to a blockchain timestamp, so you can prove it existed by that date. If someone later claims the work, your dated, tamper-evident proof came first." },
    { q: "Can I keep the file private?", a: "Yes. Anchor just the SHA-256. The file never leaves your machine, only its 32-byte digest, and the timestamp still proves it existed by that date. You reveal the file only if and when you want to." },
  ],
};

const STUBS: Sector[] = [];

export const SECTORS: Sector[] = [
  LAW, INSURANCE, SOFTWARE, COMPLIANCE, PROPERTY, EDUCATION, MEDIA, IP,
  BANKING, ACCOUNTING, INVESTMENT, CONSTRUCTION, SURVEYING, HEALTHCARE, PHARMA,
  GOVERNMENT, HR, PROCUREMENT, MANUFACTURING, INDIVIDUALS, ...STUBS,
];

export const BUILT_SECTORS = SECTORS.filter((s) => s.built);

export function getSector(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug && s.built);
}

export const JOBS: { n: string; h: string; p: string }[] = [
  { n: "01", h: "Prove authenticity & integrity", p: "Show a document is genuine and hasn't been altered since issue, the anti-forgery, anti-tamper case." },
  { n: "02", h: "Timestamp, prove it existed", p: "Prove a file existed by a certain date: prior art, priority, deadlines, “I had this first”." },
  { n: "03", h: "Prove authorship & provenance", p: "Show who created or issued a work, for IP, attribution, and anti-plagiarism." },
  { n: "04", h: "Bulk-issue verifiable documents", p: "Seal thousands of statements, certificates, or invoices automatically inside an existing workflow." },
  { n: "05", h: "Media provenance vs. deepfakes", p: "Content Credentials on photos and video: this is real, this is who shot it, this is unedited." },
  { n: "06", h: "Evidence & chain of custody", p: "Forensic files, disclosure, incident records, provably unchanged from collection onward." },
  { n: "07", h: "Software supply-chain integrity", p: "Sign build artifacts, containers, and SBOMs; prove a release is genuine and untampered." },
  { n: "08", h: "Verifiable credentials", p: "Degrees, licences, memberships, and certificates anyone can check without phoning the issuer." },
  { n: "09", h: "Long-term archival integrity", p: "Records that must stay provable for years. The seal and blockchain anchor outlive any single vendor." },
  { n: "10", h: "Regulatory & compliance evidence", p: "Audit trails, data integrity, retention, provable, timestamped, and independently checkable." },
];

export const FORMS: { for: string; form: string }[] = [
  { for: "PDF", form: "PAdES (embedded)" },
  { for: "Images / video / audio", form: "C2PA Content Credentials" },
  { for: "XML", form: "XML-DSig" },
  { for: "Email", form: "S/MIME" },
  { for: "Any other file", form: "detached CMS .sig" },
  { for: "Code & artifacts", form: "cosign-compatible" },
];
