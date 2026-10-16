import test from "node:test";
import assert from "node:assert/strict";
import { compareRequest } from "./canonical-request-comparison.mjs";
import { markGeneratedSessionId } from "./generated-session-id.mjs";

test("literal marker-looking session IDs remain ordinary exact values",()=>{
 const expected={options:{sessionId:"@pi-generated:uuidv7"}};
 assert.deepEqual(compareRequest(structuredClone(expected),expected,"openai-codex-responses",100,200),[]);
 const actual={options:{sessionId:"00000000-0096-7000-8000-000000000000"}};
 assert.ok(compareRequest(actual,expected,"openai-codex-responses",100,200).length);
});

test("Codex WS generated session UUID is validated independently, not copied from actual",()=>{
 const expected={options:{},model:"m"};
 markGeneratedSessionId(expected.options);
 const timestamp=Date.now();const hex=timestamp.toString(16).padStart(12,"0");
 const actual={options:{sessionId:`${hex.slice(0,8)}-${hex.slice(8)}-7000-8000-000000000000`},model:"m"};
 assert.deepEqual(compareRequest(actual,expected,"openai-codex-responses",timestamp,timestamp),[]);
 for(const mutated of ["not uuid",actual.options.sessionId.replace("-7000-","-4000-"),undefined])assert.ok(compareRequest({...actual,options:{sessionId:mutated}},expected,"openai-codex-responses",timestamp,timestamp).length);
 assert.ok(compareRequest(actual,expected,"openai-codex-responses",timestamp+1,timestamp+2).length);
 assert.ok(compareRequest({...actual,model:"wrong"},expected,"openai-codex-responses",timestamp,timestamp).length);
 assert.ok(compareRequest({options:{sessionId:"wrong"}},{options:{sessionId:"fixed"}},"openai-codex-responses",timestamp,timestamp).length);
});
