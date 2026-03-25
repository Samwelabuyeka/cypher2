import { useState } from "react";
import { useFindMany, useAction } from "@gadgetinc/react";
import { api } from "../api";
import { AutoTable } from "@/components/auto";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { Copy, MoreVertical, Plus, Calendar as CalendarIcon, Eye, Key, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const PERMISSION_OPTIONS = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "trade", label: "Trade" },
  { value: "withdraw", label: "Withdraw" },
];

export default function ApiKeysPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [fullApiKey, setFullApiKey] = useState("");
  const [selectedKey, setSelectedKey] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Form state
  const [name, setName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>();
  const [allowedIps, setAllowedIps] = useState("");

  // Fetch API keys
  const filter = statusFilter === "all" 
    ? {} 
    : { isActive: { equals: statusFilter === "active" } };

  const [{ data: apiKeys, fetching, error }, refetch] = useFindMany(api.apiKey, {
    filter,
    select: {
      id: true,
      name: true,
      keyPreview: true,
      permissions: true,
      isActive: true,
      lastUsedAt: true,
      usageCount: true,
      createdAt: true,
      lastUsedIp: true,
      expiresAt: true,
      allowedIps: true,
    },
    sort: { createdAt: "Descending" },
  });

  // Actions
  const [{ fetching: creating }, createApiKey] = useAction(api.apiKey.create);
  const [{ fetching: updating }, updateApiKey] = useAction(api.apiKey.update);
  const [{ fetching: deleting }, deleteApiKey] = useAction(api.apiKey.delete);

  const generateApiKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "cypher_";
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleCreateApiKey = async () => {
    if (!name.trim()) {
      toast.error("Please provide a name for the API key");
      return;
    }

    const generatedKey = generateApiKey();
    const keyPreview = generatedKey.substring(0, 12) + "..." + generatedKey.substring(generatedKey.length - 4);

    // Parse allowed IPs
    const ipsArray = allowedIps
      .split(",")
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);

    try {
      await createApiKey({
        name: name.trim(),
        keyHash: generatedKey, // In production, this should be hashed
        keyPreview,
        permissions: selectedPermissions,
        expiresAt: expiresAt?.toISOString(),
        allowedIps: ipsArray.length > 0 ? ipsArray : null,
      });

      setFullApiKey(generatedKey);
      setCreateDialogOpen(false);
      setSuccessDialogOpen(true);
      
      // Reset form
      setName("");
      setSelectedPermissions([]);
      setExpiresAt(undefined);
      setAllowedIps("");

      // Refetch the list
      void refetch();
      
      toast.success("API key created successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to create API key");
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      await updateApiKey({ id: keyId, isActive: false });
      void refetch();
      toast.success("API key revoked");
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke API key");
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteApiKey({ id: keyId });
      void refetch();
      toast.success("API key deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete API key");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">API Keys</h1>
            <p className="text-muted-foreground mt-1">
              Manage your API keys for programmatic access
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <Label htmlFor="status-filter">Filter by status:</Label>
          <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
            <SelectTrigger id="status-filter" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Keys</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="inactive">Inactive Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-4 text-destructive">
            Error loading API keys: {error.message}
          </div>
        )}

        <AutoTable
          model={api.apiKey}
          columns={[
            "name",
            {
              header: "Key",
              render: ({ record }) => (
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {record.keyPreview}
                </code>
              ),
            },
            {
              header: "Permissions",
              render: ({ record }) => (
                <div className="flex flex-wrap gap-1">
                  {(record.permissions as string[] || []).map((perm: string) => (
                    <Badge key={perm} variant="secondary" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                  {(!record.permissions || (record.permissions as string[]).length === 0) && (
                    <span className="text-muted-foreground text-xs">None</span>
                  )}
                </div>
              ),
            },
            {
              header: "Status",
              render: ({ record }) => (
                <Badge variant={record.isActive ? "default" : "secondary"}>
                  {record.isActive ? "Active" : "Inactive"}
                </Badge>
              ),
            },
            {
              header: "Usage",
              render: ({ record }) => (
                <span className="text-sm">{record.usageCount || 0} calls</span>
              ),
            },
            {
              header: "Last Used",
              render: ({ record }) => (
                <span className="text-sm">
                  {record.lastUsedAt
                    ? format(new Date(record.lastUsedAt), "MMM d, yyyy HH:mm")
                    : "Never"}
                </span>
              ),
            },
            {
              header: "Created",
              render: ({ record }) => (
                <span className="text-sm">
                  {format(new Date(record.createdAt), "MMM d, yyyy")}
                </span>
              ),
            },
            {
              header: "Actions",
              render: ({ record }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedKey(record);
                        setDetailsDialogOpen(true);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    {record.isActive && (
                      <DropdownMenuItem
                        onClick={() => handleRevokeKey(record.id)}
                        disabled={updating}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Revoke
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleDeleteKey(record.id)}
                      disabled={deleting}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
        />
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My API Key"
              />
            </div>

            <div className="grid gap-2">
              <Label>Permissions</Label>
              <div className="space-y-2">
                {PERMISSION_OPTIONS.map((perm) => (
                  <div key={perm.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={perm.value}
                      checked={selectedPermissions.includes(perm.value)}
                      onCheckedChange={() => togglePermission(perm.value)}
                    />
                    <Label
                      htmlFor={perm.value}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {perm.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expiresAt">Expires At (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !expiresAt && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expiresAt ? format(expiresAt, "PPP") : "No expiration"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expiresAt}
                    onSelect={setExpiresAt}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="allowedIps">
                Allowed IP Addresses (optional)
              </Label>
              <Textarea
                id="allowedIps"
                value={allowedIps}
                onChange={(e) => setAllowedIps(e.target.value)}
                placeholder="192.168.1.1, 10.0.0.1"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of IP addresses. Leave empty to allow all IPs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateApiKey} disabled={creating}>
              {creating ? "Creating..." : "Create API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog with Full Key */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              <span className="text-amber-600 font-semibold">Important:</span> This is the only time
              you'll see this key. Make sure to copy it now.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Your API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={fullApiKey}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(fullApiKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-md bg-amber-50 dark:bg-amber-950 p-4 text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                Security Warning
              </p>
              <p className="text-amber-800 dark:text-amber-200 mt-1">
                Store this key securely. Anyone with this key can access your account
                with the permissions you've granted. If you lose this key, you'll need to
                create a new one.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSuccessDialogOpen(false)}>
              I've Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>API Key Details</DialogTitle>
          </DialogHeader>
          {selectedKey && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Name:</Label>
                <div className="col-span-2">{selectedKey.name}</div>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Key Preview:</Label>
                <div className="col-span-2">
                  <code className="rounded bg-muted px-2 py-1 text-xs">
                    {selectedKey.keyPreview}
                  </code>
                </div>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Status:</Label>
                <div className="col-span-2">
                  <Badge variant={selectedKey.isActive ? "default" : "secondary"}>
                    {selectedKey.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Permissions:</Label>
                <div className="col-span-2 flex flex-wrap gap-1">
                  {(selectedKey.permissions as string[] || []).map((perm: string) => (
                    <Badge key={perm} variant="secondary">
                      {perm}
                    </Badge>
                  ))}
                  {(!selectedKey.permissions || (selectedKey.permissions as string[]).length === 0) && (
                    <span className="text-muted-foreground">None</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Usage Count:</Label>
                <div className="col-span-2">{selectedKey.usageCount || 0} calls</div>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Last Used:</Label>
                <div className="col-span-2">
                  {selectedKey.lastUsedAt
                    ? format(new Date(selectedKey.lastUsedAt), "MMM d, yyyy HH:mm:ss")
                    : "Never"}
                </div>
              </div>
              {selectedKey.lastUsedIp && (
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label className="text-right font-semibold">Last Used IP:</Label>
                  <div className="col-span-2">
                    <code className="text-xs">{selectedKey.lastUsedIp}</code>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-semibold">Created:</Label>
                <div className="col-span-2">
                  {format(new Date(selectedKey.createdAt), "MMM d, yyyy HH:mm:ss")}
                </div>
              </div>
              {selectedKey.expiresAt && (
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label className="text-right font-semibold">Expires:</Label>
                  <div className="col-span-2">
                    {format(new Date(selectedKey.expiresAt), "MMM d, yyyy HH:mm:ss")}
                  </div>
                </div>
              )}
              {selectedKey.allowedIps && (selectedKey.allowedIps as string[]).length > 0 && (
                <div className="grid grid-cols-3 items-start gap-4">
                  <Label className="text-right font-semibold pt-2">Allowed IPs:</Label>
                  <div className="col-span-2">
                    <div className="space-y-1">
                      {(selectedKey.allowedIps as string[]).map((ip: string, index: number) => (
                        <div key={index}>
                          <code className="text-xs">{ip}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}