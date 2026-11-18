process.stdout.write(JSON.stringify({
  result: "illegal",
  pointer: 0,
  continuation: { pc: 99 },
  stack: [{ frame: "forbidden" }]
}));
