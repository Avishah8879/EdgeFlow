import { Card } from "@/components/ui/card";
import { BookOpen, Video, FileText, Award } from "lucide-react";

export default function Learn() {
  const categories = [
    { id: "1", title: "Getting Started", icon: BookOpen, articles: 12, description: "Learn the basics of investing" },
    { id: "2", title: "Video Tutorials", icon: Video, articles: 24, description: "Watch and learn at your pace" },
    { id: "3", title: "Advanced Strategies", icon: FileText, articles: 18, description: "Deep dive into investing concepts" },
    { id: "4", title: "Certifications", icon: Award, articles: 6, description: "Earn investing credentials" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Learn to Invest</h1>
          <p className="text-muted-foreground mt-2">Educational resources to help you make better investment decisions</p>
        </div>

        <section>
          <h2 className="text-xl font-semibold mb-4">Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {categories.map((category) => (
              <Card key={category.id} className="p-6 hover-elevate cursor-pointer" data-testid={`category-${category.id}`}>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <category.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{category.title}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{category.description}</p>
                    <p className="text-xs text-muted-foreground">{category.articles} articles</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
