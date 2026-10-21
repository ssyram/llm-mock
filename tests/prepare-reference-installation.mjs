import { referenceRoot, referenceSourceState } from "./pi-ai-reference.mjs";
import { writeInstallation } from "./reference-installation.mjs";
const source = referenceSourceState();
if (source.missing) throw new Error(source.missing);
console.log(`Prepared reference installation ${writeInstallation(referenceRoot, source)}`);
