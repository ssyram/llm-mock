function flagName(argument) {
  if (typeof argument !== "string" || !argument.startsWith("-") || argument === "-") return null;
  return argument.split("=", 1)[0];
}

export function assertNoDuplicateFlags(argumentsList) {
  const seen = new Map();
  let optionsEnded = false;
  argumentsList.forEach((argument, index) => {
    if (optionsEnded) return;
    if (argument === "--") {
      optionsEnded = true;
      return;
    }
    const name = flagName(argument);
    if (!name) return;
    if (seen.has(name)) {
      throw new Error(`duplicate CLI flag ${name} at indexes ${seen.get(name)} and ${index}`);
    }
    seen.set(name, index);
  });
  return [...argumentsList];
}

export function mergeCliFlags(...groups) {
  return assertNoDuplicateFlags(groups.flat());
}
