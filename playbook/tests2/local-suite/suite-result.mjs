export function suiteStatus(results, dependenciesAvailable = true) {
  if (!results.length) throw new Error("cannot pass an empty suite");
  return dependenciesAvailable && results.every((item) => item.status === "passed") ? "passed" : "failed";
}
