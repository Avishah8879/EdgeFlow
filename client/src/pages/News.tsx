import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Newspaper,
} from "lucide-react";
import { useNews, type NewsArticle } from "@/hooks/use-news";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";

const ARTICLES_PER_PAGE = 20;

function formatRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return isoDate;
  }
}

function formatLastUpdated(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  } catch {
    return "";
  }
}

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <article className="break-inside-avoid mb-6">
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors">
          {article.title}
        </h3>
      </a>
      {article.desc && article.desc !== "No summary available" && (
        <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
          {article.desc}
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        {formatRelativeTime(article.date)} — {article.source}
      </p>
    </article>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = useMemo(() => {
    const result: (number | "ellipsis")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) result.push(i);
    } else {
      result.push(1);

      if (currentPage > 3) result.push("ellipsis");

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) result.push(i);

      if (currentPage < totalPages - 2) result.push("ellipsis");

      result.push(totalPages);
    }

    return result;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {pages.map((page, idx) =>
        page === "ellipsis" ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
            ...
          </span>
        ) : (
          <Button
            key={page}
            variant={page === currentPage ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(page)}
          >
            {page}
          </Button>
        )
      )}

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function News() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data, isLoading, error, isFetching } = useNews(ARTICLES_PER_PAGE, page);

  // Extract unique sources from articles
  const sources = useMemo(() => {
    if (!data?.articles) return [];
    const uniqueSources = new Set(data.articles.map((a) => a.source));
    return Array.from(uniqueSources).sort();
  }, [data?.articles]);

  // Filter articles by search query and source
  const filteredArticles = useMemo(() => {
    if (!data?.articles) return [];

    return data.articles.filter((article) => {
      const matchesSearch =
        !searchQuery ||
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.desc?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSource =
        sourceFilter === "all" || article.source === sourceFilter;

      return matchesSearch && matchesSource;
    });
  }, [data?.articles, searchQuery, sourceFilter]);

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Don't reset page for search since it's client-side filtering
  };

  const handleSourceChange = (value: string) => {
    setSourceFilter(value);
    // Don't reset page for source filter since it's client-side filtering
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <SEO
        title={PAGE_SEO.news.title}
        description={PAGE_SEO.news.description}
        canonical="/news"
      />
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Newspaper className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Market News</h1>
              <p className="text-sm text-muted-foreground">
                Latest updates from financial markets
              </p>
            </div>
          </div>

          {data?.fetched_at && (
            <Badge variant="secondary" className="flex items-center gap-1.5 w-fit">
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Updated {formatLastUpdated(data.fetched_at)}
            </Badge>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={sourceFilter} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              Failed to load news. Please try again later.
            </p>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center py-20">
            <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery || sourceFilter !== "all"
                ? "No articles match your filters"
                : "No news articles available"}
            </p>
          </div>
        ) : (
          <>
            {/* Articles Grid - Masonry Layout */}
            <div className="columns-1 md:columns-2 lg:columns-3 gap-6">
              {filteredArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>

            {/* Pagination */}
            {data && data.total_pages > 1 && (
              <div className="pt-6 border-t">
                <Pagination
                  currentPage={data.page}
                  totalPages={data.total_pages}
                  onPageChange={handlePageChange}
                />
                <p className="text-center text-xs text-muted-foreground mt-3">
                  Showing {(data.page - 1) * ARTICLES_PER_PAGE + 1}–
                  {Math.min(data.page * ARTICLES_PER_PAGE, data.total_count)} of{" "}
                  {data.total_count} articles
                </p>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </>
  );
}
