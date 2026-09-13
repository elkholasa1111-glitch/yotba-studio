import assert from 'node:assert/strict';
import { emptySocialLinks, sanitizeSocialLinks, sanitizeSocialUrl } from '../social';

assert.equal(sanitizeSocialUrl('https://instagram.com/yotba'), 'https://instagram.com/yotba');
assert.equal(sanitizeSocialUrl('javascript:alert(1)'), null);
assert.equal(sanitizeSocialUrl('https://user:pass@example.com'), null);
assert.equal(sanitizeSocialUrl(''), null);

const links = sanitizeSocialLinks({
  instagram: 'https://instagram.com/yotba',
  facebook: 'not-a-url',
  tiktok: '',
});
assert.deepEqual(links, {
  ...emptySocialLinks(),
  instagram: 'https://instagram.com/yotba',
});

console.log('Social links validation tests passed.');

