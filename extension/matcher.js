/* Shared by Chrome content scripts and Node tests. */
(function (root) {
  "use strict";
  const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase();
  const tokenize = query => normalize(query).match(/[a-z]+|[0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{M}]+/gu) || [];

  function occurrences(fields, token) {
    const found = [];
    fields.forEach((field, fieldIndex) => {
      let start = 0;
      while ((start = field.indexOf(token, start)) !== -1) {
        found.push({field: fieldIndex, start, end: start + token.length});
        start += 1;
      }
    });
    return found;
  }

  function matches(query, title, tags = []) {
    const tokens = tokenize(query);
    if (!tokens.length) return true;
    // Keep real field boundaries. A fabricated word must not arise at a join.
    const fields = [title, ...tags].map(normalize);
    const inventory = new Map();
    for (const char of fields.join("")) inventory.set(char, (inventory.get(char) || 0) + 1);
    for (const char of tokens.join("")) {
      if (!inventory.get(char)) return false;
      inventory.set(char, inventory.get(char) - 1);
    }
    const literal = tokens.filter(token => !/^[a-z]+$/.test(token)).sort((a,b) => b.length-a.length);
    const english = tokens.filter(token => /^[a-z]+$/.test(token));
    const tasks = [...literal.map(token => ({token, split: false})), ...english.map(token => ({token, split: true}))];
    const occupied = [];
    const available = spot => !occupied.some(other => other.field === spot.field && spot.start < other.end && other.start < spot.end);
    const spots = new Map();
    const getSpots = chunk => {
      if (!spots.has(chunk)) spots.set(chunk, occurrences(fields, chunk));
      return spots.get(chunk);
    };

    function solve(taskIndex, offset = 0) {
      if (taskIndex === tasks.length) return true;
      const {token, split} = tasks[taskIndex];
      const remaining = token.length - offset;
      // One-letter searches work, but one-letter fragments cannot fill a longer word.
      const minimum = split && token.length > 1 ? 2 : remaining;
      for (let length = remaining; length >= minimum; length--) {
        if (!split && length !== remaining) continue;
        if (remaining - length === 1) continue;
        const chunk = token.slice(offset, offset + length);
        for (const spot of getSpots(chunk)) {
          if (!available(spot)) continue;
          occupied.push(spot);
          const done = length === remaining;
          if (done ? solve(taskIndex + 1) : solve(taskIndex, offset + length)) return true;
          occupied.pop();
        }
      }
      return false;
    }
    return solve(0);
  }

  const api = {normalize, tokenize, matches};
  root.BiliCompleteMatcher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
