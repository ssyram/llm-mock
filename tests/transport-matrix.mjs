import { writeFileSync } from "node:fs";
import { startServer, freePort } from "./harness.mjs";
import { loadCorpora, corpusContexts, syntheticContexts, replyCases } from "./corpus.mjs";
import { additionalContexts, corpusReplies, additionalReplies } from "./extended-matrix-cases.mjs";
import { makeModel } from "./models-shared.mjs";
import { canonicalCodex, canonicalVertex } from "./canonical-family-variants.mjs";
import { requestDirection, replyDirection } from "./matrix-lib.mjs";
import { w06RequestCases, w06ReplyCases } from "./w06-matrix-cases.mjs";
import { w08RequestCases, w08ReplyCases } from "./w08-matrix-cases.mjs";
import { withVertexAdc } from "./vertex-adc-fixture.mjs";
import { codex } from "./pi-ai-imports.mjs";

const results=[];
const corpora=loadCorpora();
const startedAt=new Date().toISOString();
const save=()=>writeFileSync(new URL("./transport-unblock-variants.json",import.meta.url),JSON.stringify({startedAt,updatedAt:new Date().toISOString(),results},null,2));
const port=await freePort();const server=await startServer(port);
async function run(variant,api,canonical,options) {
 const model={...makeModel(api,port),...(api==="google-vertex"?{baseUrl:server.mistralBaseUrl+"/v1"}:{})};
 const cases=[...corpusContexts(corpora),...syntheticContexts(model),...additionalContexts(model),...w06RequestCases(model),...w08RequestCases(model)].map(tc=>({...tc,options:{...tc.options,...options}}));
 const local=[];
 const transportCanonical=(context,model,options)=>{
  const expected=canonical(context,model,options);
  if(variant==="codex-websocket"&&options.cacheRetention==="none")expected.options.sessionId="@pi-generated:uuidv7";
  return expected;
 };
 await requestDirection(api,model,server,cases,transportCanonical,local);
 const replies=replyCases({api,provider:model.provider,id:model.id});
 await replyDirection(api,model,server,local,[...replies,...corpusReplies(corpora),...additionalReplies(model,replies[0].message),...w06ReplyCases(model,replies[0].message),...w08ReplyCases(model,replies[0].message)],options);
 results.push(...local.map(r=>({...r,variant})));
 save();console.log(`${variant}: ${local.filter(r=>r.ok).length} pass / ${local.filter(r=>!r.ok).length} fail`);
}
try {
 await run("codex-websocket","openai-codex-responses",canonicalCodex,{transport:"websocket"});
 await withVertexAdc(options=>run("vertex-adc","google-vertex",canonicalVertex,options));
} finally {codex.closeOpenAICodexWebSocketSessions();await server.stop();save();}
for(const r of results.filter(r=>!r.ok))console.log(`FAIL ${r.variant}/${r.dir}/${r.name}: ${r.diffs.join("; ")}`);
if(results.some(r=>!r.ok))process.exitCode=1;
