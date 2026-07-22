import { CodeBlock } from "../../_components/ui";
import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("pinned-root")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function RootChain() {
  const boxes = [
    { t: "Root CA", s: "offline · EC P-256 · pin the SHA-256", accent: true },
    { t: "Intermediate", s: "10 yr · pathlen:0" },
    { t: "Per-business signing cert", s: "5 yr" },
  ];
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
      <div className="flex flex-1 flex-col">
        {boxes.map((b, i) => (
          <div key={b.t}>
            <div
              className={`rounded-xl border p-4 ${
                b.accent ? "border-blue-600 bg-blue-50" : "border-stone-200 bg-stone-50"
              }`}
            >
              <div className="text-[14px] font-semibold text-stone-900">{b.t}</div>
              <div className="mt-1 text-[12.5px] leading-snug text-stone-500">{b.s}</div>
            </div>
            {i < boxes.length - 1 && (
              <div className="flex justify-center py-2 text-stone-300" aria-hidden>
                <span className="block rotate-90">&rarr;</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="sm:w-56 sm:pt-1">
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-100 p-4 text-center">
          <div className="text-[12px] font-semibold text-stone-400">
            OS / Adobe / browser trust stores
          </div>
          <div className="mt-1.5 text-[11.5px] leading-snug text-stone-400">
            vendor-granted trust lives here
          </div>
        </div>
        <div className="mt-3 text-[12px] leading-snug text-stone-500">
          {"Verifiers pin the root by SHA-256, fetched from "}
          <span className="font-mono text-[11.5px] text-stone-700">/api/root-ca</span>
          {"."}
        </div>
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
          "A certificate authority usually wants to be everywhere at once: baked into your operating system, your browser, your PDF reader, trusted the moment you unbox a laptop. The Let's Seal root takes a different path: you pin it yourself, by its fingerprint. This is the more honest arrangement, and here is why."
        }
      />

      <Prose>
        <H2>The problem with being trusted by default</H2>
        <P>
          {
            "When a certificate authority ships inside your operating system, your browser, or Adobe Acrobat, something quiet happens. Every machine that receives that update now trusts it automatically, before anyone chooses to. A vendor vetted the key, decided it was worth relying on, and the trust arrived in the background with a routine software update. For most of the web that convenience is the whole point, because approving certificate authorities by hand would be impractical. For a system whose entire promise is that you can check everything yourself, it is exactly the wrong default."
          }
        </P>
        <P>
          {
            "Certificate authorities in the web public key infrastructure earn that ambient trust for a good reason. A browser must decide on its own about every site you visit, so it leans on a curated list decided by others. A Let's Seal seal is a durable claim about a document, one that may need to hold up years from now, in front of a stranger to the original transaction. That kind of claim deserves an explicit trust decision, made once, by the person doing the checking."
          }
        </P>
        <P>
          {
            "We built Let's Seal so that trust is something you grant on purpose, and can see that you have granted. Ambient, vendor-supplied trust runs against that grain. So the root sits in no trust store at all, and it will stay that way."
          }
        </P>

        <Stats
          items={[
            { k: "1 fingerprint", l: "the whole trust decision, pinned by you" },
            { k: "20 yr", l: "root validity (2026 to 2046)" },
            { k: "P-256", l: "root key: ECDSA, SHA-256" },
          ]}
        />

        <H2>What a place in the trust store would cost</H2>
        <P>
          {
            "Getting into those stores takes more than asking. The operating system and browser vendors run trust programmes with their own rules, audits, and commercial arrangements, and the CA/Browser Forum sets baseline requirements that shape what a member authority may do. Joining would mean accepting that governance, and in practice paying to sit on a list. It would also mean that Apple, Microsoft, Google, Adobe, and Mozilla were, in effect, vouching for us to their users. We want people to trust a Let's Seal seal because they checked it themselves."
          }
        </P>
        <P>
          {
            "There is a subtler cost too. A root in the global stores is trusted silently and everywhere. If that key were ever misused or compromised, the blast radius would be every device that shipped with it, and the people relying on it would struggle to even notice. Pinning turns that around. Trust becomes explicit and local. This verifier, on this machine, has chosen to trust this one key, and can point to the exact fingerprint it pinned."
          }
        </P>
        <P>
          {
            "This is the same asymmetry behind our choice of a blue mark over a green one. A green tick in a PDF reader means a certificate paid its way onto a private trust list, and the reader vouches for it on your behalf. We earn trust in the open instead, by handing you the fingerprint to check for yourself."
          }
        </P>

        <H2>Pinning by fingerprint, on your own authority</H2>
        <P>
          {
            "The root is identified by its SHA-256 fingerprint, a single value you can pin and compare. A fingerprint is just the hash of the certificate, so pinning it means you trust one specific key and that key alone. A verifier accepts the certificate only when it hashes to the value pinned; anything else fails, full stop. Your pinned value is the whole authority, and it stands over any vendor default."
          }
        </P>
        <P>
          {
            "A fingerprint has the useful property of being stable and self-describing. It changes only when the certificate changes, it is short enough to read down a phone line or print on a page, and comparing two of them is something a person or a script can do in seconds. That is the whole trust decision, reduced to one value you can carry with you."
          }
        </P>
        <P>{"The values are public, and meant to be. Here is the whole identity of the anchor:"}</P>
        <div className="mt-4">
          <CodeBlock>
            {`Subject:   CN=Let's Seal Root CA, O=Let's Seal, C=GB
Validity:  8 July 2026 to 3 July 2046 (20 years)
Key:       EC P-256 (prime256v1), SHA-256 signatures

Root         02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:
SHA-256      0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE

Intermediate CD:7D:88:96:CB:F4:96:B0:0D:C6:2B:A1:4C:9C:A0:3D:
SHA-256      E3:4A:E5:20:C0:08:DA:59:19:96:63:E4:64:85:D1:AF`}
          </CodeBlock>
        </div>
        <P>
          {
            "You can pin these from our documentation, from a colleague who already has them, or from more than one source and compare. The private key stays in our custody, always."
          }
        </P>
        <Figure caption="The root signs one intermediate, which signs each business's signing certificate. You pin the root by SHA-256 from /api/root-ca and check the chain locally.">
          <RootChain />
        </Figure>

        <H2>One offline root, a chain that stays short</H2>
        <P>
          {
            "The root itself does as little as possible. It lives offline, and its only job is to sign one intermediate. That intermediate, valid for ten years and marked "
          }
          <B>pathlen:0</B>
          {
            " so it can issue only leaf certificates, signs each business's signing certificate, valid for five years. Keeping the root offline and idle is what lets it safely last two decades. It stays idle almost all the time, so it is rarely exposed, and the twenty-year validity follows deliberately from that."
          }
        </P>
        <P>
          {
            "Short-lived identity is handled on a separate track. A distinct, online Identity CA intermediate mints identity leaves that live for about fifteen minutes and are bound to an OIDC login. Isolating that busy, online machinery from the offline root keeps the blast radius small. If the identity path ever had a bad day, the root that anchors everything would be untouched, still offline, still the exact key you pinned."
          }
        </P>
        <P>
          {
            "The intermediate also exists so that the root rarely has to act. If we ever needed to rotate signing keys, or retire an intermediate, we could do it while leaving the root alone and your pin unchanged. The value you pinned is the one long-lived anchor, and everything beneath it can change while every verification you have already relied on keeps working."
          }
        </P>

        <H2>How a verifier actually uses it</H2>
        <P>
          {
            "Getting the root is a plain HTTP request. A GET to /api/root-ca returns the public certificate as letsseal-root-ca.crt, cached for twenty-four hours. The private key stays put. A verifier pins that file by its SHA-256 and then validates the whole chain locally, with ordinary tools:"
          }
        </P>
        <div className="mt-4">
          <CodeBlock>
            {`openssl cms -verify -CAfile letsseal-root.crt sealed.p7s
xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml
python spec/verify.py sealed.pdf`}
          </CodeBlock>
        </div>
        <P>
          {
            "All of that runs locally. The chain, the open standards the signatures follow, and the public ledger the log is pinned to are enough on their own. The point of naming three different tools is that each one belongs to someone else. openssl, xmlsec1, and a short Python script that follows the published spec all reach the same verdict, because they are all doing the same standards-based check against the same pinned anchor. If you distrust one, use another. If you distrust all of them, read the spec and write your own."
          }
        </P>
        <P>
          {
            "For the Sigstore world there is a second anchor. The file "
          }
          <B>trusted_root.json</B>
          {
            " is a Sigstore-format anchor that declares our CA together with our transparency log's public key. With it, stock cosign can verify a Let's Seal seal and its inclusion in our transparency log, entirely against our own infrastructure. It is the same principle in a different toolchain. You point a standard verifier at an anchor we publish, and it checks the mathematics for itself."
          }
        </P>
        <P>
          {
            "This is what self-anchored means. Verification rests on three things: the root we publish, the open standards the signatures follow, and the public ledger the log is pinned to. Those three stand on their own, independent of any vendor's blessing and of whether Let's Seal is still trading. Pin the fingerprint once, and every seal we have ever made stays checkable, on your terms, long after us."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
