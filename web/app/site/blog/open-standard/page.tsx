import { CodeBlock } from "../../_components/ui";
import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("open-standard")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function StandardMap() {
  const layers = ["PAdES / X.509", "SHA-256", "OpenTimestamps", "Bitcoin", "The published root"];
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="text-[13px] font-semibold text-stone-900">Let&rsquo;s Encrypt / ISRG</div>
          <div className="mt-2 text-[12.5px] leading-snug text-stone-500">
            Free TLS certificates, run by a nonprofit.
          </div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-[13px] font-semibold text-stone-900">Let&rsquo;s Seal / Experimental Open Works</div>
          <div className="mt-2 text-[12.5px] leading-snug text-stone-500">
            Free document proof, run by a nonprofit.
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {layers.map((layer) => (
          <div
            key={layer}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-[13px] font-medium text-stone-800"
          >
            {layer}
          </div>
        ))}
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
          "Most tools that promise to prove your documents are real are quietly asking you to trust them, and to keep paying them. We built Let's Seal the other way round, as an open specification that keeps working on its own, on public standards and a public ledger."
        }
      />

      <Prose>
        <H2>The problem with a proof you have to trust</H2>
        <P>
          {
            "There is a familiar trap with anything that claims to authenticate a document. The proof is only as durable as the company behind it. If the vendor raises its prices, changes its terms, gets acquired, or shuts down, the certificates you relied on can stop verifying, or fall hostage to a subscription. A proof that fails the moment the provider stops answering the phone was only ever a service you were renting, dressed up as evidence."
          }
        </P>
        <P>
          {
            "So Let's Seal is, at heart, a specification that anyone can implement, published under an open licence, resting entirely on standards and a public ledger. We run a friendly hosted version of it, though the hosted version is the least important part. What matters is that the format is open, the code is open, and the proof outlives us."
          }
        </P>

        <Stats
          items={[
            { k: "£0", l: "to seal or to verify, forever" },
            { k: "2", l: "licences: CC-BY-4.0 spec, Apache-2.0 code" },
            { k: "v1.1", l: "the published SEAL specification" },
          ]}
        />

        <H2>A specification, published and licensed to reuse</H2>
        <P>
          {"The format has a name and a version number. It is the "}
          <B>SEAL specification, version 1.1</B>
          {
            ", and it is published. Version 1 defined the core: a PAdES signature over the document, an OpenTimestamps anchor for the time, and the verification convention that ties them together. Version 1.1 is purely additive. It layers on optional profiles for supply-chain provenance, transparency-log inclusion, and provider-verified identity, while keeping exactly what it takes to conform to Version 1. Everything you sealed under the original spec stays valid, and new capability arrives as profiles you can opt into."
          }
        </P>
        <P>
          {"The licences are chosen so that reusing this is genuinely free. The specification itself is "}
          <B>CC-BY-4.0</B>
          {
            ", which means you may read it, quote it, translate it, and build on it, owing only attribution. The reference implementation is "
          }
          <B>Apache-2.0</B>
          {
            ", which carries an express patent grant to every implementer. That patent grant matters more than it sounds. It binds us: every implementer keeps the patent rights they need, permanently, including those who adopt long after the format catches on. The door is bolted open."
          }
        </P>
        <P>
          {
            "SEAL is free for anyone to implement, for any purpose, commercial or otherwise. Start today: read the spec and build. If a competitor wants to build a rival sealing tool on the same format tomorrow, we would count that a success, because it would mean the standard is doing its job."
          }
        </P>

        <H2>Open all the way down</H2>
        <P>
          {"The whole thing stands on four pillars, and each one puts control in your hands. It is "}
          <B>open source</B>
          {", Apache-2.0 on GitHub. It is built on "}
          <B>open standards</B>
          {
            ": PAdES signatures, X.509 certificates, SHA-256, and OpenTimestamps, every one of them public and maintained beyond us. It records to an "
          }
          <B>open ledger</B>
          {
            ": the blockchain, plus an append-only transparency log whose root we publish. And it is designed to "
          }
          <B>run yourself, keeping your own keys</B>
          {
            ". Prefer to run everything on your own hardware? The entire system self-hosts, and the recipe is short."
          }
        </P>
        <Figure caption="verify with stock tools you already trust">
          <StandardMap />
        </Figure>
        <div className="mt-4">
          <CodeBlock>{`git clone <the repo>
cp .env.example .env
./deploy.sh`}</CodeBlock>
        </div>
        <P>
          {
            "That is the full deployment. Clone the repository, copy the example environment file, run the deploy script, and you have your own instance of Let's Seal, issuing seals in exactly the same open format. The seals your instance produces verify against the same public standards as ours, because they are the same standards. The whole system is the open one you can read, and everything needed to run it ships in the repository. Prefer to stand on your own? Run your own instance, free."
          }
        </P>

        <H2>Verifiable by anyone, forever</H2>
        <P>
          {
            "Here is the test we hold every design decision to. Both sealing and verifying must run on public standards and a public ledger alone, so the proof stands on its own, outliving the project. This is a constraint we designed the format around, and it is the reason the format looks the way it does."
          }
        </P>
        <P>
          {"The minimal dependency for checking a seal is short enough to state in one sentence. You need a standard "}
          <B>PAdES and X.509 validator</B>
          {", plus the "}
          <B>stock OpenTimestamps client</B>
          {
            ". That is the entire dependency list. Both tools are open, widely available, and maintained by communities independent of us. Even if Let's Seal vanished tomorrow, every seal ever made would stay verifiable with software you can already download today. The proof belongs to the public formats it is written in."
          }
        </P>

        <H2>Stewarded for the public good</H2>
        <P>
          {"It helps to say the governance plainly, because vague governance is how open things quietly get enclosed. Let's Seal is stewarded by "}
          <B>Experimental Open Works</B>
          {
            ", a home for free, public-benefit infrastructure. The shape of that arrangement is deliberately the same as the one behind Let's Encrypt, which is run by the nonprofit ISRG. The name echoes Let's Encrypt on purpose. It is a promise about what kind of thing this is."
          }
        </P>
        <P>
          {
            "Experimental Open Works runs on public-benefit footing, answerable to its users alone. Sealing is free and verifying is free, permanently, the kind that stays free once you depend on it. The only people to satisfy are the users, so your proofs stay yours to reach."
          }
        </P>
        <P>
          {
            "That is the difference between a product and a standard. A product is something you buy, and it lasts as long as the seller wants it to. A standard is something you build on, and it lasts as long as anyone still uses it. We chose to be the second kind, and we built Let's Seal so the choice holds, even against a future us that might wish otherwise."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
