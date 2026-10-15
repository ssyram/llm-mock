import test from "node:test";
import assert from "node:assert/strict";
import { zstdCompressSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { startServer, freePort, withCapture, deepDiff } from "./harness.mjs";
import { canonicalCodex } from "./canonical-family-variants.mjs";
import { codex, vertex, piAi } from "./pi-ai-imports.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { withVertexAdc } from "./vertex-adc-fixture.mjs";

const user = (text) => ({role:"user",content:text,timestamp:1});
const context = (messages) => piAi.normalizeContext({messages});
async function serverTest(run, env) {
 const server=await startServer(await freePort(),env);
 try {await run(server);} finally {codex.closeOpenAICodexWebSocketSessions();await server.stop();}
}
const url = (server) => new URL(server.mistralBaseUrl).origin;

test("Codex SSE decodes real zstd and preserves endTurn",()=>serverTest(async(server)=>{
 const model=makeModel("openai-codex-responses",new URL(url(server)).port);
 const reply={content:[{type:"text",text:"compressed reply"}],api:model.api,provider:model.provider,model:model.id,usage:{input:1,output:2,cacheRead:0,cacheWrite:0,totalTokens:3,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:0,endTurn:false};
 writeFileSync(server.replyPath,JSON.stringify(reply));
 const cap=await withCapture(server,()=>codex.stream(model,context([user("compressed request")]),{...streamOptions(model.api),signal:AbortSignal.timeout(5000)}).result());
 assert.equal(cap.value.content[0].text,"compressed reply");assert.equal(cap.value.endTurn,false);
 assert.equal(cap.record.keyId,streamOptions(model.api).apiKey);
}));

test("Codex zstd missing CLI returns protocol JSON and install guide",()=>serverTest(async(server)=>{
 const response=await fetch(url(server)+"/codex/responses",{method:"POST",headers:{"content-encoding":"zstd"},body:zstdCompressSync(Buffer.from('{"model":"m","input":[]}'))});
 assert.equal(response.status,400);const body=await response.json();
 assert.equal(body.error.type,"invalid_request_error");assert.match(body.error.message,/https:\/\/facebook.github.io\/zstd\//);
},{PATH:""}));

test("Codex corrupt and oversized zstd fail in protocol shape",()=>serverTest(async(server)=>{
 for(const [body,pattern] of [[Buffer.from("not zstd"),/invalid zstd/],[zstdCompressSync(Buffer.alloc(2*1024*1024+1,32)),/exceeds 2 MiB/]]) {
  const response=await fetch(url(server)+"/codex/responses",{method:"POST",headers:{"content-encoding":"zstd"},body});
  assert.equal(response.status,400);assert.match((await response.json()).error.message,pattern);
 }
}));

test("Codex auto uses WebSocket and cached continuation restores full input",()=>serverTest(async(server)=>{
 const model=makeModel("openai-codex-responses",new URL(url(server)).port);
 const sessionId="transport-cached";codex.resetOpenAICodexWebSocketDebugStats(sessionId);
 const options={...streamOptions(model.api),sessionId,transport:"auto"};
 const first=await withCapture(server,()=>codex.stream(model,context([user("first")]),{...options,signal:AbortSignal.timeout(5000)}).result());
 assert.equal(first.value.stopReason,"stop");
 const second=await withCapture(server,()=>codex.stream(model,context([user("first"),first.value,user("second")]),{...options,signal:AbortSignal.timeout(5000)}).result());
 assert.equal(second.value.stopReason,"stop");
 assert.deepEqual(deepDiff(second.record.request,canonicalCodex(context([user("first"),first.value,user("second")]),model,options)),[]);
 const stats=codex.getOpenAICodexWebSocketDebugStats(sessionId);
 assert.equal(stats.connectionsCreated,1);assert.equal(stats.connectionsReused,1);assert.equal(stats.deltaRequests,1);assert.equal(stats.sseFallbacks,0);assert.equal(stats.websocketFailures,0);
}));

test("Codex WS rejects malformed frames and unknown continuation IDs",()=>serverTest(async(server)=>{
 const socket=new WebSocket(url(server).replace("http:","ws:")+"/codex/responses");
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 try {
  for(const [body,code] of [["not json","invalid_request"],[JSON.stringify({type:"response.create",input:[],previous_response_id:"missing"}),"previous_response_not_found"]]) {
   const event=new Promise(resolve=>socket.addEventListener("message",e=>resolve(JSON.parse(e.data)),{once:true}));socket.send(body);
   assert.equal((await event).error.code,code);
  }
 } finally {socket.close();}
}));

test("Codex compressed HTTP and unauthenticated WS work on named and dedicated mounts",()=>serverTest(async(server)=>{
 const port=await freePort();
 const added=await fetch(url(server)+"/__admin/scripts",{method:"POST",body:JSON.stringify({name:"transport",command:`cat '${server.replyPath}'`,port})});
 assert.equal(added.status,201);
 for(const base of [url(server)+"/transport",`http://127.0.0.1:${port}`]) {
  const response=await fetch(base+"/codex/responses",{method:"POST",headers:{"content-encoding":"zstd"},body:zstdCompressSync(Buffer.from('{"model":"m","input":[]}'))});
  assert.equal(response.status,200);assert.match(await response.text(),/response.completed/);
  const socket=new WebSocket(base.replace("http:","ws:")+"/backend-api/codex/responses");
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  try {
   const result=new Promise(resolve=>socket.addEventListener("message",event=>{const frame=JSON.parse(event.data);if(frame.type==="response.completed"||frame.type==="error")resolve(frame);}));
   socket.send(JSON.stringify({type:"response.create",model:"m",input:[]}));
   assert.equal((await result).type,"response.completed");
  } finally {socket.close();}
 }
}));

test("Vertex ADC accepts synthetic service account on local custom baseUrl",()=>serverTest(async(server)=>withVertexAdc(async(options)=>{
 const model={...makeModel("google-vertex",new URL(url(server)).port),baseUrl:server.mistralBaseUrl+"/v1"};
 const cap=await withCapture(server,()=>vertex.stream(model,context([user("ADC request")]),{...options,signal:AbortSignal.timeout(5000)}).result());
 assert.equal(cap.value.stopReason,"stop");assert.equal(cap.record.api,"google-vertex");assert.equal(cap.record.keyId.split(".").length,3);
 const claims=JSON.parse(Buffer.from(cap.record.keyId.split(".")[1],"base64url"));
 assert.equal(claims.iss,"mock@mock.invalid");assert.equal(claims.scope,"https://www.googleapis.com/auth/cloud-platform");
})));
