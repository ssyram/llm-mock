process.stdout.write(JSON.stringify({
  result: "ready",
  values: {
    payload: { enabled: true, items: ["one", "two"] }
  }
}));
