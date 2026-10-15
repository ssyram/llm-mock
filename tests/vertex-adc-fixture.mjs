import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function withVertexAdc(run) {
 const dir = mkdtempSync(join(tmpdir(), "mock-vertex-adc-"));
 const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: {type:"pkcs8",format:"pem"}, publicKeyEncoding:{type:"spki",format:"pem"} });
 const path = join(dir,"adc.json");
 writeFileSync(path,JSON.stringify({type:"service_account",project_id:"mock-project",private_key_id:"mock-key",private_key:privateKey,client_email:"mock@mock.invalid",universe_domain:"mock.invalid"}), {mode:0o600});
 try {
  return await run({apiKey:"gcp-vertex-credentials",project:"mock-project",location:"global",env:{GOOGLE_APPLICATION_CREDENTIALS:path},maxRetries:0});
 } finally {rmSync(dir,{recursive:true,force:true});}
}
