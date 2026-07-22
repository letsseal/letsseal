import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("blue-not-green")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function MarkContrast() {
  const cols = [
    {
      accent: "text-stone-500",
      dot: "bg-stone-300",
      t: "Green tick (Adobe AATL)",
      rows: [
        "A paid, members-only trust list vouches for you.",
        "Shows up only inside Adobe Reader.",
        "Speaks to list membership alone.",
      ],
    },
    {
      accent: "text-blue-600",
      dot: "bg-blue-600",
      t: "Blue mark (Let's Seal)",
      rows: [
        "A published root you pin by fingerprint vouches.",
        "A live verdict backs it up, for anyone, anywhere.",
        "The same X.509 and SHA-256 signatures underneath.",
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      {cols.map((col) => (
        <div
          key={col.t}
          className="flex-1 rounded-xl border border-stone-200 bg-stone-50 p-5"
        >
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} aria-hidden />
            <span className={`text-[14px] font-semibold ${col.accent}`}>{col.t}</span>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {col.rows.map((row) => (
              <li key={row} className="text-[13px] leading-snug text-stone-600">
                {row}
              </li>
            ))}
          </ul>
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
          "People sometimes ask why our verified mark is blue when the tick they know best, the one in Adobe Reader, is green. The short answer is that the green tick belongs to a paid membership list, and even if we bought in, it would claim something we deliberately leave to others."
        }
      />

      <Prose>
        <H2>What the green tick actually means</H2>
        <Stats
          items={[
            { k: "#2563eb", l: "Trust Blue, the one badge colour" },
            { k: "self-anchored", l: "trust rests on a root you pin yourself" },
            { k: "integrity + time", l: "exactly what the mark claims" },
          ]}
        />
        <P>
          {
            "The green check in Adobe Reader is a statement about membership. Adobe runs a programme called the "
          }
          <B>Adobe Approved Trust List</B>
          {
            ", or AATL: a paid, members-only trust list. When a PDF's signing certificate chains up to a root on that list, Adobe Reader draws the tick green. For certificates outside it, the same reader stays guarded, however sound the signature is."
          }
        </P>
        <P>
          {
            "So the colour tells you one specific thing: this certificate belongs to an organisation that paid to join a private list Adobe curates. That is a reasonable thing for a reader to surface, though it is easy to misread. A green tick feels like the software has inspected the signature and pronounced it good. What it has really done is check a chain of certificates against a roster, and the roster is the paid part."
          }
        </P>

        <H2>The cryptography is the same either way</H2>
        <P>
          {
            "This is the part worth sitting with. A seal is an X.509 certificate and a SHA-256 signature over the file, and that maths carries its own strength. A trust-list fee sits entirely apart from it: the signature matches the bytes or it fails, and the answer stays the same whoever has paid."
          }
        </P>
        <P>
          {"The only thing a paid AATL certificate buys is "}
          <B>presentation</B>
          {
            ": Adobe Reader shows a green tick automatically, for people verifying outside your own platform. That is convenience, and honesty means naming it as convenience. The same signed PDF, verified with an open tool that inspects the maths directly, gives you exactly the same assurance about the bytes. The one gap is the friendly green tick in a particular reader, and that gap is a marketing arrangement."
          }
        </P>
        <Figure caption="Two marks, two very different things being vouched for. The green tick leans on a list you pay to join and appears in one reader. The blue mark leans on a root anyone can pin and a verdict anyone can open, and it works everywhere.">
          <MarkContrast />
        </Figure>

        <H2>Why our root stands on its own</H2>
        <P>
          {
            "The Let's Seal root lives outside every operating system, Adobe, and mail-client trust store, by design. We want you to reach the truth about a file directly: trust is pinned to the published root, so you check a fingerprint you can see, rather than inheriting a verdict some vendor decided on your behalf."
          }
        </P>
        <P>
          {
            "Paying to sit on a private list is, to us, a tollbooth. It moves the question from can I check this myself to did the right company pay the right fee. We would rather answer the first, and answer it for free, than buy a place behind the second. A fingerprint has a plain virtue: it is the same for everyone, free to check, and open to you whoever you are. You compare what you were told against what you can compute, and the two either match or they diverge."
          }
        </P>
        <P>
          {
            "That choice has a direct consequence for the colour. A green tick would require us to pay into AATL, and even then it would falsely imply Adobe and operating-system level trust, exactly the relationship we chose to forgo. Claiming a bond we deliberately declined would be dishonest, so the mark is blue: Trust Blue, #2563eb, and only that."
          }
        </P>

        <H2>What Adobe's tick buys</H2>
        <P>
          {
            "Being honest about all this means naming what we lose. If your recipient opens a Let's Seal PDF in Adobe Reader expecting the familiar green tick, the tick stays away, because our root sits outside the list that turns it green. That is a real cost, and we would rather state it plainly than pretend it away."
          }
        </P>
        <P>
          {
            "What we get in return is trust that comes free of any gatekeeper, and a judgement about which seals look legitimate that belongs to everyone equally rather than to one vendor behind a paywall. We think that trade is the right way round. A verdict you can reach for yourself, for free, is worth more than a colour a company grants once you have paid to be on its roster."
          }
        </P>

        <H2>What blue is allowed to claim</H2>
        <P>
          {"Blue makes exactly two claims. It says a file is "}
          <B>sealed and unaltered</B>
          {", and it says the seal was "}
          <B>issued by a named party</B>
          {
            ". Both are things you can confirm for yourself. The badge should always open a live verdict, at /d/ followed by the file's hash, so every claim arrives with a check attached."
          }
        </P>
        <P>
          {
            "A seal proves integrity and time: these exact bytes existed, unchanged, at a knowable moment. Identity and notarisation are separate questions, handled elsewhere."
          }
        </P>

        <H2>The badge is a door, the check is the proof</H2>
        <P>
          {
            "It helps to think of the blue mark as a front door. Its job is to invite a check. It says, in effect, there is something here you can verify, and here is where to look. Click it and you land on the live verdict, where the weight actually sits."
          }
        </P>
        <P>
          {
            "This is why the colour matters less than what stands behind it, though it still has to be honest. Green would borrow authority that sits with Adobe and the OS vendors. Blue stands on its own: it points at a root you can pin and a verdict you can open, and leaves the proving to you. Any colour is only a signpost, and we wanted ours honest about that. That is the whole arrangement: the badge opens the door, and the check carries the weight."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
