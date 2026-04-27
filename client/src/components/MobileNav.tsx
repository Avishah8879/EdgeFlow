import { useState } from "react"
import { Menu, Bookmark, User } from "lucide-react"
import { Link, useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ModeToggle } from "@/components/ModeToggle"
import { cn } from "@/lib/utils"
import type { UserTier } from "@/lib/auth"

type InternalNavItem = {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  external?: false
  requiredTier?: UserTier
}

type ExternalNavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  external: true
}

type NavItem = InternalNavItem | ExternalNavItem

export function MobileNav({
  navItems,
  isAuthenticated,
  isPremium,
  onLogout,
}: {
  navItems: NavItem[]
  isAuthenticated: boolean
  isPremium: boolean
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [location] = useLocation()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-2 mt-6">
          {/* Nav items */}
          {navItems.map((item) => {
            const Icon = item.icon

            if (item.external) {
              // External link
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <Button variant="ghost" className="w-full justify-start gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </a>
              )
            }

            // Internal link
            const isActive = location === item.path
            const isRestricted =
              item.requiredTier === "semi" && !isPremium

            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-2",
                    isRestricted && "opacity-50"
                  )}
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {isRestricted && (
                    <span className="ml-auto rounded-full border border-primary/50 px-1.5 text-[0.65rem] uppercase tracking-widest text-primary">
                      Pro
                    </span>
                  )}
                </Button>
              </Link>
            )
          })}

          {/* User links (authenticated only) */}
          {isAuthenticated && (
            <div className="mt-4 pt-4 border-t flex flex-col gap-2">
              <Link href="/profile">
                <Button
                  variant={location === "/profile" ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
                  onClick={() => setOpen(false)}
                >
                  <User className="h-4 w-4" />
                  Profile
                </Button>
              </Link>
              <Link href="/saved-results">
                <Button
                  variant={location === "/saved-results" ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
                  onClick={() => setOpen(false)}
                >
                  <Bookmark className="h-4 w-4" />
                  Saved Results
                </Button>
              </Link>
            </div>
          )}

          {/* Theme toggle */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ModeToggle />
          </div>

          {/* Auth */}
          <div className="mt-4 pt-4 border-t">
            {isAuthenticated ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onLogout()
                  setOpen(false)
                }}
              >
                Logout
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setOpen(false)}
                  >
                    Login
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button className="w-full" onClick={() => setOpen(false)}>
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
