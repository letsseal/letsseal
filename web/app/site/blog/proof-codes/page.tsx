import { CodeBlock } from "../../_components/ui";
import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("proof-codes")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function TwoTracks() {
  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-center">
        <div className="text-[12.5px] font-semibold text-stone-900">Your sealed file</div>
      </div>

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="flex-1 rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
            Track 1
          </div>
          <div className="mt-1.5 text-[14px] font-semibold text-stone-900">
            SHA-256 (cryptographic identity)
          </div>
          <div className="mt-2 break-all font-mono text-[11px] leading-snug text-stone-500">
            9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
          </div>
        </div>

        <div className="flex items-center justify-center" aria-hidden>
          <div className="rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-center text-[10.5px] font-semibold text-stone-400">
            no derivation
            <br className="hidden sm:block" /> between them
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
            Track 2
          </div>
          <div className="mt-1.5 text-[14px] font-semibold text-stone-900">
            Random 20-char code (friendly handle + capability)
          </div>
          <div className="mt-2 font-mono text-[13px] font-semibold text-blue-600">
            5X9H-KWF3-JTBC-55CS-6Q6X
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <span className="font-mono text-[12.5px] text-stone-700">letsseal.org/v/5X9H-KWF3-JTBC-55CS-6Q6X</span>
        <span className="text-[11px] font-semibold text-stone-400" aria-hidden>
          302 redirect &rarr;
        </span>
        <span className="font-mono text-[12.5px] text-stone-700">/d/9f86d081...0a08</span>
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
          "Every seal gets a short code you can read over the phone or type off a printed stamp, something like 5X9H-KWF3-JTBC-55CS-6Q6X. The interesting part is where it comes from. It is minted from randomness, with no link to the file, and that single decision buys two properties at once."
        }
      />

      <Prose>
        <H2>A file already has an identity</H2>
        <P>
          {
            "Every sealed file already has a perfect name: its SHA-256 digest, 64 hexadecimal characters that identify it uniquely and change completely if a single byte moves. That is the cryptographic identity we anchor and sign. The trouble is that it overwhelms any human who tries to read it aloud, type it off a stamp, or remember it. A hash is a superb key and a terrible handle."
          }
        </P>
        <P>
          {"So each seal also gets a short code, shown at "}
          <B>letsseal.org/v/&lt;code&gt;</B>
          {
            ". It is twenty characters, printed as a typable line under the stamp and encoded into the QR beside it. The question that shapes the whole design is a simple one: where should those twenty characters come from?"
          }
        </P>

        <Stats
          items={[
            { k: "1.3 x 10^30", l: "distinct codes (32 to the 20th)" },
            { k: "20", l: "Crockford base32 characters" },
            { k: "random", l: "the code is minted from randomness, independent of the file" },
          ]}
        />

        <H2>Why the code is minted from randomness</H2>
        <P>
          {
            "The tempting answer is to compute the code from the file, take some of the hash and shorten it. It would be neat, and it would be a mistake. A code derived from the document is a function of the document, which means it quietly carries information about it. Anyone who sees the code, on a stamp, in an email, over someone's shoulder, would be holding a fragment of the file's fingerprint. Two files that happened to share a prefix would announce that fact through their codes. We wanted the friendly handle to keep the private thing behind it private."
          }
        </P>
        <P>
          {"So the code is "}
          <B>random</B>
          {
            ". It is generated from cryptographically secure random bytes, independent of the file and its hash. As independent random data, it stays silent about the document's contents, size, and digest. We assign the name ourselves."
          }
        </P>

        <Figure caption="One file, two identifiers on separate tracks. The SHA-256 is the cryptographic identity we sign and anchor. The 20-character code is a random handle assigned to it, independent of it. Resolving the code just forwards to the canonical proof page.">
          <TwoTracks />
        </Figure>

        <H2>Twenty characters, and the alphabet behind them</H2>
        <P>
          {"The code is written in "}
          <B>Crockford base32</B>
          {
            ", the alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ. That is thirty-two symbols, and it deliberately omits I, L, O and U. Dropping I, L and O removes the characters people confuse with 1 and 0 when reading a code off paper, and dropping U makes it far less likely that a random string spells an accidental word. The result is twenty characters that survive being read aloud, faxed, photographed and retyped."
          }
        </P>
        <P>
          {
            "Twenty symbols from a thirty-two character alphabet gives 32 to the power 20, which is roughly 1.3 x 10^30 distinct codes. That size earns its keep. Even at internet scale, imagine 700 million users each holding many seals, the space stays almost entirely empty. The live codes are a vanishingly thin scattering across an enormous field. To keep that field uniform we sample random bytes and mask each down to the alphabet cleanly, because thirty-two divides evenly into the byte range, so every symbol is equally likely to appear. Every position in the code is a fair, independent draw."
          }
        </P>

        <H2>Sparse enough to be a key</H2>
        <P>
          {
            "That emptiness is the second property, and it comes for free once the code is random. When live codes are a needle-thin fraction of the space, guessing one that resolves is infeasible, and working backwards from a file to its code is equally hopeless, because the two are independent. A derived code would have handed an attacker a shortcut; a random one across a space this large leaves only brute force, which the size defeats."
          }
        </P>
        <P>
          {"So knowing a code is itself evidence. It means you were "}
          <B>given</B>
          {
            " it, by someone holding the seal. The handle doubles as an unguessable capability token: possession of the code is possession of a link to the proof. A friendly name and an access key, from the same twenty characters, at no extra cost."
          }
        </P>
        <P>
          {
            "For that to hold, uniqueness has to be guaranteed. It is: at mint time a database check confirms the fresh code is available, and only then is it kept. Collisions are astronomically unlikely given the size of the space, and the check settles the matter for certain regardless."
          }
        </P>

        <H2>Reading, folding and resolving</H2>
        <P>
          {"Stored, a code is exactly twenty uppercase characters in a single unbroken run. Shown, it is grouped for the eye as "}
          <B>XXXX-XXXX-XXXX-XXXX-XXXX</B>
          {
            ". On the way back in, we are forgiving about how a human types it. Input is uppercased, spaces and dashes are stripped, and the classic look-alikes are folded home: I and L become 1, O becomes 0, U becomes V. Whatever remains must be exactly twenty valid characters to reach the database."
          }
        </P>
        <P>
          {"A resolved code is a redirect. Visiting "}
          <B>/v/&lt;code&gt;</B>
          {
            " canonicalises the input, looks it up (sealed documents and standalone anchors share one namespace), and forwards to the canonical proof page at /d/<sha256>:"
          }
        </P>
        <div className="mt-4">
          <CodeBlock>letsseal.org/v/5X9H-KWF3-JTBC-55CS-6Q6X</CodeBlock>
        </div>
        <P>
          {
            "One more detail protects the capability property. Because a code doubles as an access key, we have to stop a scraper sweeping the space for live ones. So the resolver is rate limited per client address, at roughly sixty lookups a minute. Cross that line and the response is a 404, where most services would return a 429. A blocked probe looks exactly like a genuine miss, so a scraper stays in the dark about whether the code it tried exists."
          }
        </P>
        <P>
          {
            "There is a quiet consequence of all this in the order things happen. The code is minted before the file is sealed, before the sealed file's hash even exists. That works precisely because the code is independent of the hash. Once minted, it is baked into the QR and printed on the stamp, ready to carry a proof that it predates."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
