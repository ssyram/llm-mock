import test from "node:test";
import assert from "node:assert/strict";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { makeModel } from "./models-shared.mjs";
import { deepDiff } from "./harness.mjs";

function failed(api,errorMessage) {
 const model=makeModel(api,1234);
 return canonicalReply(api,{api,provider:model.provider,model:model.id,content:[],timestamp:0,stopReason:"error",errorMessage,rawStopReason:"source raw",endTurn:true,usage:{input:1,output:2,cacheRead:0,cacheWrite:0,totalTokens:3,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}},model);
}

test("Codex mapCodexEvents failed branch bypasses Responses rawStopReason and error prefix",()=>{
 for(const [message,expected] of [[undefined,"unknown error"],["","Codex response failed"],["failure","failure"]]) {
  const out=failed("openai-codex-responses",message);
  assert.equal(out.errorMessage,expected);assert.equal(out.rawStopReason,undefined);assert.equal(out.endTurn,undefined);assert.equal(out.usage.totalTokens,0);
  const actual={...structuredClone(out),timestamp:150};
  assert.deepEqual(compareReply(actual,out,deepDiff,100,200),[]);
  actual.errorMessage="server_error: "+expected;
  assert.ok(compareReply(actual,out,deepDiff,100,200).some(diff=>diff.includes("errorMessage")));
 }
 assert.equal(failed("openai-responses","").errorMessage,"server_error: no message");
 assert.equal(failed("azure-openai-responses",undefined).rawStopReason,"failed");
});
