// --------------------------------------------------------------------------------------
// App Layout (Logged In Pages)
// --------------------------------------------------------------------------------------
// This file defines the layout for all application routes that require the user to be authenticated (logged in).
// Typical pages using this layout include dashboards, user profile, app content, and any protected resources.
// Structure:
//   - Persistent navigation sidebar (with responsive drawer for mobile)
//   - Header with user avatar, balance display, and secondary navigation
//   - Main content area for app routes (via <Outlet />)
//   - Handles redirecting logged out users to the sign-in page
// To extend: update the navigation, header, or main content area as needed for your app's logged-in experience.

import { UserIcon } from "@/components/shared/UserIcon";
import { SecondaryNavigation } from "@/components/app/nav";
import { NavDrawer } from "@/components/shared/NavDrawer";
import { Outlet, redirect, useOutletContext, Link } from "react-router";
import { Home, TrendingUp, PieChart, Wallet, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import type { RootOutletContext } from "../root";
import type { Route } from "./+types/_app";

export const loader = async ({ context }: Route.LoaderArgs) => {
  const { session, gadgetConfig } = context;

  const userId = session?.get("user");
  const user = userId ? await context.api.user.findOne(userId) : undefined;

  if (!user) {
    return redirect(gadgetConfig.authentication!.signInPath);
  }

  // Fetch user's wallets for balance display
  const wallets = await context.api.wallet.findMany({
    filter: {
      userId: {
        equals: userId,
      },
    },
    select: {
      id: true,
      currency: true,
      balance: true,
      availableBalance: true,
    },
  });

  // Find CYP and USD wallets
  const cypWallet = wallets.find((w) => w.currency === "CYP");
  const usdWallet = wallets.find((w) => w.currency === "USD");

  return {
    user,
    cypBalance: cypWallet?.availableBalance ?? 0,
    usdBalance: usdWallet?.availableBalance ?? 0,
  };
};

export type AuthOutletContext = RootOutletContext & {
  user: any;
};

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Trade", href: "/trade", icon: TrendingUp },
  { name: "Portfolio", href: "/portfolio", icon: PieChart },
  { name: "Wallet", href: "/wallet", icon: Wallet },
  { name: "Settings", href: "/settings", icon: Settings },
];

function DesktopNavigation() {
  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-slate-950 border-r border-slate-800">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-16 px-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white">CYPHER</h1>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigationItems.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors group"
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function MobileNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-slate-950 border-slate-800">
        <div className="flex flex-col h-full">
          <div className="flex items-center h-16 px-6 border-b border-slate-800">
            <h1 className="text-xl font-bold text-white">CYPHER</h1>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigationItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ({ loaderData }: Route.ComponentProps) {
  const rootOutletContext = useOutletContext<RootOutletContext>();

  const { user, cypBalance, usdBalance } = loaderData;

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <DesktopNavigation />

      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b bg-background z-10 w-full">
          <MobileNavigation />
          
          <div className="ml-auto flex items-center gap-6">
            {/* Balance Display */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">CYP</span>
                <span className="font-semibold">{cypBalance.toFixed(2)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">USD</span>
                <span className="font-semibold">${usdBalance.toFixed(2)}</span>
              </div>
            </div>

            {/* User Menu */}
            <SecondaryNavigation
              icon={
                <div className="flex items-center gap-2">
                  <UserIcon user={user} />
                  <span className="text-sm font-medium hidden sm:inline">
                    {user.firstName ?? user.email}
                  </span>
                </div>
              }
            />
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto overflow-x-auto">
          <div className="mx-auto px-6 py-8 min-w-max">
            <Outlet context={{ ...rootOutletContext, user } as AuthOutletContext} />
          </div>
        </main>
      </div>
    </div>
  );
}