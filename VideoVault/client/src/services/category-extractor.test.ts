import { describe, it, expect } from 'vitest';
import { CategoryExtractor } from './category-extractor';

describe('CategoryExtractor', () => {
  describe('enriched patterns', () => {
    it('detects new age values', () => {
      const cats = CategoryExtractor.extractCategories('granny teaches college student.mp4');
      expect(cats.age).toContain('granny');
      expect(cats.age).toContain('college');
    });

    it('detects new physical values', () => {
      const cats = CategoryExtractor.extractCategories('tattooed pierced girl scene.mp4');
      expect(cats.physical).toContain('tattooed');
      expect(cats.physical).toContain('pierced');
    });

    it('detects new ethnicity values', () => {
      const cats = CategoryExtractor.extractCategories('thai-brazilian-mixed-beauty.mp4');
      expect(cats.ethnicity).toContain('thai');
      expect(cats.ethnicity).toContain('brazilian');
      expect(cats.ethnicity).toContain('mixed');
    });

    it('detects new relationship values', () => {
      const cats = CategoryExtractor.extractCategories('boss and secretary roommate.mp4');
      expect(cats.relationship).toContain('boss');
      expect(cats.relationship).toContain('roommate');
    });

    it('detects new acts values', () => {
      const cats = CategoryExtractor.extractCategories('deepthroat-bdsm-bondage-roleplay.mp4');
      expect(cats.acts).toContain('deepthroat');
      expect(cats.acts).toContain('bdsm');
      expect(cats.acts).toContain('bondage');
      expect(cats.acts).toContain('roleplay');
    });

    it('detects new setting values', () => {
      const cats = CategoryExtractor.extractCategories('gym sauna jacuzzi scene.mp4');
      expect(cats.setting).toContain('gym');
      expect(cats.setting).toContain('sauna');
      expect(cats.setting).toContain('jacuzzi');
    });

    it('detects new quality values', () => {
      const cats = CategoryExtractor.extractCategories('scene 8k 60fps hdr.mp4');
      expect(cats.quality).toContain('8k');
      expect(cats.quality).toContain('60fps');
      expect(cats.quality).toContain('hdr');
    });
  });

  describe('existing patterns still work', () => {
    it('detects basic age values', () => {
      const cats = CategoryExtractor.extractCategories('teen milf scene.mp4');
      expect(cats.age).toContain('teen');
      expect(cats.age).toContain('milf');
    });

    it('detects basic physical values', () => {
      const cats = CategoryExtractor.extractCategories('blonde busty petite.mp4');
      expect(cats.physical).toContain('blonde');
      expect(cats.physical).toContain('busty');
      expect(cats.physical).toContain('petite');
    });

    it('detects basic acts values', () => {
      const cats = CategoryExtractor.extractCategories('anal creampie threesome.mp4');
      expect(cats.acts).toContain('anal');
      expect(cats.acts).toContain('creampie');
      expect(cats.acts).toContain('threesome');
    });
  });

  describe('extractFromPath', () => {
    it('extracts categories from directory path segments', () => {
      const cats = CategoryExtractor.extractFromPath('/hdd-ext/outdoor/blonde-milf/scene.mp4');
      expect(cats.setting).toContain('outdoor');
      expect(cats.physical).toContain('blonde');
      expect(cats.age).toContain('milf');
    });

    it('extracts performer names from path', () => {
      const cats = CategoryExtractor.extractFromPath('/hdd-ext/Performers/Jane Doe/scene.mp4');
      expect(cats.performer).toContain('jane doe');
    });

    it('returns empty categories for root-level files', () => {
      const cats = CategoryExtractor.extractFromPath('scene.mp4');
      const allValues = Object.values(cats).flat();
      expect(allValues).toHaveLength(0);
    });

    it('does not extract common directory names as categories', () => {
      const cats = CategoryExtractor.extractFromPath('/videos/clips/new/scene.mp4');
      // 'new' is a common word and should not be extracted as a performer
      expect(cats.performer).not.toContain('new');
    });
  });

  describe('getSuggestions', () => {
    it('combines filename and path extraction', () => {
      const suggestions = CategoryExtractor.getSuggestions(
        'deepthroat scene.mp4',
        '/hdd-ext/outdoor/video/',
      );
      expect(suggestions.acts).toContain('deepthroat');
      expect(suggestions.setting).toContain('outdoor');
    });

    it('deduplicates across sources', () => {
      const suggestions = CategoryExtractor.getSuggestions(
        'outdoor scene.mp4',
        '/hdd-ext/outdoor/',
      );
      // 'outdoor' should appear only once
      expect(suggestions.setting.filter((v: string) => v === 'outdoor')).toHaveLength(1);
    });
  });
});
