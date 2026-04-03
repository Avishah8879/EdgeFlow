import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Calendar, Clock, ChevronRight, TrendingUp } from "lucide-react";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";

interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
}

const blogPosts: BlogPost[] = [
  {
    slug: "advanced-strategies",
    title: "The Search for Alpha: A Complete Guide to Strategy Development",
    description: "Learn how institutional traders generate alpha and how you can apply the same quantitative approach using Tiphub's strategy backtesting engine.",
    date: "2025-01-15",
    readTime: "8 min read",
    category: "Strategy",
    icon: TrendingUp,
  },
];

export default function Blog() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={PAGE_SEO.blog.title}
        description={PAGE_SEO.blog.description}
        canonical="/blog"
      />
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-3">Blog</h1>
          <p className="text-lg text-muted-foreground">
            Insights, guides, and strategies for smarter trading
          </p>
        </header>

        {/* Posts List */}
        <div className="space-y-6">
          {blogPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <Card className="p-6 hover-elevate cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3 shrink-0">
                    <post.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span className="bg-accent px-2 py-0.5 rounded">{post.category}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(post.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readTime}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors flex items-center gap-2">
                      {post.title}
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </h2>
                    <p className="text-muted-foreground line-clamp-2">
                      {post.description}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Empty state for future */}
        {blogPosts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No posts yet. Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}
