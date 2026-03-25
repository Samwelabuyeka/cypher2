import { Link, Outlet, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Key, Wallet, Shield, Bell } from "lucide-react";

const settingsSections = [
  {
    id: "profile",
    label: "Profile",
    icon: User,
    href: "/settings/profile",
  },
  {
    id: "api-keys",
    label: "API Keys",
    icon: Key,
    href: "/settings/api-keys",
  },
  {
    id: "trading-accounts",
    label: "Trading Accounts",
    icon: Wallet,
    href: "/settings/trading-accounts",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    href: "/settings/security",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    href: "/settings/notifications",
  },
];

export default function SettingsLayout() {
  const location = useLocation();
  
  // Determine which tab is active based on the current path
  const activeSection = settingsSections.find(
    (section) => location.pathname.startsWith(section.href)
  )?.id || "profile";

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      <Separator className="mb-6" />

      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Sidebar Navigation for Desktop */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <nav className="space-y-1">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              
              return (
                <Link
                  key={section.id}
                  to={section.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Tabs Navigation for Mobile */}
        <div className="md:hidden">
          <Tabs value={activeSection} className="w-full">
            <TabsList className="w-full flex-wrap h-auto">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                
                return (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    asChild
                    className="flex-1 min-w-[120px]"
                  >
                    <Link to={section.href} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{section.label}</span>
                    </Link>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}