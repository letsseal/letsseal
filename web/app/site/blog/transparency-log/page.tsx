import { CodeBlock } from "../../_components/ui";
import { PostHead, Prose, P, H2, B, Figure, Stats, PostFooter } from "../_components";
import { bySlug } from "../_posts";

const post = bySlug("transparency-log")!;

export const metadata = {
  title: `${post.title} · Let's Seal`,
  description: post.blurb,
};

function MerkleTree() {
  const BLUE = "#2563eb";
  const STONE_EDGE = "#d6d3d1";
  const STONE_FILL = "#f5f5f4";
  const STONE_STROKE = "#d6d3d1";
  const LABEL = "#78716c";
  return (
    <svg viewBox="0 0 600 300" className="w-full" role="img" aria-label="A Merkle tree with four leaves. One leaf and its path to the signed root are highlighted, and the two sibling hashes that make up the inclusion proof are outlined.">
      <g stroke={STONE_EDGE} strokeWidth="2" fill="none">
        <line x1="300" y1="44" x2="440" y2="126" />
        <line x1="160" y1="126" x2="230" y2="206" />
        <line x1="440" y1="126" x2="370" y2="206" />
        <line x1="440" y1="126" x2="510" y2="206" />
      </g>
      <g stroke={BLUE} strokeWidth="3" fill="none">
        <line x1="300" y1="44" x2="160" y2="126" />
        <line x1="160" y1="126" x2="90" y2="206" />
      </g>

      <text x="300" y="16" textAnchor="middle" fontSize="12" fontWeight="600" fill="#57534e">signed root</text>
      <circle cx="300" cy="44" r="20" fill={BLUE} />

      <circle cx="160" cy="126" r="17" fill={BLUE} />
      <text x="440" y="99" textAnchor="middle" fontSize="11" fontWeight="600" fill={BLUE}>given</text>
      <circle cx="440" cy="126" r="17" fill="#ffffff" stroke={BLUE} strokeWidth="2.5" />

      <rect x="50" y="206" width="80" height="44" rx="10" fill={BLUE} />
      <text x="90" y="232" textAnchor="middle" fontSize="12" fontWeight="600" fill="#ffffff">seal</text>
      <text x="90" y="270" textAnchor="middle" fontSize="12" fontWeight="600" fill={BLUE}>your seal</text>
      <rect x="190" y="206" width="80" height="44" rx="10" fill="#ffffff" stroke={BLUE} strokeWidth="2.5" />
      <text x="230" y="270" textAnchor="middle" fontSize="11" fontWeight="600" fill={BLUE}>given</text>
      <rect x="330" y="206" width="80" height="44" rx="10" fill={STONE_FILL} stroke={STONE_STROKE} strokeWidth="1.5" />
      <rect x="470" y="206" width="80" height="44" rx="10" fill={STONE_FILL} stroke={STONE_STROKE} strokeWidth="1.5" />
      <text x="440" y="270" textAnchor="middle" fontSize="11" fill={LABEL}>other seals</text>
    </svg>
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
          "A seal proves a file is authentic. An anchor on the blockchain proves when it existed. A third question remains: how do you know we keep the record honestly, adding each entry once and holding the order fixed behind the scenes?"
        }
      />

      <Prose>
        <H2>The operator problem</H2>
        <P>
          {
            "A log is easy to keep honest if you trust whoever keeps it. We build ours to earn that trust the hard way. A dishonest or compromised operator could insert a backdated entry, drop an inconvenient one, or show a different history to different people. Asking you to take our word that we would refrain is exactly the kind of trust we are trying to design out."
          }
        </P>
        <P>
          {
            "So the log is built so that any such attempt fails in public, and anyone watching can catch it."
          }
        </P>

        <H2>Every seal is a leaf</H2>
        <Stats
          items={[
            { k: "RFC 6962", l: "the same standard as Certificate Transparency and sigstore Rekor" },
            { k: "~20 hashes", l: "prove one seal is in a log of a million" },
            { k: "append-only", l: "consistency proofs let anyone confirm the log only grew" },
          ]}
        />
        <P>
          {
            "Each seal we issue is appended as one leaf in a Merkle tree, the same append-only structure Certificate Transparency has used since 2013 and sigstore's Rekor uses today. It is defined by an open standard, RFC 6962."
          }
        </P>
        <P>
          {
            "A Merkle tree hashes in pairs. Each leaf is the hash of one entry. Each parent is the hash of its two children. Keep hashing upwards and you reach a single value at the top, the root, that commits to every leaf beneath it. Change any leaf, anywhere, and the root changes. We use SHA-256, with a one-byte prefix that separates leaves from interior nodes, exactly as the standard prescribes."
          }
        </P>
        <Figure caption="To prove your seal (blue) is in the tree, we hand you only the hashes outlined in blue: your leaf's sibling, and the node on the far side. You recompute the root and check it against the root we publish. For a tree of a million seals, that path is about twenty hashes.">
          <MerkleTree />
        </Figure>

        <H2>Proving your seal is in the tree</H2>
        <P>
          {
            "The useful property is that a handful of hashes proves a single leaf belongs to the tree. To show your seal is included, we hand you a short list: the siblings along the path from your leaf up to the root. That is an "
          }
          <B>inclusion proof</B>
          {"."}
        </P>
        <P>
          {
            "Concretely: you hash your own entry to get your leaf, combine it with the one sibling hash we hand you to get their shared parent, combine that with the next hash up, and continue to the top. A handful of SHA-256 operations later you have a root. If it equals the root we signed and anchored, your seal is in the tree, and that root could have come from only one set of entries."
          }
        </P>
        <P>
          {
            "The list is short because the tree is shallow. For a log of a million seals, an inclusion proof is roughly twenty hashes, a few hundred bytes, however large the log grows."
          }
        </P>

        <H2>Proving the log only ever grows</H2>
        <P>
          {
            "Inclusion proofs show your entry is there now. A second kind of proof, a "
          }
          <B>consistency proof</B>
          {
            ", shows something stronger: that an older version of the tree is a prefix of the newer one. In plain terms, that we only ever appended, leaving everything already in the tree exactly as it was."
          }
        </P>
        <P>
          {
            "Anyone monitoring the log can ask for a consistency proof between any two points in time and confirm, mathematically, that everything behind them stands exactly as it did. Any rewrite of the append-only Merkle tree makes every watcher's consistency check fail. That is what makes the honesty something anyone can verify."
          }
        </P>

        <H2>The signed tree head, anchored to the blockchain</H2>
        <P>
          {
            "We publish the current root as a signed tree head: the tree size, the root hash, a timestamp, and a signature from a dedicated log key whose certificate chains to the Let's Seal root. And, as covered in the companion post, we anchor that root hash to the blockchain with OpenTimestamps. So the log's whole history is pinned to a public clock everyone shares. The tree is append-only by construction, and the sequence of its roots is timestamped in a ledger beyond our reach."
          }
        </P>
        <P>
          {
            "Both halves are deliberately boring and reproducible. Each leaf commits to a small canonical record: a version tag, the file's SHA-256, the seal type, the issuing certificate's name, and the time. The signed tree head is a short signed line: the version, the tree size, the root hash, and a timestamp. An independent monitor can recompute either from scratch and check our signature over it."
          }
        </P>

        <H2>Check it yourself</H2>
        <P>{"All three are public endpoints, open to anyone:"}</P>
        <div className="mt-4">
          <CodeBlock>
            {`GET /api/log/sth                         the current signed tree head
GET /api/log/proof?sha256=<hash>         an inclusion proof for one seal
GET /api/log/consistency?first=&second=  proof the log only appended`}
          </CodeBlock>
        </div>
        <P>
          {
            "The honesty is yours to check. The tree, the proofs, and the blockchain anchor let you, or anyone watching, prove it."
          }
        </P>

        <PostFooter />
      </Prose>
    </>
  );
}
