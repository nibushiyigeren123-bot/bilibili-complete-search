const {test} = require('node:test');
const assert = require('node:assert/strict');
const {matches, tokenize} = require('../extension/matcher.js');

const cases = [
  ['黑色行动7', '黑色行动玩法', ['7'], true],
  ['黑色行动7', '黑色行动6玩法', [], false],
  ['BO7', 'BO玩法', ['7'], true],
  ['BO7', 'BO6玩法', [], false],
  ['使命召唤23', '使命召唤', ['23'], true],
  ['现代战争4', '现代战争3', [], false],
  ['一二三12', '一二三玩法', ['12'], true],
  ['一二三12', '第12集', ['一二三'], true],
  ['一二三12', '一二三玩法', [], false],
  ['一二三12', '一二三 第1集第2期', [], false],
  ['一二三12', '一二三 第21集', [], false],
  ['一二三12', '一 二 三12', [], false],
  ['payday', 'PAYDAY 3 gameplay', [], true],
  ['payday', 'pay some other text day', [], true],
  ['payday', 'pay玩法', ['day'], true],
  ['payday', 'day玩法', ['pay'], true],
  ['payday', '无关视频', ['pay', 'day'], true],
  ['payday', 'pay', [], false],
  ['payday', 'p a y d a y', [], false],
  ['payday', 'pay d a y', [], false],
  ['payday', 'paycheck daylight', [], true],
  ['payday', 'pa yday', [], true],
  ['payday', 'pay', ['da'], false],
  ['paypay', 'pay', [], false],
  ['paypay', 'pay', ['pay'], true],
  ['12 12', '12', [], false],
  ['12 123', '123 12', [], true],
  ['一二三PAYDAY１２', 'pay内容day一二三12', [], true],
  ['a', 'A test', [], true],
  ['', '无关视频', [], true],
  ['!!!', '无关视频', [], true],
  ['payday', 'payd', ['ay'], true],
  ['abc', 'ab', ['c'], false],
];
for (const [query, title, tags, expected] of cases) {
  test(JSON.stringify({query, title, tags}), () => assert.equal(matches(query, title, tags), expected));
}
test('mixed scripts split into independent complete requirements', () => {
  assert.deepEqual(tokenize('一二三PAYDAY１２'), ['一二三', 'payday', '12']);
});
