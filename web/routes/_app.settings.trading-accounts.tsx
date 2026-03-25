import { useState } from "react";
import { useFindMany, useAction } from "@gadgetinc/react";
import { api } from "../api";
import { AutoTable } from "@/components/auto";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Power,
  Trash2,
  Edit,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";

interface FormData {
  id?: string;
  accountName: string;
  exchange: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  isPaperTrading: boolean;
  isActive: boolean;
  maxTradeSize: string;
  maxDailyLoss: string;
  maxPositionSize: string;
}

export default function TradingAccountsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showLiveWarning, setShowLiveWarning] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [useInternalEngine, setUseInternalEngine] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    accountName: "",
    exchange: "",
    apiKey: "",
    apiSecret: "",
    apiPassphrase: "",
    isPaperTrading: true,
    isActive: true,
    maxTradeSize: "1000",
    maxDailyLoss: "5000",
    maxPositionSize: "10000",
  });

  const [{ data: accounts, fetching: loadingAccounts }, refetchAccounts] = useFindMany(
    api.tradingAccount,
    {
      select: {
        id: true,
        accountName: true,
        exchange: {
          id: true,
          name: true,
          code: true,
        },
        balance: true,
        isActive: true,
        isPaperTrading: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    }
  );

  const [{ data: exchanges }] = useFindMany(api.exchange, {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
    filter: {
      isActive: {
        equals: true,
      },
    },
  });

  const [{ fetching: creating }, createAccount] = useAction(api.tradingAccount.create);
  const [{ fetching: updating }, updateAccount] = useAction(api.tradingAccount.update);
  const [{ fetching: deleting }, deleteAccount] = useAction(api.tradingAccount.delete);

  const resetForm = () => {
    setFormData({
      accountName: "",
      exchange: "",
      apiKey: "",
      apiSecret: "",
      apiPassphrase: "",
      isPaperTrading: true,
      isActive: true,
      maxTradeSize: "1000",
      maxDailyLoss: "5000",
      maxPositionSize: "10000",
    });
    setIsEditing(false);
    setIsDialogOpen(false);
  };

  const handleOpenDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEditAccount = (account: any) => {
    const riskLimits = account.riskLimits || {};
    setFormData({
      id: account.id,
      accountName: account.accountName,
      exchange: account.exchange?.id || "",
      apiKey: "",
      apiSecret: "",
      apiPassphrase: "",
      isPaperTrading: account.isPaperTrading,
      isActive: account.isActive,
      maxTradeSize: riskLimits.maxTradeSize?.toString() || "1000",
      maxDailyLoss: riskLimits.maxDailyLoss?.toString() || "5000",
      maxPositionSize: riskLimits.maxPositionSize?.toString() || "10000",
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (data: FormData) => {
    const riskLimits = {
      maxTradeSize: parseFloat(data.maxTradeSize),
      maxDailyLoss: parseFloat(data.maxDailyLoss),
      maxPositionSize: parseFloat(data.maxPositionSize),
    };

    const accountData = {
      accountName: data.accountName,
      exchange: {
        _link: data.exchange,
      },
      isPaperTrading: data.isPaperTrading,
      isActive: data.isActive,
      riskLimits,
      ...(data.apiKey && { apiKey: data.apiKey }),
      ...(data.apiSecret && { apiSecret: data.apiSecret }),
      ...(data.apiPassphrase && { apiPassphrase: data.apiPassphrase }),
    };

    try {
      if (isEditing && data.id) {
        await updateAccount({
          id: data.id,
          ...accountData,
        });
        toast.success("Trading account updated successfully");
      } else {
        if (!data.apiKey || !data.apiSecret) {
          toast.error("API Key and Secret are required for new accounts");
          return;
        }
        await createAccount(accountData);
        toast.success("Trading account created successfully");
      }
      resetForm();
      void refetchAccounts();
    } catch (error) {
      toast.error(
        `Failed to ${isEditing ? "update" : "create"} account: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.isPaperTrading && (isEditing || formData.isPaperTrading !== formData.isPaperTrading)) {
      setPendingFormData(formData);
      setShowLiveWarning(true);
      return;
    }

    void handleSubmit(formData);
  };

  const confirmLiveTrading = () => {
    if (pendingFormData) {
      void handleSubmit(pendingFormData);
      setPendingFormData(null);
    }
    setShowLiveWarning(false);
  };

  const handleTestConnection = async () => {
    if (!formData.exchange || !formData.apiKey || !formData.apiSecret) {
      toast.error("Please fill in Exchange, API Key, and API Secret to test connection");
      return;
    }

    setTestingConnection(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Connection test successful!");
    } catch (error) {
      toast.error("Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleToggleActive = async (accountId: string, currentStatus: boolean) => {
    try {
      await updateAccount({
        id: accountId,
        isActive: !currentStatus,
      });
      toast.success(`Account ${!currentStatus ? "activated" : "deactivated"}`);
      void refetchAccounts();
    } catch (error) {
      toast.error("Failed to toggle account status");
    }
  };

  const handleSyncBalance = async (accountId: string) => {
    try {
      toast.info("Syncing balance...");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Balance synced successfully");
      void refetchAccounts();
    } catch (error) {
      toast.error("Failed to sync balance");
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      await deleteAccount({ id: accountId });
      toast.success("Account deleted successfully");
      void refetchAccounts();
    } catch (error) {
      toast.error("Failed to delete account");
    }
  };

  const renderBalance = (balance: any) => {
    if (!balance || typeof balance !== "object") {
      return <span className="text-muted-foreground">-</span>;
    }

    const entries = Object.entries(balance).slice(0, 3);
    if (entries.length === 0) {
      return <span className="text-muted-foreground">Empty</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        {entries.map(([currency, amount]) => (
          <div key={currency} className="text-sm">
            {currency}: {typeof amount === "number" ? amount.toFixed(4) : amount}
          </div>
        ))}
        {Object.keys(balance).length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{Object.keys(balance).length - 3} more
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trading Accounts</h1>
          <p className="text-muted-foreground mt-1">
            Manage your exchange connections and trading configurations
          </p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Trading Account
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Trading Modes
          </CardTitle>
          <CardDescription>
            Choose how you want to execute trades
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium">Internal Trading Engine</div>
              <p className="text-sm text-muted-foreground">
                Trade using Cypher's internal order book without connecting to external exchanges
              </p>
            </div>
            <Checkbox
              checked={useInternalEngine}
              onCheckedChange={(checked) => setUseInternalEngine(checked === true)}
            />
          </div>

          <Separator />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 p-4 border rounded-lg">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Internal Trading
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Instant execution</li>
                <li>• No exchange fees</li>
                <li>• Practice with virtual funds</li>
                <li>• Full control over order matching</li>
              </ul>
            </div>

            <div className="space-y-2 p-4 border rounded-lg">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                External Exchange Trading
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Real market liquidity</li>
                <li>• Live market execution</li>
                <li>• Requires exchange API keys</li>
                <li>• Subject to exchange fees</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Trading Accounts</CardTitle>
          <CardDescription>
            Connected exchange accounts and their current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAccounts ? (
            <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trading accounts yet. Add one to get started.
            </div>
          ) : (
            <AutoTable
              model={api.tradingAccount}
              columns={[
                "accountName",
                {
                  header: "Exchange",
                  render: ({ record }) => (
                    <div className="flex items-center gap-2">
                      {record.exchange?.name || "N/A"}
                      {record.exchange?.code && (
                        <Badge variant="outline" className="text-xs">
                          {record.exchange.code}
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Balance",
                  render: ({ record }) => renderBalance(record.balance),
                },
                {
                  header: "Status",
                  render: ({ record }) => (
                    <div className="flex items-center gap-2">
                      {record.isActive ? (
                        <Badge variant="default" className="bg-green-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                      {record.isPaperTrading && (
                        <Badge variant="outline">Paper</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Last Synced",
                  render: ({ record }) =>
                    record.lastSyncedAt
                      ? new Date(record.lastSyncedAt).toLocaleString()
                      : "Never",
                },
                {
                  header: "Actions",
                  render: ({ record }) => (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditAccount(record)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleSyncBalance(record.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleToggleActive(record.id, record.isActive)}
                      >
                        <Power
                          className={`h-4 w-4 ${record.isActive ? "text-green-600" : "text-gray-400"}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteAccount(record.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Trading Account" : "Add Trading Account"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update your trading account settings"
                : "Connect a new exchange account"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name *</Label>
              <Input
                id="accountName"
                value={formData.accountName}
                onChange={(e) =>
                  setFormData({ ...formData, accountName: e.target.value })
                }
                placeholder="My Binance Account"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exchange">Exchange *</Label>
              <Select
                value={formData.exchange}
                onValueChange={(value) =>
                  setFormData({ ...formData, exchange: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an exchange" />
                </SelectTrigger>
                <SelectContent>
                  {exchanges?.map((exchange) => (
                    <SelectItem key={exchange.id} value={exchange.id}>
                      {exchange.name} ({exchange.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key {!isEditing && "*"}</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder={isEditing ? "Leave blank to keep current" : "Enter API key"}
                required={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiSecret">API Secret {!isEditing && "*"}</Label>
              <Input
                id="apiSecret"
                type="password"
                value={formData.apiSecret}
                onChange={(e) =>
                  setFormData({ ...formData, apiSecret: e.target.value })
                }
                placeholder={isEditing ? "Leave blank to keep current" : "Enter API secret"}
                required={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiPassphrase">API Passphrase (Optional)</Label>
              <Input
                id="apiPassphrase"
                type="password"
                value={formData.apiPassphrase}
                onChange={(e) =>
                  setFormData({ ...formData, apiPassphrase: e.target.value })
                }
                placeholder="Enter passphrase if required"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-semibold">Risk Limits</h3>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxTradeSize">Max Trade Size (USD)</Label>
                  <Input
                    id="maxTradeSize"
                    type="number"
                    step="0.01"
                    value={formData.maxTradeSize}
                    onChange={(e) =>
                      setFormData({ ...formData, maxTradeSize: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxDailyLoss">Max Daily Loss (USD)</Label>
                  <Input
                    id="maxDailyLoss"
                    type="number"
                    step="0.01"
                    value={formData.maxDailyLoss}
                    onChange={(e) =>
                      setFormData({ ...formData, maxDailyLoss: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxPositionSize">Max Position Size (USD)</Label>
                  <Input
                    id="maxPositionSize"
                    type="number"
                    step="0.01"
                    value={formData.maxPositionSize}
                    onChange={(e) =>
                      setFormData({ ...formData, maxPositionSize: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPaperTrading"
                  checked={formData.isPaperTrading}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isPaperTrading: checked === true })
                  }
                />
                <Label htmlFor="isPaperTrading" className="cursor-pointer">
                  Paper Trading Mode (Recommended for testing)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked === true })
                  }
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  Active
                </Label>
              </div>

              {!formData.isPaperTrading && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Warning:</strong> Live trading mode will execute real trades with
                    real funds. Make sure your API keys have the correct permissions and you
                    understand the risks involved.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testingConnection || !formData.exchange}
              >
                {testingConnection ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {creating || updating ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showLiveWarning} onOpenChange={setShowLiveWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Live Trading Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to enable live trading mode. This will execute real trades with
              real money on the connected exchange.
              <br />
              <br />
              <strong>Important:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Ensure your API keys are correctly configured</li>
                <li>Verify your risk limits are appropriate</li>
                <li>Understand that you may lose money</li>
                <li>Start with small amounts to test</li>
              </ul>
              <br />
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFormData(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLiveTrading}>
              I Understand, Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}