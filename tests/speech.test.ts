import { describe, expect, it } from 'vitest';
import { rankVoices, scoreVoice, speakable, toSpeechChunks } from '../src/ui/speech';

describe('speakable (text made natural for speech)', () => {
  it('says prices as words, not symbols', () => {
    expect(speakable('A cleaning is $120.')).toBe('A cleaning is 120 dollars.');
    expect(speakable('The fee is $1,500 or $49.50')).toContain('1500 dollars');
    expect(speakable('$49.50')).toBe('49 dollars and 50 cents');
  });
  it('spells confirmation codes and phone numbers digit by digit', () => {
    expect(speakable('Your code is BK-1006.')).toBe('Your code is B K, 1 0 0 6.');
    expect(speakable('Call 631-555-0142')).toBe('Call 6 3 1, 5 5 5, 0 1 4 2');
  });
  it('drops ":00" from times and keeps real minutes', () => {
    expect(speakable('at 2:00 PM')).toBe('at 2 P M');
    expect(speakable('at 9:30 AM')).toBe('at 9:30 A M');
  });
  it('turns ISO dates into spoken dates', () => expect(speakable('on 2026-11-20')).toBe('on November 20'));
  it('removes markdown and list markers', () => {
    const out = speakable('**Please** call 911.\n- Apply pressure\n- Keep calm');
    expect(out).not.toMatch(/[*#]|^- /m);
    expect(out).toContain('Apply pressure');
  });
});

describe('toSpeechChunks', () => {
  it('splits into sentence-sized pieces within the limit and loses no words', () => {
    const text = 'First sentence here. Second one follows. ' + 'Another sentence that is quite a bit longer than the others, to force a split. '.repeat(4);
    const chunks = toSpeechChunks(text, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 220)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('Second one follows.');
  });
  it('returns nothing for empty input', () => expect(toSpeechChunks('   ')).toEqual([]));
});

describe('voice ranking', () => {
  const v = (name: string, lang = 'en-US') => ({ name, lang, voiceURI: name });
  it('prefers premium/natural voices and demotes novelty and non-English voices', () => {
    const ranked = rankVoices([v('Fred'), v('Samantha'), v('Ava (Premium)'), v('Daniel', 'en-GB'), v('Thomas', 'fr-FR'), v('Albert')]).map((x) => x.name);
    expect(ranked[0]).toBe('Ava (Premium)');
    expect(ranked).not.toContain('Thomas');
    expect(ranked.indexOf('Samantha')).toBeLessThan(ranked.indexOf('Fred'));
  });
  it('scores non-English as unusable', () => expect(scoreVoice(v('Amelie', 'fr-CA'))).toBeLessThan(0));
});
