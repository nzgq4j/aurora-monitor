import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { renderFeedbackEmail } from './feedback';

describe('feedback email', () => {
  it('labels the kind and trims a long first line into the subject', () => {
    const { subject } = renderFeedbackEmail({ kind: 'issue', message: 'The map stays blank on my phone after I zoom in twice and then rotate it', email: 'a@b.c', name: 'Ann', context: {} });
    expect(subject.startsWith('Issue: The map stays blank')).toBe(true);
    expect(subject.length).toBeLessThanOrEqual(7 + 60);
  });
  it('escapes what the member wrote and lists the context', () => {
    const { html, text } = renderFeedbackEmail({ kind: 'idea', message: '<script>x</script> & more', email: null, name: null, context: { where: 'android app', plan: 'chaser', build: '' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('where: android app');
    expect(html).not.toContain('build:');
    expect(text).toContain('Feature request from A member');
  });
});
