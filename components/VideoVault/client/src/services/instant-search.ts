import { Index, Document } from 'flexsearch';
import { Video } from '../types/video';

export interface SearchableVideo {
  id: string;
  filename: string;
  displayName: string;
  path: string;
  categories: string[];
  customCategories: string[];
  tags: string[];
  metadata: {
    duration?: number;
    width?: number;
    height?: number;
  };
  rootKey?: string;
}

export interface SearchResult {
  video: Video;
  score: number;
  matchedFields: string[];
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  fuzzy?: boolean;
  bool?: 'and' | 'or';
  rootKey?: string;
}

export class InstantSearchService {
  private filenameIndex: Index;
  private displayNameIndex: Index;
  private pathIndex: Index;
  private categoryIndex: Index;
  private tagIndex: Index;
  private videoMap = new Map<string, Video>();
  private rootIndexes = new Map<string, {
    filename: Index;
    displayName: Index;
    path: Index;
    category: Index;
    tag: Index;
    videos: Map<string, Video>;
  }>();

  constructor() {
    // Global indexes (across all roots)
    this.filenameIndex = new Index({
      preset: 'performance',
      tokenize: 'forward',
      resolution: 3
    });

    this.displayNameIndex = new Index({
      preset: 'performance',
      tokenize: 'full',
      resolution: 3
    });

    this.pathIndex = new Index({
      preset: 'performance',
      tokenize: 'forward',
      resolution: 3
    });

    this.categoryIndex = new Index({
      preset: 'performance',
      tokenize: 'strict',
      resolution: 1
    });

    this.tagIndex = new Index({
      preset: 'performance',
      tokenize: 'strict',
      resolution: 1
    });
  }

  private createRootIndex(rootKey: string) {
    if (!this.rootIndexes.has(rootKey)) {
      this.rootIndexes.set(rootKey, {
        filename: new Index({
          preset: 'performance',
          tokenize: 'forward',
          resolution: 3
        }),
        displayName: new Index({
          preset: 'performance',
          tokenize: 'full',
          resolution: 3
        }),
        path: new Index({
          preset: 'performance',
          tokenize: 'forward',
          resolution: 3
        }),
        category: new Index({
          preset: 'performance',
          tokenize: 'strict',
          resolution: 1
        }),
        tag: new Index({
          preset: 'performance',
          tokenize: 'strict',
          resolution: 1
        }),
        videos: new Map()
      });
    }
  }

  addVideo(video: Video): void {
    const searchableVideo = this.convertToSearchable(video);
    
    // Add to global indexes
    this.filenameIndex.add(video.id, searchableVideo.filename);
    this.displayNameIndex.add(video.id, searchableVideo.displayName);
    this.pathIndex.add(video.id, searchableVideo.path);
    this.categoryIndex.add(video.id, searchableVideo.categories.join(' '));
    this.tagIndex.add(video.id, searchableVideo.tags.join(' '));
    this.videoMap.set(video.id, video);

    // Add to root-specific indexes
    if (video.rootKey) {
      this.createRootIndex(video.rootKey);
      const rootIndex = this.rootIndexes.get(video.rootKey)!;
      
      rootIndex.filename.add(video.id, searchableVideo.filename);
      rootIndex.displayName.add(video.id, searchableVideo.displayName);
      rootIndex.path.add(video.id, searchableVideo.path);
      rootIndex.category.add(video.id, searchableVideo.categories.join(' '));
      rootIndex.tag.add(video.id, searchableVideo.tags.join(' '));
      rootIndex.videos.set(video.id, video);
    }
  }

  addVideos(videos: Video[]): void {
    videos.forEach(video => this.addVideo(video));
  }

  removeVideo(videoId: string): void {
    const video = this.videoMap.get(videoId);
    
    // Remove from global indexes
    this.filenameIndex.remove(videoId);
    this.displayNameIndex.remove(videoId);
    this.pathIndex.remove(videoId);
    this.categoryIndex.remove(videoId);
    this.tagIndex.remove(videoId);
    this.videoMap.delete(videoId);

    // Remove from root-specific indexes
    if (video?.rootKey) {
      const rootIndex = this.rootIndexes.get(video.rootKey);
      if (rootIndex) {
        rootIndex.filename.remove(videoId);
        rootIndex.displayName.remove(videoId);
        rootIndex.path.remove(videoId);
        rootIndex.category.remove(videoId);
        rootIndex.tag.remove(videoId);
        rootIndex.videos.delete(videoId);
      }
    }
  }

  updateVideo(video: Video): void {
    this.removeVideo(video.id);
    this.addVideo(video);
  }

  clearRoot(rootKey: string): void {
    const rootIndex = this.rootIndexes.get(rootKey);
    if (!rootIndex) return;

    // Remove all videos from this root from global indexes
    for (const videoId of Array.from(rootIndex.videos.keys())) {
      this.filenameIndex.remove(videoId);
      this.displayNameIndex.remove(videoId);
      this.pathIndex.remove(videoId);
      this.categoryIndex.remove(videoId);
      this.tagIndex.remove(videoId);
      this.videoMap.delete(videoId);
    }

    // Clear the root index
    this.rootIndexes.delete(rootKey);
  }

  clearAll(): void {
    // Clear global indexes
    this.filenameIndex = new Index({
      preset: 'performance',
      tokenize: 'forward',
      resolution: 3
    });

    this.displayNameIndex = new Index({
      preset: 'performance',
      tokenize: 'full',
      resolution: 3
    });

    this.pathIndex = new Index({
      preset: 'performance',
      tokenize: 'forward',
      resolution: 3
    });

    this.categoryIndex = new Index({
      preset: 'performance',
      tokenize: 'strict',
      resolution: 1
    });

    this.tagIndex = new Index({
      preset: 'performance',
      tokenize: 'strict',
      resolution: 1
    });

    this.videoMap.clear();
    this.rootIndexes.clear();
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const {
      limit = 100,
      threshold = 0.3,
      fuzzy = true,
      bool = 'or',
      rootKey
    } = options;

    const searchQuery = query.trim().toLowerCase();
    const results = new Map<string, SearchResult>();

    // Choose which indexes to search
    const indexes = rootKey && this.rootIndexes.has(rootKey) 
      ? this.rootIndexes.get(rootKey)!
      : {
          filename: this.filenameIndex,
          displayName: this.displayNameIndex,
          path: this.pathIndex,
          category: this.categoryIndex,
          tag: this.tagIndex,
          videos: this.videoMap
        };

    // Search each field with different weightings
    const searchConfigs = [
      { index: indexes.filename, field: 'filename', weight: 1.0 },
      { index: indexes.displayName, field: 'displayName', weight: 0.9 },
      { index: indexes.path, field: 'path', weight: 0.6 },
      { index: indexes.category, field: 'categories', weight: 0.8 },
      { index: indexes.tag, field: 'tags', weight: 0.7 }
    ];

    for (const { index, field, weight } of searchConfigs) {
      try {
        const searchResults = index.search(searchQuery, limit * 2);

        for (const videoId of searchResults) {
          if (typeof videoId === 'string') {
            const video = indexes.videos.get(videoId);
            if (!video) continue;

            const existing = results.get(videoId);
            const fieldScore = weight;

            if (existing) {
              existing.score += fieldScore;
              existing.matchedFields.push(field);
            } else {
              results.set(videoId, {
                video,
                score: fieldScore,
                matchedFields: [field]
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Search error in ${field} index:`, error);
      }
    }

    // Convert to array and sort by score
    const sortedResults = Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // If using 'and' boolean, filter to only results that match multiple fields
    if (bool === 'and' && searchQuery.split(' ').length > 1) {
      return sortedResults.filter(result => result.matchedFields.length > 1);
    }

    return sortedResults;
  }

  getStats(): {
    totalVideos: number;
    rootStats: Record<string, number>;
    indexSizes: {
      filename: number;
      displayName: number;
      path: number;
      category: number;
      tag: number;
    };
  } {
    const rootStats: Record<string, number> = {};
    for (const [rootKey, rootIndex] of Array.from(this.rootIndexes.entries())) {
      rootStats[rootKey] = rootIndex.videos.size;
    }

    return {
      totalVideos: this.videoMap.size,
      rootStats,
      indexSizes: {
        filename: this.videoMap.size,
        displayName: this.videoMap.size,
        path: this.videoMap.size,
        category: this.videoMap.size,
        tag: this.videoMap.size
      }
    };
  }

  private convertToSearchable(video: Video): SearchableVideo {
    // Extract all category values
    const categories: string[] = [];
    if (video.categories) {
      Object.values(video.categories).forEach(categoryList => {
        if (Array.isArray(categoryList)) {
          categories.push(...categoryList);
        }
      });
    }

    // Extract custom category values
    const customCategories: string[] = [];
    if (video.customCategories) {
      Object.values(video.customCategories).forEach(categoryList => {
        if (Array.isArray(categoryList)) {
          customCategories.push(...categoryList);
        }
      });
    }

    // Combine all categories as tags for searching
    const tags = [...categories, ...customCategories];

    return {
      id: video.id,
      filename: video.filename || '',
      displayName: video.displayName || '',
      path: video.path || '',
      categories,
      customCategories,
      tags,
      metadata: {
        duration: video.metadata?.duration,
        width: video.metadata?.width,
        height: video.metadata?.height
      },
      rootKey: video.rootKey
    };
  }

  // Quick suggest for autocomplete
  suggest(query: string, options: { limit?: number; rootKey?: string } = {}): string[] {
    if (!query || query.trim().length < 1) {
      return [];
    }

    const { limit = 10, rootKey } = options;
    const searchQuery = query.trim().toLowerCase();

    // Choose which indexes to search
    const indexes = rootKey && this.rootIndexes.has(rootKey) 
      ? this.rootIndexes.get(rootKey)!
      : {
          filename: this.filenameIndex,
          displayName: this.displayNameIndex,
          category: this.categoryIndex,
          tag: this.tagIndex
        };

    const suggestions = new Set<string>();

    try {
      // Search filename and display name for partial matches
      const filenameResults = indexes.filename.search(searchQuery, { limit });
      const displayNameResults = indexes.displayName.search(searchQuery, { limit });

      for (const videoId of [...filenameResults, ...displayNameResults]) {
        if (typeof videoId === 'string') {
          const video = rootKey && this.rootIndexes.has(rootKey)
            ? this.rootIndexes.get(rootKey)!.videos.get(videoId)
            : this.videoMap.get(videoId);
          
          if (video) {
            // Add filename words that start with query
            const filenameWords = video.filename.toLowerCase().split(/[^a-z0-9]+/);
            const displayWords = video.displayName.toLowerCase().split(/[^a-z0-9]+/);
            
            for (const word of [...filenameWords, ...displayWords]) {
              if (word.startsWith(searchQuery) && word.length > searchQuery.length) {
                suggestions.add(word);
              }
            }
          }
        }
      }

      // Search categories and tags for exact matches
      const categoryResults = indexes.category.search(searchQuery, { limit });
      const tagResults = indexes.tag.search(searchQuery, { limit });

      for (const videoId of [...categoryResults, ...tagResults]) {
        if (typeof videoId === 'string') {
          const video = rootKey && this.rootIndexes.has(rootKey)
            ? this.rootIndexes.get(rootKey)!.videos.get(videoId)
            : this.videoMap.get(videoId);
          
          if (video) {
            const searchableVideo = this.convertToSearchable(video);
            for (const tag of searchableVideo.tags) {
              if (tag.toLowerCase().includes(searchQuery)) {
                suggestions.add(tag);
              }
            }
          }
        }
      }
      // Fallback: if suggestions are still scarce, scan all videos for substring matches
      if (suggestions.size < limit) {
        const videosIterable = rootKey && this.rootIndexes.has(rootKey)
          ? Array.from(this.rootIndexes.get(rootKey)!.videos.values())
          : Array.from(this.videoMap.values());
        for (const video of videosIterable) {
          const sv = this.convertToSearchable(video);
          for (const tag of sv.tags) {
            if (tag.toLowerCase().includes(searchQuery)) {
              suggestions.add(tag);
              if (suggestions.size >= limit) break;
            }
          }
          if (suggestions.size >= limit) break;
        }
      }
    } catch (error) {
      console.warn('Suggestion error:', error);
    }

    return Array.from(suggestions).slice(0, limit);
  }
}

// Global instance
export const instantSearch = new InstantSearchService();
