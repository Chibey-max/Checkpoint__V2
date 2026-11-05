import { canonicalJson } from './canonical';
import { sha256 } from './crypto';
import { toHex, utf8ToBytes } from './encoding';
import { EvidenceCoreSchema, type EvidenceCore } from './schemas';

/**
 * evidence_hash = sha256(canonical JSON of the evidence core), lowercase hex.
 * The core is validated first, so unknown fields cannot slip into the hash.
 */
export function evidenceHashHex(core: EvidenceCore): string {
  const parsed = EvidenceCoreSchema.parse(core);
  return toHex(sha256(utf8ToBytes(canonicalJson(parsed))));
}
