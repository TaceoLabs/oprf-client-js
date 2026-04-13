import { parseArgs } from 'node:util';
import {
  distributedOprf,
  isOprfClientError,
  randomBlindingFactor,
  toOprfUri,
} from '@taceo/oprf-client';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'api-key': { type: 'string' },
    services: { type: 'string' },
    module: { type: 'string' },
    threshold: { type: 'string' },
    query: { type: 'string' },
    'domain-separator': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.includes('--help')) {
  console.log(`Usage: oprf-example [options]

Options:
  --api-key <string>              API key for authentication (required)
  --services <url1,url2,...>      Comma-separated service base URLs (required)
  --module <string>               Module name for the OPRF service (required)
  --threshold <number>            Minimum responses needed (required)
  --query <bigint>                Input value as decimal string (required)
  --domain-separator <string>     Domain separator string (default: "OPRF TestNet")
  -h, --help                      Show this help message
`);
  process.exit(0);
}

const missing: string[] = [];
if (!values['api-key']) missing.push('--api-key');
if (!values['services']) missing.push('--services');
if (!values['module']) missing.push('--module');
if (!values['threshold']) missing.push('--threshold');
if (!values['query']) missing.push('--query');

if (missing.length > 0) {
  console.error(`Error: missing required arguments: ${missing.join(', ')}`);
  console.error('Run with --help for usage.');
  process.exit(1);
}

function bytesToFieldBe(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = 0; i < bytes.length; i++) {
    n = n * 256n + BigInt(bytes[i]!);
  }
  return n;
}

const apiKey = values['api-key']!;
const servicesBases = values['services']!.split(',').map((s) => s.trim());
const module = values['module']!;
const threshold = parseInt(values['threshold']!, 10);
const query = BigInt(values['query']!);
const domainSeparatorStr = values['domain-separator'] ?? 'OPRF TestNet';
const domainSeparator = bytesToFieldBe(
  new TextEncoder().encode(domainSeparatorStr)
);

if (isNaN(threshold) || threshold < 1) {
  console.error('Error: --threshold must be a positive integer');
  process.exit(1);
}

const services = servicesBases.map((s) => toOprfUri(s, module));
const blindingFactor = randomBlindingFactor();

console.log('Running distributed OPRF...');
console.log(`  Services: ${services.join(', ')}`);
console.log(`  Module: ${module}`);
console.log(`  Threshold: ${threshold}`);
console.log(`  Query: ${query}`);
console.log(`  Domain separator: ${domainSeparator}`);
console.log('');

try {
  const result = await distributedOprf(
    services,
    threshold,
    query,
    blindingFactor,
    domainSeparator,
    { api_key: apiKey }
  );

  console.log('Result:');
  console.log(`  output:         ${result.output}`);
  console.log(`  epoch:          ${result.epoch}`);
  console.log(`  publicKey.x:    ${result.oprfPublicKey.x}`);
  console.log(`  publicKey.y:    ${result.oprfPublicKey.y}`);
} catch (err) {
  if (isOprfClientError(err)) {
    console.error(`OPRF error [${err.code}]: ${err.message}`);
    if (err.details) {
      console.error('  details:', err.details);
    }
  } else {
    console.error('Unexpected error:', err);
  }
  process.exit(1);
}
