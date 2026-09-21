import assert from 'node:assert/strict';
import { configureLocalDns } from '../local-dns';

const calls: string[][] = [];
const setServers = (servers: string[]) => { calls.push(servers); };
for (const environment of ['production', 'test', undefined]) {
  configureLocalDns(environment, '1.1.1.1', {}, setServers);
}
configureLocalDns('development', '', {}, setServers);
configureLocalDns('development', '  ', {}, setServers);
assert.equal(calls.length, 0);

const state = {};
configureLocalDns('development', '1.1.1.1, 8.8.8.8', state, setServers);
assert.deepEqual(calls, [['1.1.1.1', '8.8.8.8']]);
configureLocalDns('development', '9.9.9.9', state, setServers);
assert.equal(calls.length, 1, 'HMR and reconnects must not reconfigure active DNS queries');

for (const invalid of ['example.com', '1.1.1.1,', 'https://1.1.1.1', '999.1.1.1']) {
  assert.throws(() => configureLocalDns('development', invalid, {}, setServers), /IP addresses/);
}
const retryState = {};
assert.throws(() => configureLocalDns('development', '1.1.1.1', retryState, () => {
  throw new Error('resolver failed');
}));
configureLocalDns('development', '1.1.1.1', retryState, setServers);
assert.equal(calls.length, 2, 'Only mark configured after a successful configuration');
console.log('Local DNS configuration tests passed');
