import { vertex, piAi } from "./pi-ai-imports.mjs";
import { startServer, freePort, withCapture } from "./harness.mjs";
import { makeModel } from "./models-shared.mjs";
import { withVertexAdc } from "./vertex-adc-fixture.mjs";

export async function probeAdc() {
 const port = await freePort();
 const server = await startServer(port);
 try {
  return await withVertexAdc(async(options)=>{
   const model={...makeModel("google-vertex",port),baseUrl:server.mistralBaseUrl+"/v1"};
   const cap=await withCapture(server,()=>vertex.stream(model,piAi.normalizeContext({messages:[{role:"user",content:"offline ADC",timestamp:1}]}),{...options,signal:AbortSignal.timeout(5000)}).result());
   return {ok:cap.value.stopReason==="stop",api:cap.record.api,keyIsJwt:cap.record.keyId.split(".").length===3,request:cap.record.request,stopReason:cap.value.stopReason,error:cap.value.errorMessage};
  });
 } finally {await server.stop();}
}
if (process.argv[1]?.endsWith("vertex-adc-probe.mjs")) {
 try {const result=await probeAdc();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;} catch(error){console.error(error.message);process.exitCode=1;}
}
