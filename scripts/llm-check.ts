/**
 * pnpm llm:check   (task D-0.4)
 *
 * One structured parse of the demo list through the Groq API, compared with
 * the deterministic parser. Needs GROQ_API_KEY in .env. Costs a fraction of a
 * US cent. CI never runs this.
 */
import {
  createLlm,
  DEFAULT_GROQ_MODEL,
  parseDeterministic,
  parseWithLlm,
} from '@checkpoint/agents';
import { loadRootEnv, loadSnapshotOrThrow, resolveFromRoot } from '@checkpoint/shared/node';

loadRootEnv();

const DEMO =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 1 TB object storage for 1 month, unicorn';

async function main(): Promise<number> {
  if (!process.env.GROQ_API_KEY) {
    console.error('llm:check: GROQ_API_KEY is not set (put it in .env)');
    return 2;
  }
  const snap = loadSnapshotOrThrow(
    resolveFromRoot(process.env.EVIDENCE_DIR || './data/fixtures/dev-snapshot'),
  );
  const model = process.env.LLM_MODEL || DEFAULT_GROQ_MODEL;
  const llm = createLlm({ provider: 'groq', model, apiKey: process.env.GROQ_API_KEY })!;
  const t = Date.now();
  const viaLlm = await parseWithLlm(llm, DEMO, snap.catalog);
  const ms = Date.now() - t;
  const viaRules = parseDeterministic(DEMO, snap.catalog);
  const same = JSON.stringify(viaLlm.items) === JSON.stringify(viaRules.items);
  console.log(`model ${model} via Groq, ${ms} ms`);
  console.log('LLM items          ', JSON.stringify(viaLlm.items));
  console.log('deterministic items', JSON.stringify(viaRules.items));
  console.log('LLM unmatched      ', JSON.stringify(viaLlm.unmatched.map((u) => u.text)));
  console.log(
    same ? '\nPASS: both parsers agree' : '\nDIFF: parsers disagree (check the list and aliases)',
  );
  return same ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`llm:check: ${e.message}`);
    process.exit(1);
  },
);
