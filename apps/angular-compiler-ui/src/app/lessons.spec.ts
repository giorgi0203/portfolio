import { describe, expect, it } from 'vitest';
import { learningLessons } from './lessons';

describe('Angular Learning Lab lessons', () => {
  it('keeps the original lessons and adds change-detection and rendering tasks', () => {
    expect(learningLessons.map(lesson => lesson.id)).toEqual([
      'signals',
      'conditional',
      'lists',
      'forms',
      'communication',
      'change-detection',
      'rendering'
    ]);

    const changeDetection = learningLessons.find(lesson => lesson.id === 'change-detection');
    const rendering = learningLessons.find(lesson => lesson.id === 'rendering');

    expect(changeDetection).toBeDefined();
    expect(changeDetection?.source).toContain('ChangeDetectionStrategy.OnPush');
    expect(changeDetection?.source).toContain("this.profile().name = 'Grace'");
    expect(changeDetection?.solution).toContain("({ ...value, name: 'Grace' })");
    expect(changeDetection?.hints.length).toBeGreaterThan(0);
    expect(changeDetection?.checks.map(check => check.kind)).toContain('click-text');

    expect(rendering).toBeDefined();
    expect(rendering?.source).toContain('ngTemplateOutletContext');
    expect(rendering?.source).toContain('let-notice="notice"');
    expect(rendering?.solution).toContain('let-notice>');
    expect(rendering?.source).toContain('@empty');
    expect(rendering?.hints.length).toBeGreaterThan(0);
    expect(rendering?.checks.map(check => check.kind)).toContain('click-text');
  });
});
