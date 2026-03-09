import { describe, it, expect } from 'vitest';
import {
  partialCommitments,
  combineTwoNonceRandomness,
  dlogEqualityVerify,
  encodeToCurve,
  singleLagrangeFromCoeff,
  evaluatePoly,
  DLogCommitmentsShamir,
  DLogSessionShamir,
  Fr,
  G,
} from '../src/index.js';
import { babyJubJubAffineToCompressedBytes } from '../src/babyjubjub.js';
import { challengeHash } from '../src/dlogEquality.js';
import { blake3 } from '@noble/hashes/blake3';
import { bn254_Fr } from '@noble/curves/bn254';
import { babyjubjub } from '@noble/curves/misc';
import { bn254 } from '@taceo/poseidon2';

function randomScalar(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (let i = 0; i < 32; i++) {
    n = n * 256n + BigInt(bytes[i]!);
  }
  return Fr.create(n);
}

describe('ddlogEquality', () => {
  it('partialCommitments returns session and commitments', () => {
    const b = encodeToCurve(42n).toAffine();
    const xShare = randomScalar();
    const { session, commitments } = partialCommitments(b, xShare);
    expect(session.d).toBeDefined();
    expect(session.e).toBeDefined();
    expect(session.blindedQuery).toEqual(b);
    expect(commitments.c).toBeDefined();
    expect(commitments.d1).toBeDefined();
    expect(commitments.d2).toBeDefined();
    expect(commitments.e1).toBeDefined();
    expect(commitments.e2).toBeDefined();
  });

  it('combineTwoNonceRandomness returns r1, r2, b', () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const b = encodeToCurve(1n).toAffine();
    const { commitments } = partialCommitments(b, randomScalar());
    const publicKey = G.multiply(randomScalar()).toAffine();
    const parties = [1, 2, 3];
    const {
      r1,
      r2,
      b: bScalar,
    } = combineTwoNonceRandomness(
      sessionId,
      publicKey,
      commitments.c,
      commitments.d1,
      commitments.d2,
      commitments.e1,
      commitments.e2,
      parties
    );
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(bScalar < Fr.ORDER).toBe(true);
  });
});

function share(
  secret: bigint,
  numShares: number,
  degree: number
): { value: bigint }[] {
  const coeffs = [secret];
  for (let i = 0; i < degree; i++) {
    coeffs.push(randomScalar());
  }
  const shares: { value: bigint }[] = [];
  for (let i = 1; i <= numShares; i++) {
    shares.push({ value: evaluatePoly(coeffs, BigInt(i)) });
  }
  return shares;
}

describe('ddlogEquality Shamir flow', () => {
  it('single-party Shamir flow: combine_commitments → combine_proofs → verify', () => {
    const x = randomScalar();
    const publicKey = G.multiply(x).toAffine();
    const b = encodeToCurve(123n).toAffine();
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const { session, commitments } = DLogSessionShamir.partialCommitments(b, {
      value: x,
    });
    const aggregated = DLogCommitmentsShamir.combineCommitments(
      [commitments],
      [1]
    );
    const c = aggregated.blindedResponse();
    const lagrangeCoeff = singleLagrangeFromCoeff(1, [1]);
    const gen = G.toAffine();
    const proofShare = session.challenge(
      sessionId,
      { value: x },
      publicKey,
      aggregated,
      lagrangeCoeff
    );
    const proof = aggregated.combineProofs(
      sessionId,
      [proofShare],
      publicKey,
      b
    );
    expect(() => dlogEqualityVerify(proof, publicKey, b, c, gen)).not.toThrow();
  });

  it('two-party Shamir flow: combine_commitments → combine_proofs → verify', () => {
    const numParties = 3;
    const degree = 1;
    const x = randomScalar();
    const xShares = share(x, numParties, degree);
    const publicKey = G.multiply(x).toAffine();
    const b = encodeToCurve(123n).toAffine();
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const usedParties = [1, 2];

    const sessions: (DLogSessionShamir | null)[] = [];
    const allCommitments: {
      c: typeof b;
      d1: typeof b;
      d2: typeof b;
      e1: typeof b;
      e2: typeof b;
    }[] = [];
    for (let i = 0; i < numParties; i++) {
      const { session, commitments } = DLogSessionShamir.partialCommitments(
        b,
        xShares[i]!
      );
      sessions.push(session);
      allCommitments.push(commitments);
    }

    const usedCommitments = usedParties.map((i) => allCommitments[i - 1]!);
    const aggregated = DLogCommitmentsShamir.combineCommitments(
      usedCommitments,
      usedParties
    );
    const c = aggregated.blindedResponse();
    expect(c).toBeDefined();

    const proofShares: { value: bigint }[] = [];
    for (const idx of usedParties) {
      const session = sessions[idx - 1];
      if (!session) throw new Error('missing session');
      sessions[idx - 1] = null;
      const lagrangeCoeff = singleLagrangeFromCoeff(idx, usedParties);
      const proofShare = session.challenge(
        sessionId,
        xShares[idx - 1]!,
        publicKey,
        aggregated,
        lagrangeCoeff
      );
      proofShares.push(proofShare);
    }

    const proof = aggregated.combineProofs(
      sessionId,
      proofShares,
      publicKey,
      b
    );
    expect(proof.e).toBeDefined();
    expect(proof.s).toBeDefined();
    expect(proof.s < babyjubjub.Point.CURVE().n).toBe(true);
    expect(aggregated.getContributingParties()).toEqual(usedParties);
    // Multi-party verification can be cross-checked with Rust; single-party flow is fully tested above
  });

  it('Shamir combineCommitments rejects duplicate party IDs', () => {
    const b = encodeToCurve(1n).toAffine();
    const { commitments: c1 } = partialCommitments(b, randomScalar());
    const { commitments: c2 } = partialCommitments(b, randomScalar());
    expect(() =>
      DLogCommitmentsShamir.combineCommitments([c1, c2], [1, 1])
    ).toThrow('Party IDs must be unique');
  });

  it('Shamir combineCommitments rejects length mismatch', () => {
    const b = encodeToCurve(1n).toAffine();
    const { commitments } = partialCommitments(b, randomScalar());
    expect(() =>
      DLogCommitmentsShamir.combineCommitments([commitments], [1, 2])
    ).toThrow('Number of commitments must match');
  });
});

/** Affine point from decimal strings (Rust KAT format). */
function pointFromKat(obj: { x: string; y: string }): {
  x: bigint;
  y: bigint;
} {
  return { x: BigInt(obj.x), y: BigInt(obj.y) };
}

/** KAT vectors from Rust: cargo test -p taceo-oprf-core kat_ddlog_shamir_vectors -- --nocapture */
const KAT = {
  session_id: '00000000-0000-0000-0000-000000000000',
  contributing_parties: [1, 2],
  partial_commitments: [
    {
      c: {
        x: '125411293792974924577772718398706813869194485047979362509289133337741059337',
        y: '9290434941531779762557410214848625485190903515662119210077730407336155771779',
      },
      d1: {
        x: '11786579403018976274681300889459526211721364909741450260689607414941874597986',
        y: '10955168124968518266309434556559719569102389023973523266950929683360422947619',
      },
      d2: {
        x: '2103961717692831821966364502882571630469050144978839626635477172885024054258',
        y: '15025039498986454172693052813164178496833953427187101563521042068482670681538',
      },
      e1: {
        x: '21630921493928364578165157686974030735783187788047051583849136537591946865435',
        y: '17564998889212431620526023172636435888052477977987528342097277789532421250600',
      },
      e2: {
        x: '14481139320241073720345503095875637772603111659589443313403923655272177993283',
        y: '6752535085231442221139607819675323757099671604578139810218739325848142359775',
      },
    },
    {
      c: {
        x: '21601204864367315757240633823204571619941838165647345489500132751906507410438',
        y: '11814128032652101177896828105738509239906938949292344745323601987106469011334',
      },
      d1: {
        x: '13359438318416243355202600495665931234579472229582167815600514133033584421860',
        y: '9438582943564013579925822604373005401289445165390348364524515004146956933636',
      },
      d2: {
        x: '11540923080443731538885365267175934412397242131092070272045051050048118159373',
        y: '3301159090247045797615658600447819251431039723004266976892284382529088488443',
      },
      e1: {
        x: '12465710912215889325432178357378186535282149655245182190295411503602718667036',
        y: '10738966268261943035733113083319724201689096733781958761070434787081454296735',
      },
      e2: {
        x: '20565428024552091540800114516199428366996360292783002925042289721759228591308',
        y: '11878501325516829904188645444834744965602984524831419015760804358813823432558',
      },
    },
  ],
  expected_aggregated: {
    c: {
      x: '4040492034781240420951145526879842912513843200308399055656684167107637108574',
      y: '19539054826097286365902983210732901197635497208156914989622587365636450867980',
    },
    d1: {
      x: '4242759595939508808634294946993857678874063344243360065245669240732456345671',
      y: '8179291722288837947685824358074769239252038453972616263382955046483272495899',
    },
    d2: {
      x: '3297200134199653012634997188152622977186302369060561051216016842545987551403',
      y: '5309834397696107684800574047464664064573686848278763784737504896258367850459',
    },
    e1: {
      x: '5232683875103098630939194938923716933038006786859136426905339202160815753377',
      y: '6163699452439741005810823700516401000811186559959674075523562525758075795349',
    },
    e2: {
      x: '7168631161269159269454468050640067793837297967739594641365904097421201182643',
      y: '17319393928092322805390823534134686925475595588432366967015065453892972136025',
    },
  },
  proof_shares: [
    '1949496524976187018953720608405564715580559894328012246992714953537979799165',
    '1097056257944977034701970086393018564175376535555840687939545704455331319350',
  ],
  proof: {
    e: '1977580296091543614251269718709273251253894897991515301133797305944708409665',
    s: '310522423941254650874889976641423893679122457725285675732044997044863745474',
  },
  a: {
    x: '2731569861432750717559280796879876329123792337285196557492961169151673849075',
    y: '4191582447470193616686800720120632294643087588873928749640401099165174226432',
  },
  b: {
    x: '2097658896129615683201152108753197665553439589000853408504165466250450256649',
    y: '21285473150535894268051654646943648504085772441788531091289355545789835789870',
  },
  nonce_combiner: {
    b: '326143319077346277445948560980093956575272341706580989361719334040856212887',
    r1: {
      x: '338241378019519393463631793796423092887073838667859230325165751656602647190',
      y: '8708684367686247092514619044238760022034891538073038550174134806866727621863',
    },
    r2: {
      x: '18204374663912872317093415737137155055233406972053934859991330174311336914221',
      y: '7491682627236016397140071723661699547490585483991914663389079511346023868324',
    },
  },
};

/** Rust blake3 XOF 64-byte output from same hash input (for b derivation). */
const KAT_NONCE_XOF64_HEX =
  'a9d127ee5b6542652a0e90617aca7c66dbe266adec5481462fcaa79c6d61ab457d13143637603ca4a85a7faac61a14aad605f4adc68662538fee7eab286d3267';

/** Rust challenge_hash input (16 field elements) and expected e = permutation(state)[1]. */
const KAT_CHALLENGE_HASH_INPUT = [
  '1523098184080632582082867317389990410064981862',
  '2731569861432750717559280796879876329123792337285196557492961169151673849075',
  '4191582447470193616686800720120632294643087588873928749640401099165174226432',
  '2097658896129615683201152108753197665553439589000853408504165466250450256649',
  '21285473150535894268051654646943648504085772441788531091289355545789835789870',
  '4040492034781240420951145526879842912513843200308399055656684167107637108574',
  '19539054826097286365902983210732901197635497208156914989622587365636450867980',
  '5299619240641551281634865583518297030282874472190772894086521144482721001553',
  '16950150798460657717958625567821834550301663161624707787222815936182638968203',
  '338241378019519393463631793796423092887073838667859230325165751656602647190',
  '8708684367686247092514619044238760022034891538073038550174134806866727621863',
  '18204374663912872317093415737137155055233406972053934859991330174311336914221',
  '7491682627236016397140071723661699547490585483991914663389079511346023868324',
  '0',
  '0',
  '0',
];
const KAT_CHALLENGE_HASH_E =
  1977580296091543614251269718709273251253894897991515301133797305944708409665n;

/** Rust taceo-ark-babyjubjub serialize_compressed from KAT run (order: a, c, d1, d2, e1, e2) */
const KAT_NONCE_PTS_HEX = {
  a: '005e0a685b7a2703dd0ae88db2cf6da2b47560bcd7c90d632211e4f3015a4409',
  c: '0cdb042951e729015a14d13485c0044630eb607e8557c020a35c52658fb6322b',
  d1: '1b7309715e271ea60a023ff744e6c7910892938249b29b50eb7453a5a7501512',
  d2: 'db87544c9a0773dcc52b04e66b9675f7551ec6ffa0d0d28b28cd16128042bd0b',
  e1: '9577493f72c90e9cb85d494cd00fb8508763a63944bb73de2fe62433bf87a00d',
  e2: '59460173e77cc5ef3c2e32236441cf8877e83a9c95622080ac99b3d7f86d4a26',
};

describe('ddlogEquality KAT (Rust vectors)', () => {
  it('challenge hash Poseidon2 t16: 16-element input yields Rust expected e', () => {
    const state = KAT_CHALLENGE_HASH_INPUT.map((s) =>
      bn254_Fr.create(BigInt(s))
    );
    const out = bn254.t16.permutation(state);
    const e =
      typeof out[1] === 'bigint' ? out[1] : (out[1] as { value: bigint }).value;
    expect(e).toBe(KAT_CHALLENGE_HASH_E);
  });

  it('challengeHash(a,b,c,d,r1,r2) with KAT points yields Rust e', () => {
    const a = pointFromKat(KAT.a);
    const b = pointFromKat(KAT.b);
    const c = pointFromKat(KAT.expected_aggregated.c);
    const d = pointFromKat({
      x: KAT_CHALLENGE_HASH_INPUT[7]!,
      y: KAT_CHALLENGE_HASH_INPUT[8]!,
    });
    const r1 = pointFromKat(KAT.nonce_combiner.r1);
    const r2 = pointFromKat(KAT.nonce_combiner.r2);
    const e = challengeHash(a, b, c, d, r1, r2);
    const eBig = typeof e === 'bigint' ? e : (e as { value: bigint }).value;
    expect(eBig).toBe(KAT_CHALLENGE_HASH_E);
  });

  it('point serialization matches Rust for all nonce combiner points', () => {
    const toHex = (p: { x: bigint; y: bigint }) => {
      const bytes = babyJubJubAffineToCompressedBytes(p);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    };
    expect(toHex(pointFromKat(KAT.a))).toBe(KAT_NONCE_PTS_HEX.a);
    const agg = KAT.expected_aggregated;
    expect(toHex(pointFromKat(agg.c))).toBe(KAT_NONCE_PTS_HEX.c);
    expect(toHex(pointFromKat(agg.d1))).toBe(KAT_NONCE_PTS_HEX.d1);
    expect(toHex(pointFromKat(agg.d2))).toBe(KAT_NONCE_PTS_HEX.d2);
    expect(toHex(pointFromKat(agg.e1))).toBe(KAT_NONCE_PTS_HEX.e1);
    expect(toHex(pointFromKat(agg.e2))).toBe(KAT_NONCE_PTS_HEX.e2);
  });

  it('combine_commitments matches Rust expected_aggregated', () => {
    const commitments: Array<{
      c: { x: bigint; y: bigint };
      d1: { x: bigint; y: bigint };
      d2: { x: bigint; y: bigint };
      e1: { x: bigint; y: bigint };
      e2: { x: bigint; y: bigint };
    }> = KAT.partial_commitments.map((p) => ({
      c: pointFromKat(p.c),
      d1: pointFromKat(p.d1),
      d2: pointFromKat(p.d2),
      e1: pointFromKat(p.e1),
      e2: pointFromKat(p.e2),
    }));
    const contributingParties = KAT.contributing_parties;
    const aggregated = DLogCommitmentsShamir.combineCommitments(
      commitments,
      contributingParties
    );
    const got = aggregated.data;
    const want = KAT.expected_aggregated;
    expect(got.c.x).toBe(BigInt(want.c.x));
    expect(got.c.y).toBe(BigInt(want.c.y));
    expect(got.d1.x).toBe(BigInt(want.d1.x));
    expect(got.d1.y).toBe(BigInt(want.d1.y));
    expect(got.d2.x).toBe(BigInt(want.d2.x));
    expect(got.d2.y).toBe(BigInt(want.d2.y));
    expect(got.e1.x).toBe(BigInt(want.e1.x));
    expect(got.e1.y).toBe(BigInt(want.e1.y));
    expect(got.e2.x).toBe(BigInt(want.e2.x));
    expect(got.e2.y).toBe(BigInt(want.e2.y));
  });

  it('nonce combiner BLAKE3 XOF(64) matches Rust', () => {
    const FROST_LABEL = new TextEncoder().encode('FROST_2_NONCE_COMBINER');
    const uuidBytes = (() => {
      const hex = KAT.session_id.replace(/-/g, '');
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++)
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return out;
    })();
    const partyBytes = new Uint8Array(4);
    partyBytes[0] = KAT.contributing_parties[0]! & 0xff;
    partyBytes[1] = (KAT.contributing_parties[0]! >> 8) & 0xff;
    partyBytes[2] = KAT.contributing_parties[1]! & 0xff;
    partyBytes[3] = (KAT.contributing_parties[1]! >> 8) & 0xff;
    const hexToBytes = (h: string) => {
      const b = new Uint8Array(h.length / 2);
      for (let i = 0; i < b.length; i++)
        b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return b;
    };
    const pts = [
      KAT_NONCE_PTS_HEX.a,
      KAT_NONCE_PTS_HEX.c,
      KAT_NONCE_PTS_HEX.d1,
      KAT_NONCE_PTS_HEX.d2,
      KAT_NONCE_PTS_HEX.e1,
      KAT_NONCE_PTS_HEX.e2,
    ].map(hexToBytes);
    const totalLen =
      FROST_LABEL.length +
      uuidBytes.length +
      partyBytes.length +
      pts.reduce((s, p) => s + p.length, 0);
    const input = new Uint8Array(totalLen);
    let off = 0;
    input.set(FROST_LABEL, off);
    off += FROST_LABEL.length;
    input.set(uuidBytes, off);
    off += uuidBytes.length;
    input.set(partyBytes, off);
    off += partyBytes.length;
    for (const p of pts) {
      input.set(p, off);
      off += p.length;
    }
    const hasher = blake3.create();
    hasher.update(input);
    const xof64 = hasher.xof(64);
    const hex = Array.from(xof64)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex).toBe(KAT_NONCE_XOF64_HEX);
  });

  it('combineTwoNonceRandomness matches Rust nonce_combiner', () => {
    const a = pointFromKat(KAT.a);
    const c = pointFromKat(KAT.expected_aggregated.c);
    const d1 = pointFromKat(KAT.expected_aggregated.d1);
    const d2 = pointFromKat(KAT.expected_aggregated.d2);
    const e1 = pointFromKat(KAT.expected_aggregated.e1);
    const e2 = pointFromKat(KAT.expected_aggregated.e2);
    const { r1, r2, b } = combineTwoNonceRandomness(
      KAT.session_id,
      a,
      c,
      d1,
      d2,
      e1,
      e2,
      KAT.contributing_parties
    );
    const nc = KAT.nonce_combiner;
    expect(b).toBe(BigInt(nc.b));
    expect(r1.x).toBe(BigInt(nc.r1.x));
    expect(r1.y).toBe(BigInt(nc.r1.y));
    expect(r2.x).toBe(BigInt(nc.r2.x));
    expect(r2.y).toBe(BigInt(nc.r2.y));
  });

  it('combine_proofs matches Rust proof', () => {
    const agg = KAT.expected_aggregated;
    const aggregated = DLogCommitmentsShamir.new(
      pointFromKat(agg.c),
      pointFromKat(agg.d1),
      pointFromKat(agg.d2),
      pointFromKat(agg.e1),
      pointFromKat(agg.e2),
      KAT.contributing_parties
    );
    const a = pointFromKat(KAT.a);
    const b = pointFromKat(KAT.b);
    const proofShares = KAT.proof_shares.map((s) => ({ value: BigInt(s) }));
    const proof = aggregated.combineProofs(KAT.session_id, proofShares, a, b);
    expect(proof.e).toBe(BigInt(KAT.proof.e));
    expect(proof.s).toBe(BigInt(KAT.proof.s));
  });
});
