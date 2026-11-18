import { readFileSync } from 'node:fs';

const { with: args } = JSON.parse(readFileSync(0, 'utf8'));
if (!Number.isInteger(args.current) || !Number.isInteger(args.limit)) throw new Error('integer counter and limit required');
const next = args.current + 1;
process.stdout.write(JSON.stringify({ result: next < args.limit ? 'again' : 'done', values: { next } }));
