import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Audiobook, Ebook, Author } from '@/types/media';
import {
  User,
  ChevronRight,
  ChevronDown,
  Search,
  Headphones,
  BookOpen,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthorBrowserProps {
  audiobooks: Audiobook[];
  ebooks: Ebook[];
  onSelectAudiobook: (audiobook: Audiobook) => void;
  onSelectEbook: (ebook: Ebook) => void;
  className?: string;
}

export function AuthorBrowser({
  audiobooks,
  ebooks,
  onSelectAudiobook,
  onSelectEbook,
  className,
}: AuthorBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set());

  // Group items by author
  const authors = useMemo(() => {
    const authorMap = new Map<string, Author>();

    // Add audiobooks
    for (const audiobook of audiobooks) {
      const authorName = audiobook.author || 'Unknown Author';
      if (!authorMap.has(authorName)) {
        authorMap.set(authorName, {
          name: authorName,
          audiobooks: [],
          ebooks: [],
          totalItems: 0,
        });
      }
      const author = authorMap.get(authorName)!;
      author.audiobooks.push(audiobook);
      author.totalItems++;
    }

    // Add ebooks
    for (const ebook of ebooks) {
      const authorName = ebook.author || 'Unknown Author';
      if (!authorMap.has(authorName)) {
        authorMap.set(authorName, {
          name: authorName,
          audiobooks: [],
          ebooks: [],
          totalItems: 0,
        });
      }
      const author = authorMap.get(authorName)!;
      author.ebooks.push(ebook);
      author.totalItems++;
    }

    // Sort authors by name
    return Array.from(authorMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [audiobooks, ebooks]);

  // Filter authors by search query
  const filteredAuthors = useMemo(() => {
    if (!searchQuery.trim()) return authors;

    const query = searchQuery.toLowerCase();
    return authors.filter((author) => {
      // Match author name
      if (author.name.toLowerCase().includes(query)) return true;

      // Match book titles
      const hasMatchingAudiobook = author.audiobooks.some((ab) =>
        ab.title.toLowerCase().includes(query),
      );
      const hasMatchingEbook = author.ebooks.some((eb) =>
        eb.title.toLowerCase().includes(query),
      );

      return hasMatchingAudiobook || hasMatchingEbook;
    });
  }, [authors, searchQuery]);

  const toggleAuthor = (authorName: string) => {
    setExpandedAuthors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(authorName)) {
        newSet.delete(authorName);
      } else {
        newSet.add(authorName);
      }
      return newSet;
    });
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5" />
          Browse by Author
        </CardTitle>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search authors or titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-1">
            {filteredAuthors.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? 'No results found' : 'No authors yet'}
              </p>
            ) : (
              filteredAuthors.map((author) => (
                <AuthorEntry
                  key={author.name}
                  author={author}
                  isExpanded={expandedAuthors.has(author.name)}
                  onToggle={() => toggleAuthor(author.name)}
                  onSelectAudiobook={onSelectAudiobook}
                  onSelectEbook={onSelectEbook}
                  formatDuration={formatDuration}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface AuthorEntryProps {
  author: Author;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectAudiobook: (audiobook: Audiobook) => void;
  onSelectEbook: (ebook: Ebook) => void;
  formatDuration: (seconds: number) => string;
}

function AuthorEntry({
  author,
  isExpanded,
  onToggle,
  onSelectAudiobook,
  onSelectEbook,
  formatDuration,
}: AuthorEntryProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Author header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium flex-1">{author.name}</span>
        <div className="flex items-center gap-2">
          {author.audiobooks.length > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Headphones className="h-3 w-3" />
              {author.audiobooks.length}
            </Badge>
          )}
          {author.ebooks.length > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <BookOpen className="h-3 w-3" />
              {author.ebooks.length}
            </Badge>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t bg-muted/30">
          {/* Audiobooks section */}
          {author.audiobooks.length > 0 && (
            <div className="p-2">
              <h4 className="text-xs font-medium text-muted-foreground px-2 py-1 flex items-center gap-1">
                <Headphones className="h-3 w-3" />
                Audiobooks
              </h4>
              <div className="space-y-1">
                {author.audiobooks.map((audiobook) => (
                  <button
                    key={audiobook.id}
                    onClick={() => onSelectAudiobook(audiobook)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm truncate">{audiobook.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDuration(audiobook.totalDuration)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ebooks section */}
          {author.ebooks.length > 0 && (
            <div className="p-2">
              <h4 className="text-xs font-medium text-muted-foreground px-2 py-1 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                Ebooks
              </h4>
              <div className="space-y-1">
                {author.ebooks.map((ebook) => (
                  <button
                    key={ebook.id}
                    onClick={() => onSelectEbook(ebook)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm truncate">{ebook.title}</span>
                    <div className="flex gap-1 ml-2">
                      {ebook.files.map((f) => (
                        <Badge
                          key={f.format}
                          variant="outline"
                          className="text-[10px] px-1 py-0"
                        >
                          {f.format.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
