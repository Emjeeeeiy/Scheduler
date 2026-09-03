import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTagModel, significantWords, suggestTag } from '../src/lib/suggestTag.js'

const task = (title, tagId) => ({ title, tagId })

/* A small but realistic history: "standup" and "retro" only ever happen at
   work, "gym" only ever personally, and "review" happens in both. */
const HISTORY = [
  task('Standup', 'work'),
  task('Standup with the team', 'work'),
  task('Sprint retro', 'work'),
  task('Retro notes', 'work'),
  task('Gym session', 'personal'),
  task('Gym with Ana', 'personal'),
  task('Review the deck', 'work'),
  task('Review holiday photos', 'personal'),
  task('Untagged thing', null),
]

const model = buildTagModel(HISTORY)
const suggest = (title) => suggestTag(title, model)

describe('significantWords', () => {
  it('lowercases, splits on punctuation, and drops noise', () => {
    assert.deepEqual(significantWords('Lunch with Ana!'), ['lunch', 'ana'])
  })

  it('drops stopwords, short words, and bare numbers', () => {
    assert.deepEqual(significantWords('Go to the 2026 review'), ['review'])
  })

  it('keeps a word carrying a digit, which usually names something', () => {
    assert.deepEqual(significantWords('Q3 planning'), ['q3', 'planning'])
  })

  it('counts a repeated word once', () => {
    assert.deepEqual(significantWords('review review review'), ['review'])
  })

  it('is empty for nothing, null, or pure punctuation', () => {
    assert.deepEqual(significantWords(''), [])
    assert.deepEqual(significantWords(null), [])
    assert.deepEqual(significantWords('!!! ---'), [])
  })
})

describe('suggestTag', () => {
  it('suggests the tag a word has only ever been filed under', () => {
    assert.equal(suggest('Standup').tagId, 'work')
    assert.equal(suggest('Gym').tagId, 'personal')
  })

  it('reports full confidence when every voting word agrees', () => {
    const result = suggest('Standup retro')
    assert.equal(result.tagId, 'work')
    assert.equal(result.confidence, 1)
  })

  it('says nothing when a word is split evenly between tags', () => {
    // "review" is 50/50 across work and personal — a coin flip dressed up
    // as a suggestion is worse than no suggestion.
    assert.equal(suggest('Review'), null)
  })

  it('lets a decisive word carry an ambiguous one', () => {
    const result = suggest('Review the retro')
    assert.equal(result.tagId, 'work')
    assert.ok(result.confidence > 0.5)
  })

  it('says nothing about a word it has never seen', () => {
    assert.equal(suggest('Kayaking'), null)
  })

  it('ignores a word seen only once', () => {
    // "deck" appears exactly once. One coincidence is not a pattern.
    const solo = buildTagModel([task('Review the deck', 'work')])
    assert.equal(suggestTag('deck', solo), null)
  })

  it('learns nothing from untagged history', () => {
    const empty = buildTagModel([task('Untagged thing', null), task('Another', undefined)])
    assert.equal(suggestTag('Untagged thing', empty), null)
  })

  it('survives an empty or missing model and empty input', () => {
    assert.equal(suggestTag('Anything', buildTagModel([])), null)
    assert.equal(suggestTag('Anything', null), null)
    assert.equal(suggestTag('', model), null)
  })

  it('never suggests a tag that no longer exists', () => {
    // A model built before a tag was deleted would otherwise keep offering
    // it, and the form would show a tag the picker cannot display.
    assert.equal(suggestTag('Standup', model, new Set(['personal'])), null)
    assert.equal(suggestTag('Standup', model, new Set(['work'])).tagId, 'work')
  })

  it('is not simply won by whichever tag has the most tasks', () => {
    /* 'work' outnumbers 'niche' ten to one overall, but "kayak" belongs
       entirely to 'niche' — splitting each word's vote across the tags it
       was seen with is what keeps the larger tag from swallowing it. */
    const lopsided = buildTagModel([
      ...Array.from({ length: 10 }, (_, i) => task(`Meeting number ${i} agenda`, 'work')),
      task('Kayak trip', 'niche'),
      task('Kayak lesson', 'niche'),
    ])
    assert.equal(suggestTag('Kayak', lopsided).tagId, 'niche')
  })
})
