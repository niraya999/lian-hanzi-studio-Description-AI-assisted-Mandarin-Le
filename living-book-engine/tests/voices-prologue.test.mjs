import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pilot = JSON.parse(readFileSync(new URL('../content/voices-of-dawn-prologue-pilot.json', import.meta.url), 'utf8'));

test('six-page delegated draft has stable ordered page and block IDs', () => {
  assert.equal(pilot.status, 'delegated_draft');
  assert.equal(pilot.pages.length, 6);
  assert.equal(pilot.pages.reduce((n, page) => n + page.blocks.length, 0), 12);
  const ids = new Set();
  for (const [index, page] of pilot.pages.entries()) {
    assert.ok(page.id && !ids.has(page.id));
    ids.add(page.id);
    if (index < pilot.pages.length - 1) assert.equal(page.next_page_id, pilot.pages[index + 1].id);
    else assert.ok(page.next_page_id, 'Final prologue page retains the future chapter reference');
    for (const block of page.blocks) {
      assert.ok(block.id && !ids.has(block.id));
      ids.add(block.id);
      for (const sentence of block.sentences) {
        assert.ok(sentence.id && !ids.has(sentence.id));
        ids.add(sentence.id);
      }
    }
  }
});

test('source annotations match Unicode code-point offsets', () => {
  let checked = 0;
  for (const page of pilot.pages) for (const block of page.blocks) for (const sentence of block.sentences) {
    const chars = Array.from(sentence.text['zh-Hant']);
    assert.ok(sentence.text.pinyin && sentence.text.en && sentence.text['id-ID']);
    let previousEnd = 0;
    for (const token of [...sentence.tokens].sort((a,b)=>a.start-b.start)) {
      assert.ok(Number.isInteger(token.start) && Number.isInteger(token.end));
      assert.ok(token.start >= previousEnd && token.end <= chars.length && token.end > token.start);
      assert.equal(chars.slice(token.start, token.end).join(''), token.text, sentence.id);
      assert.ok(token.meanings.en && token.meanings['id-ID']);
      previousEnd = token.end;
      checked++;
    }
  }
  assert.ok(checked > 0);
});
