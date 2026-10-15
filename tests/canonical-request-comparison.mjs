import { deepDiff } from "./harness.mjs";

export function compareRequest(actual, expected, api, started, ended) {
 if(expected.options?.sessionId!=="@pi-generated:uuidv7")return deepDiff(actual,expected,[],"$",[],api);
 const id=actual.options?.sessionId;
 const matches=typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
 const timestamp=matches?Number.parseInt(id.replaceAll("-","").slice(0,12),16):NaN;
 const diffs=matches&&timestamp>=started&&timestamp<=ended?[]:["$.options.sessionId: invalid pi-generated UUIDv7 or outside request clock interval"];
 const got=structuredClone(actual),want=structuredClone(expected);
 if(got.options)delete got.options.sessionId;
 delete want.options.sessionId;
 return deepDiff(got,want,[],"$",diffs,api);
}
