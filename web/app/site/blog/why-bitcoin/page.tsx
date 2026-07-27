import { CodeBlock } from "../../_components/ui";
import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("why-bitcoin")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function AnchorFlow() {
  const steps = [
    { n: "1", t: "Your file", s: "SHA-256 digest, 32 bytes. Your file stays on your machine." },
    { n: "2", t: "4 calendars", s: "Independent OpenTimestamps servers collect hashes from everyone." },
    { n: "3", t: "1 blockchain transaction", s: "Thousands of hashes are batched together and committed at once." },
    { n: "4", t: "Confirmed", s: "The block is checked against the blockchain itself, and its height recorded." },
  ];
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      {steps.map((step, i) => (
        <div key={step.n} className="flex flex-1 items-stretch gap-3">
          <div className="flex-1 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[12px] font-semibold text-white">
              {step.n}
            </div>
            <div className="mt-3 text-[14px] font-semibold text-stone-900">{step.t}</div>
            <div className="mt-1.5 text-[12.5px] leading-snug text-stone-500">{step.s}</div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-center justify-center text-stone-300" aria-hidden>
              <span className="hidden sm:block">&rarr;</span>
              <span className="block rotate-90 sm:hidden">&rarr;</span>
            </div>
          )}
        </div>
      ))}
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
          "Every Let's Seal seal answers two questions: what is this file, and when did it exist. The first is a signature problem. The second is a trust problem, because a timestamp is only ever as good as the clock behind it."
        }
      />

      <Prose>
        <H2>A timestamp you issue is only a claim</H2>
        <P>
          {
            "When a service stamps a document with the time, you are trusting that service's clock and its honesty. If our server were compromised, or if we were compelled to, we could in principle sign a document with yesterday's date, or tomorrow's. A timestamp the issuer can move is only a claim."
          }
        </P>
        <P>
          {"We wanted "}
          <B>when</B>
          {
            " to be a fact: fixed the moment it is set, beyond our reach to alter, and yours to verify on your own."
          }
        </P>

        <H2>A clock the whole world shares</H2>
        <P>
          {
            "A public blockchain is an ownerless, append-only ledger that anyone can read and no one can quietly rewrite. Every block is chained to the one before it, and rewriting an old block would mean redoing all the work stacked on top of it, across a global network, faster than that network keeps building. That puts backdating beyond reach. Once a piece of data is committed to a block, the whole world can see it was there by that block, and it stays fixed for everyone, us included. The design works with any ownerless public ledger that holds this property; we chose Bitcoin."
          }
        </P>
        <P>{"So we keep no clock of our own. We borrow the world's."}</P>

        <H2>How your hash reaches a block, privately</H2>
        <Stats
          items={[
            { k: "32 bytes", l: "of your file leave your machine: its SHA-256 digest alone" },
            { k: "4", l: "independent OpenTimestamps calendars aggregate it" },
            { k: "£0", l: "thousands of hashes share one transaction on the blockchain, so anchoring is free" },
          ]}
        />
        <P>
          {
            "We use OpenTimestamps, an open standard for blockchain timestamping. The privacy detail matters: your file stays on your machine. We take its SHA-256 digest, 32 bytes that identify the file uniquely while keeping its contents private, and we timestamp that."
          }
        </P>
        <Figure caption="Your hash is aggregated with thousands of others into a single transaction on the blockchain. The cost of that one transaction is shared across everyone in the batch, which is why anchoring stays free.">
          <AnchorFlow />
        </Figure>
        <P>
          {
            "A single transaction on the blockchain is a scarce, and normally costly, thing. OpenTimestamps solves that with aggregation. Four independent public calendar servers collect hashes from everyone using the network, combine thousands of them into one tree, and commit only that tree's root to a single transaction. Your hash rides along inside the batch. Because the cost of that transaction is shared across everyone in it, anchoring on Let's Seal is free, and it stays free however much you seal."
          }
        </P>

        <H2>Confirmation comes from the blockchain itself</H2>
        <P>
          {
            "A calendar hands back a receipt straight away, but that receipt marks acceptance alone, with a place in a block still to come. We keep those two states apart. A fresh anchor is marked "
          }
          <B>pending</B>
          {". It becomes "}
          <B>confirmed</B>
          {" only once the blockchain attestation actually exists."}
        </P>
        <P>
          {
            "For confirmation, we go to the blockchain itself rather than the calendar's word. The proof is verified either through a full node, or by cross-checking the attested block against several independent block explorers that have to agree. Confirmation usually lands within a few hours, once the batching transaction is mined. Only then do we record the block height."
          }
        </P>

        <H2>What you can check yourself</H2>
        <P>
          {
            "The proof travels with the file as a small .ots sidecar. Anyone can verify it with the standard OpenTimestamps client and a view of the blockchain:"
          }
        </P>
        <div className="mt-4">
          <CodeBlock>ots verify sealed.pdf.ots</CodeBlock>
        </div>
        <P>
          {
            "Everything the check needs is public: the standard client and the blockchain. If we vanished tomorrow, every anchor we ever made would still verify. That is the test we hold every part of the system to."
          }
        </P>
        <P>
          {
            "Inside that sidecar is a path. It records the steps that take your file's hash, fold it together with the other hashes in its batch, and arrive at the exact value committed by one transaction on the blockchain, along with the block that transaction landed in. The verifier replays those steps and checks the result against the public chain. Every link in the middle is arithmetic you can redo yourself, and it either lands on a real block or it falls short."
          }
        </P>
        <P>
          {
            "We anchor one more thing: the root of our transparency log. Committing the log's root to the blockchain pins the entire history of everything we have ever sealed to the same public clock. That is the subject of a companion post."
          }
        </P>

        <H2>Why we chose Bitcoin</H2>
        <P>
          {
            "The obvious alternative is a traditional timestamping authority, the RFC 3161 kind. That hands you a single trusted party whose signature, and whose clock, you simply have to believe, exactly what we designed the system to move past. A private or permissioned chain is the same problem wearing different clothes: someone still decides."
          }
        </P>
        <P>
          {
            "Sealed PDFs carry an RFC 3161 timestamp too, and it is worth being exact about the job it does. It is the form PDF readers already understand, so it lifts the signature to PAdES B-T and appears in the validation panel of software that has never heard of us. It is a convenience, and it is optional: when the timestamping authority is unreachable at the moment of sealing, the document is sealed without one and the signature is unaffected. The proof of when rests on the anchor, which still stands in ten years whether or not any authority remains reachable, solvent, or willing."
          }
        </P>
        <P>
          {
            "The blockchain's cost and energy use are real, and worth naming plainly. Our own contribution to them is close to zero: the network mines its blocks regardless, the aggregation transaction happens regardless, and what we add is a single hash inside a batch of thousands. For that, we get a clock that stays beyond the reach of any government, company, or future version of us."
          }
        </P>
        <P>
          {
            "Proof of when should stand independent of the party who benefits from it. Borrowing the blockchain's clock is how we put it there."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
