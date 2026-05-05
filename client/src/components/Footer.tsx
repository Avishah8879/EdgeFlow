import { Link } from "wouter";
import { EquityProLogo } from "@/components/EquityProLogo";
import { getEquityProAiUrl } from "@/lib/external-links";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export default function Footer() {
  const footerSections: { title: string; links: FooterLink[] }[] = [
    {
      title: "Products",
      links: [
        { label: "Stocks", href: "/stocks" },
        { label: "Indices", href: "/indices" },
      ],
    },
    {
      title: "Tools",
      links: [
        { label: "Expert Screener", href: "/screener" },
        { label: "EquityPro AI ↗", href: getEquityProAiUrl(), external: true },
        { label: "Portfolio", href: "/portfolio" },
      ],
    },
    {
      title: "Resources",
      links: [
        // { label: "Learn", href: "/learn" },
        { label: "News", href: "/news" },
        { label: "Blog", href: "/blog" },
        { label: "Market Reports", href: "/market-reports" },
        // { label: "Help Center", href: "/learn" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About Us", href: "#" },
        // { label: "Careers", href: "#" },
        { label: "Contact", href: "#" },
        { label: "Privacy Policy", href: "/privacy" },
      ],
    },
  ];

  return (
    <footer className="relative z-10 mt-16 border-t border-border bg-card text-foreground">
      <div className="mx-auto w-full px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link href="/">
              <EquityProLogo size="lg" className="cursor-pointer" />
            </Link>
            <p className="text-sm text-muted-foreground mt-4">
              For the people.
            </p>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold mb-4 text-foreground">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href}>
                        <span className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                          {link.label}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 EquityPro. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="#">
              <span className="hover:text-primary transition-colors cursor-pointer">
                Terms
              </span>
            </Link>
            <Link href="/privacy">
              <span className="hover:text-primary transition-colors cursor-pointer">
                Privacy
              </span>
            </Link>
            <Link href="#">
              <span className="hover:text-primary transition-colors cursor-pointer">
                Disclaimer
              </span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
