import { CodeBlock } from "../../_components/ui";
import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("format-native-signatures")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function LaneGrid() {
  const lanes = [
    { t: "PDF", s: "PAdES (EN 319 142)" },
    { t: "Image, video, audio", s: "C2PA 2.x" },
    { t: "XML", s: "XML-DSig" },
    { t: "Email", s: "S/MIME (RFC 8551)" },
    { t: "Any file", s: "CAdES (EN 319 122)" },
    { t: "Software", s: "cosign" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {lanes.map((lane) => (
          <div
            key={lane.t}
            className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center"
          >
            <div className="text-[13px] font-semibold text-stone-900">{lane.t}</div>
            <div className="mt-1.5 text-[12px] leading-snug text-blue-600">{lane.s}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center text-stone-300" aria-hidden>
        <span className="text-[18px] leading-none">&darr;</span>
      </div>
      <div className="mt-3 rounded-xl bg-blue-600 px-4 py-4 text-center text-[13px] font-semibold text-white">
        Let&rsquo;s Seal published root
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <PostHead
        eyebrow={post.eyebrow}
        title={post.title}
        dateLabel={post.dateLabel}
        readingTime={post.readingTime}
        lede={
          "A PDF, a photo, an email and a container image are four different kinds of thing, and each carries a signature its own way. So we sign each in the signature standard its own ecosystem already understands, and every one of them chains back to a single published root."
        }
      />

      <Prose>
        <H2>The temptation to invent one wrapper</H2>
        <P>
          {
            "The easy way to sign many kinds of file is to invent your own container. Take any file, wrap it in a proprietary envelope, sign the envelope, and ship a verifier that knows how to open it. It is easy to build, and it is a trap. The moment your signature only makes sense inside your own format, checking it means running your software. That is lock-in wearing the costume of security."
          }
        </P>
        <P>
          {
            "We took the opposite decision. Each file family already has, or plainly lacks, a native convention for carrying a signature. So a conforming Let's Seal artifact carries a signature over its bytes in its format-native delivery form. The signed thing is still a normal PDF, a normal image, a normal email. And it verifies with the stock third-party tools that format's world already runs, entirely on its own."
          }
        </P>
        <P>
          {
            "The cost of that choice is that each format demands its own signing routine. We have to know each one properly: where PAdES expects its signature dictionary, how C2PA structures a manifest, what enveloped means in XML-DSig. The payoff lands with the person on the receiving end: they open the file the way they always would, and their own software tells them whether the signature holds."
          }
        </P>

        <H2>Six lanes, one signature standard each</H2>
        <Stats
          items={[
            { k: "6", l: "file families, one signature standard each" },
            { k: "1", l: "root every format chains to" },
            { k: "ENTIRE_FILE", l: "the only PDF coverage that passes" },
          ]}
        />
        <P>
          {
            "The SEAL spec (section 2) sets out six lanes. A PDF is signed with PAdES, the ETSI EN 319 142 profile, embedded in the PDF and required to cover the whole file, using the ETSI.CAdES.detached subfilter. Images, video and audio carry a C2PA 2.x manifest, the Content Credentials standard, signed and embedded in the media so any C2PA-aware tool can read it. XML is signed with W3C XML Signature, enveloped, and checks out under xmlsec1."
          }
        </P>
        <P>
          {
            "Email uses S/MIME, the RFC 8551 form every mail client already speaks: multipart/signed with a detached CMS signature. Anything that has no native signature slot gets a detached CAdES sidecar, ETSI EN 319 122: a small file.sig alongside the original that signs the file's SHA-256. It is the detached sibling of PAdES, the same AdES family and the same X.509. And software artifacts, container images and attestations use cosign and sigstore: raw ECDSA P-256 blob signatures, OCI simple-signing, and in-toto v1 statements in a DSSE envelope over SPDX, CycloneDX or SLSA."
          }
        </P>
        <Figure caption="Six file families, each signed in the standard its own ecosystem verifies. Different signature forms on the surface, one published Let's Seal root underneath. Shared across all six: X.509 and SHA-256.">
          <LaneGrid />
        </Figure>
        <P>
          {
            "The lanes look different on the surface because their ecosystems are different, but they share the same spine. Every one of them is built on X.509 certificates and SHA-256, and every one of them chains to the same published Let's Seal root. Six signature conventions, one anchor of trust."
          }
        </P>

        <H2>Why native beats bespoke</H2>
        <P>
          {
            "Signing in the native standard means the verification is already installed. Adobe Acrobat checks the PAdES signature in a PDF. Any C2PA reader checks the manifest in an image. xmlsec1 checks the XML. The recipient's mail client checks the S/MIME. cosign checks the software artifact. Every one of them does the job knowing only its own standard. The tools you already have are the tools that verify our seals."
          }
        </P>
        <P>
          {
            "That is the whole argument against the proprietary wrapper. A wrapper trades a small convenience for a permanent dependency on the party that made it. Format-native signing spends a little more effort up front, one standard per lane, and buys back the property that matters most: if we disappeared, every seal we ever issued would keep verifying with tools that anyone can run. One root covers every format, and every format stays readable on its own."
          }
        </P>
        <P>
          {
            "It also explains the sixth lane, the detached CAdES sidecar for anything else. Some files simply have no place to put a signature: a plain text file, a spreadsheet, a proprietary binary. So we keep the same standard we already use and detach it. The signature moves into a file.sig sibling that signs the file's SHA-256, so the original stays byte-for-byte identical and the sidecar travels beside it. Same AdES family, same X.509, a format everyone already knows."
          }
        </P>

        <H2>The rule that catches tampering</H2>
        <P>
          {
            "There is one load-bearing rule that most signature schemes get quietly wrong, and it is the reason a valid signature can hold even when the document has changed. A signature only ever covers a specific range of bytes. In a PDF, that range is recorded explicitly. And a PDF can be extended after it was signed through an incremental update: new content is appended to the end of the file, leaving the original bytes, and the original signature, exactly as they were."
          }
        </P>
        <P>
          {
            "The consequence is subtle. A tool like exiftool can append to a signed PDF via an incremental update, and the original signature stays cryptographically valid over its original bytes. The maths still checks out. But the file you are holding now carries content added after the signer approved it. A signature that covers only part of a file tells the truth about that part and stays silent on the rest."
          }
        </P>
        <P>
          {"So Let's Seal requires the signature's coverage to equal "}
          <B>ENTIRE_FILE</B>
          {
            ". A signature that covers only part of the bytes, because content was appended after signing, earns an altered verdict. The verdict rule is deliberately strict: authentic = valid AND intact AND trusted. A valid signature over stale bytes fails the intact test, so the verdict stops at altered."
          }
        </P>
        <P>
          {
            "That strictness is the point. A mark that turned green for a signature covering only the first few kilobytes of a document would be actively dangerous, because it would look like assurance while hiding the appended pages. By insisting coverage equal the whole file, the seal means exactly what a reader assumes it means: this is the document that was signed, all of it, exactly as it left the signer."
          }
        </P>

        <H2>Check it with the ecosystem's own tools</H2>
        <P>
          {
            "Because every lane signs in a public standard, you verify with that standard's own client. A detached CAdES sidecar checks against our root with plain OpenSSL:"
          }
        </P>
        <div className="mt-4">
          <CodeBlock>openssl cms -verify -CAfile letsseal-root.crt -in file.sig -content file</CodeBlock>
        </div>
        <P>
          {
            "The pattern is the same in every other lane. XML verifies with xmlsec1 against the same root, software artifacts verify with stock cosign, PDFs verify in any PAdES-aware reader, and media verifies in any C2PA tool. In each case you supply the Let's Seal root once and the ecosystem's own tool does the rest. That is what format-native buys you: six kinds of file, one root to trust, and every check running on tools you already have."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
