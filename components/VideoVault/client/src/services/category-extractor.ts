import type { VideoCategories } from '@/types/video';
import { CORRUPT_PERFORMERS } from '@shared/corrupt-performers';

const CORRUPT_PERFORMERS_SET = new Set(CORRUPT_PERFORMERS.map((p) => p.toLowerCase()));

export class CategoryExtractor {
  static readonly CATEGORY_PATTERNS = {
    age: [
      'teen', 'teenager', '18yo', '19yo', 'young', 'mature', 'milf', 'cougar', 'older',
      'granny', 'college', 'middle aged', 'babe', 'old/young', 'innocent',
    ],
    physical: [
      'blonde', 'blond', 'brunette', 'redhead', 'petite', 'busty', 'big tits',
      'small tits', 'skinny', 'curvy', 'thick', 'slim', 'tall', 'short',
      'athletic', 'chubby', 'natural', 'fake', 'pierced', 'tattooed',
      'hairy', 'shaved', 'bald', 'muscular', 'fit', 'big ass', 'small ass',
      'long hair', 'short hair', 'tiny', 'beautiful', 'beauty', 'cute',
      'sexy', 'huge', 'tight', 'glasses', 'braces', 'stockings',
      'lingerie', 'latex', 'leather', 'nylon', 'pantyhose',
      'gorgeous', 'hottie', 'big cock', 'big dick',
    ],
    ethnicity: [
      'asian', 'russian', 'italian', 'british', 'japanese', 'chinese',
      'korean', 'indian', 'latina', 'ebony', 'white', 'european', 'american',
      'thai', 'vietnamese', 'filipina', 'brazilian', 'colombian', 'mexican',
      'german', 'french', 'spanish', 'czech', 'hungarian', 'african',
      'middle eastern', 'mixed', 'deutsches',
      'polish', 'swedish', 'dutch', 'turkish', 'persian', 'arab',
      'moroccan', 'puerto rican', 'australian', 'canadian',
      'ukrainian', 'romanian', 'portuguese', 'greek',
    ],
    relationship: [
      'step', 'stepsis', 'stepmom', 'stepdad', 'stepson', 'stepdaughter',
      'step-mom', 'step-dad', 'step-sister', 'step-brother', 'stepsister',
      'stepfather',
      'mom', 'dad', 'sister', 'brother', 'gf', 'girlfriend', 'wife',
      'husband', 'stranger', 'neighbor', 'boss', 'teacher', 'student',
      'babysitter', 'roommate', 'ex', 'friend', 'coworker', 'landlord',
      'couple', 'daughter', 'daddy',
      'maid', 'secretary', 'model', 'pornstar', 'nurse', 'doctor',
      'nanny', 'tutor', 'intern', 'escort', 'masseuse',
    ],
    acts: [
      'anal', 'oral', 'creampie', 'creampied', 'facial', 'dp', 'gangbang', 'threesome',
      'solo', 'masturbation', 'fingering', 'squirting', 'orgasm',
      'blowjob', 'handjob', 'footjob', 'deepthroat', 'rimming', 'bdsm',
      'bondage', 'roleplay', 'pov', 'missionary', 'doggy', 'cowgirl',
      'reverse cowgirl', 'rough', 'gentle', 'romantic', 'massage',
      'casting', 'interview', 'fuck', 'fucking', 'penetration',
      'lesbian', 'cuckold', 'orgy', 'interracial', 'bbc', 'bisexual',
      'double penetration', 'swallow', 'cum swap', 'hardcore',
      'submissive', 'compilation', 'striptease', 'strip', 'cosplay',
      'bukkake', 'bukakke',
      'riding', 'sucking', 'licking', 'choking', 'gagging', 'spanking',
      'pegging', 'fisting', 'titfuck', 'cumshot', 'piss',
      'seduce', 'cheating', 'taboo', 'caught', 'sharing', 'swap', 'bang',
    ],
    setting: [
      'hotel', 'motel', 'bedroom', 'bathroom', 'kitchen', 'office', 'outdoor',
      'car', 'public', 'beach', 'pool', 'shower', 'amateur', 'homemade',
      'studio', 'gym', 'garden', 'balcony', 'sauna', 'jacuzzi',
      'classroom', 'hospital', 'dungeon', 'yacht', 'camping', 'van',
      'dressing room', 'indoor', 'morning', 'webcam', 'cam',
      'behind the scenes',
      'school', 'party', 'couch', 'stairs', 'laundry', 'garage',
      'forest', 'park', 'spa', 'resort', 'bus', 'taxi', 'prison',
      'locker room',
    ],
    quality: ['4k', 'hd', '1080p', '720p', '480p', 'uhd', 'fhd', '8k', '2k', '60fps', 'vr', 'hdr'],
    performer: [], // Will be populated dynamically from performer names
  };

  static extractCategories(filename: string): VideoCategories {
    const normalizedFilename = filename
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const categories: VideoCategories = {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    };

    // Extract categories using pattern matching
    Object.entries(this.CATEGORY_PATTERNS).forEach(([type, patterns]) => {
      patterns.forEach((pattern) => {
        if (normalizedFilename.includes(pattern)) {
          const categoryArray = categories[type as keyof VideoCategories];
          if (categoryArray && !categoryArray.includes(pattern)) {
            categoryArray.push(pattern);
          }
        }
      });
    });

    // Extract potential performer names (capitalized words that might be names)
    const words = filename.split(/[^a-zA-Z]/).filter((word) => word.length > 2);
    words.forEach((word) => {
      if (
        word[0] === word[0].toUpperCase() &&
        !this.isCommonWord(word.toLowerCase()) &&
        word.length >= 3
      ) {
        const performerName = word.toLowerCase();
        if (
          !categories.performer.includes(performerName) &&
          !CORRUPT_PERFORMERS_SET.has(performerName)
        ) {
          categories.performer.push(performerName);
        }
      }
    });

    return categories;
  }

  /**
   * Extract categories from a video's directory path.
   * Splits path into segments and matches each against CATEGORY_PATTERNS.
   * Also detects performer names from capitalized multi-word segments.
   */
  static extractFromPath(filePath: string): VideoCategories {
    const categories: VideoCategories = {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    };

    // Get directory segments (exclude filename)
    const segments = filePath
      .replace(/\\/g, '/')
      .split('/')
      .slice(0, -1) // Remove filename
      .filter((s) => s.length > 0);

    for (const segment of segments) {
      const normalized = segment
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Match patterns in segment
      Object.entries(this.CATEGORY_PATTERNS).forEach(([type, patterns]) => {
        patterns.forEach((pattern) => {
          if (normalized.includes(pattern)) {
            const categoryArray = categories[type as keyof VideoCategories];
            if (categoryArray && !categoryArray.includes(pattern)) {
              categoryArray.push(pattern);
            }
          }
        });
      });

      // Detect performer names: multi-word segments with capitalized words
      // e.g., "Jane Doe" → "jane doe"
      const words = segment.split(/\s+/).filter((w) => w.length >= 2);
      if (
        words.length >= 2 &&
        words.every((w) => /^[A-Z]/.test(w)) &&
        !this.isCommonWord(words[0].toLowerCase())
      ) {
        const performerName = segment.trim().toLowerCase();
        if (
          !categories.performer.includes(performerName) &&
          !CORRUPT_PERFORMERS_SET.has(performerName)
        ) {
          categories.performer.push(performerName);
        }
      }
    }

    return categories;
  }

  /**
   * Combine filename and path extraction, deduplicating results.
   */
  static getSuggestions(
    filename: string,
    dirPath: string,
  ): VideoCategories {
    const fromFilename = this.extractCategories(filename);
    const fromPath = this.extractFromPath(dirPath);

    const merged: VideoCategories = {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    };

    for (const type of Object.keys(merged) as (keyof VideoCategories)[]) {
      const combined = [...(fromFilename[type] || []), ...(fromPath[type] || [])];
      merged[type] = [...new Set(combined)];
    }

    return merged;
  }

  private static isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'and', 'for', 'with', 'her', 'his', 'she', 'him',
      'best', 'hot', 'sex', 'fuck', 'porn', 'xxx', 'video', 'clip',
      'scene', 'new', 'old', 'performers', 'videos', 'clips',
    ];
    return commonWords.includes(word);
  }

  static categorizeByType(categories: VideoCategories): { [type: string]: string[] } {
    return {
      age: categories.age,
      physical: categories.physical,
      ethnicity: categories.ethnicity,
      relationship: categories.relationship,
      acts: categories.acts,
      setting: categories.setting,
      quality: categories.quality,
      performer: categories.performer,
    };
  }
}
