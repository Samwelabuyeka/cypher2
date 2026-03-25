import { useUser, useSession, useAction } from "@gadgetinc/react";
import { api } from "../api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, Smartphone, Monitor, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export default function SecuritySettings() {
  const user = useUser();
  const session = useSession();
  const [{ fetching: signingOut }, signOut] = useAction(api.user.signOut);

  // Mock login history data (placeholder for future implementation)
  const loginHistory = [
    {
      id: "1",
      timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Chrome on Windows",
      success: true,
    },
    {
      id: "2",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Safari on iPhone",
      success: true,
    },
    {
      id: "3",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Chrome on Windows",
      success: true,
    },
    {
      id: "4",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Chrome on MacOS",
      success: true,
    },
    {
      id: "5",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Firefox on Windows",
      success: true,
    },
    {
      id: "6",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 7 days ago
      ip: "192.168.1.101",
      location: "Boston, USA",
      device: "Chrome on Windows",
      success: false,
    },
    {
      id: "7",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8), // 8 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Chrome on Windows",
      success: true,
    },
    {
      id: "8",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Safari on iPad",
      success: true,
    },
    {
      id: "9",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12), // 12 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Chrome on Windows",
      success: true,
    },
    {
      id: "10",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14), // 14 days ago
      ip: "192.168.1.100",
      location: "New York, USA",
      device: "Edge on Windows",
      success: true,
    },
  ];

  const handleSignOutAllSessions = async () => {
    try {
      await signOut({ id: user?.id });
      toast.success("All other sessions have been signed out");
    } catch (error) {
      toast.error("Failed to sign out other sessions");
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account security and monitor access
        </p>
      </div>

      <Separator />

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Status: Not Enabled</p>
              <p className="text-sm text-muted-foreground">
                Protect your account with two-factor authentication using an authenticator app
              </p>
            </div>
            <Button variant="outline" disabled>
              Enable 2FA
              <span className="ml-2 text-xs text-muted-foreground">(Coming Soon)</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Manage devices where you're currently signed in
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Current Session</p>
                <Badge variant="secondary">Active Now</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Session ID: {session?.id?.substring(0, 16)}...
              </p>
              <p className="text-sm text-muted-foreground">
                Last activity: Just now
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>

          <div className="pt-4 border-t">
            <Button 
              variant="destructive" 
              onClick={handleSignOutAllSessions}
              disabled={signingOut}
            >
              {signingOut ? "Signing out..." : "Sign Out All Other Sessions"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This will sign you out from all other devices except this one
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Login History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Login History</CardTitle>
              <CardDescription>
                Review recent sign-in activity on your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loginHistory.map((login) => (
              <div
                key={login.id}
                className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{login.device}</p>
                    {login.success ? (
                      <Badge variant="secondary" className="text-xs">
                        Success
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        Failed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {login.location} • {login.ip}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(login.timestamp)}
                  </p>
                </div>
                {login.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-1" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive mt-1" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Security Recommendations</CardTitle>
              <CardDescription>
                Best practices to keep your account secure
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Use a strong, unique password</p>
                <p className="text-sm text-muted-foreground">
                  Your password should be at least 12 characters long and include a mix of letters, numbers, and symbols
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Enable two-factor authentication</p>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security by requiring a second form of verification (coming soon)
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Review your login history regularly</p>
                <p className="text-sm text-muted-foreground">
                  Check for any suspicious activity and sign out sessions you don't recognize
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Keep your email address up to date</p>
                <p className="text-sm text-muted-foreground">
                  This ensures you receive important security notifications
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Never share your password</p>
                <p className="text-sm text-muted-foreground">
                  Cypher staff will never ask for your password
                </p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}