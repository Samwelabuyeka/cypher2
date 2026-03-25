import { useState, useEffect } from "react";
import { useFindMany, useAction, useUser } from "@gadgetinc/react";
import { api } from "../api";
import { Link } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Send,
  Download,
  Copy,
  QrCode,
  Shield,
  Activity,
  Settings,
  HelpCircle,
  DollarSign,
  Bitcoin,
  Eye,
  EyeOff,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const user = useUser();
  const [selectedTimeframe, setSelectedTimeframe] = useState<"7d" | "30d" | "all">("7d");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Fetch user wallets
  const [{ data: wallets, fetching: walletsLoading }] = useFindMany(api.wallet, {
    filter: { userId: { equals: user?.id } },
    select: {
      id: true,
      currency: true,
      balance: true,
      availableBalance: true,
      lockedBalance: true,
      address: true,
      isActive: true,
    },
  });

  // Fetch open orders
  const [{ data: openOrders, fetching: ordersLoading }] = useFindMany(api.order, {
    filter: {
      userId: { equals: user?.id },
      status: { in: ["pending", "open", "partially-filled"] },
    },
    select: {
      id: true,
      symbol: true,
      side: true,
      type: true,
      price: true,
      quantity: true,
      filledQuantity: true,
      status: true,
      placedAt: true,
    },
    sort: { placedAt: "Descending" },
    first: 10,
  });

  // Fetch recent trades
  const [{ data: trades, fetching: tradesLoading }] = useFindMany(api.trade, {
    filter: { userId: { equals: user?.id } },
    select: {
      id: true,
      symbol: true,
      side: true,
      price: true,
      quantity: true,
      fee: true,
      realizedPnL: true,
      executedAt: true,
    },
    sort: { executedAt: "Descending" },
    first: 20,
  });

  // Fetch wallet transactions
  const [{ data: transactions, fetching: transactionsLoading }] = useFindMany(
    api.walletTransaction,
    {
      filter: { userId: { equals: user?.id } },
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        status: true,
        completedAt: true,
        description: true,
      },
      sort: { createdAt: "Descending" },
      first: 10,
    }
  );

  // Fetch performance metrics
  const [{ data: metrics, fetching: metricsLoading }] = useFindMany(
    api.performanceMetric,
    {
      filter: {
        userId: { equals: user?.id },
        metricType: { equals: "account-performance" },
      },
      select: {
        id: true,
        totalPnL: true,
        totalPnLPercent: true,
        roi: true,
        winRate: true,
        numberOfTrades: true,
        fees: true,
        volume: true,
        sharpeRatio: true,
        maxDrawdown: true,
        periodStart: true,
        periodEnd: true,
      },
      sort: { periodEnd: "Descending" },
      first: 1,
    }
  );

  // Cancel order action
  const [{ fetching: cancellingOrder }, cancelOrder] = useAction(api.order.delete);

  // Calculate portfolio values
  const cypWallet = wallets?.find((w) => w.currency === "CYP");
  const usdWallet = wallets?.find((w) => w.currency === "USD");
  
  // Mock CYP price - in production, fetch from market data
  const cypPrice = 1.25;
  
  const cypBalance = cypWallet?.balance ?? 0;
  const usdBalance = usdWallet?.balance ?? 0;
  const cypValueUsd = cypBalance * cypPrice;
  const totalPortfolioValue = cypValueUsd + usdBalance;

  // Calculate today's P&L (mock for now)
  const todayPnL = metrics?.[0]?.totalPnL ?? 0;
  const todayPnLPercent = metrics?.[0]?.totalPnLPercent ?? 0;

  // Statistics
  const totalTrades = metrics?.[0]?.numberOfTrades ?? 0;
  const winRate = metrics?.[0]?.winRate ?? 0;
  const totalFees = metrics?.[0]?.fees ?? 0;
  const totalVolume = metrics?.[0]?.volume ?? 0;

  // Calculate average trade size
  const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;

  // Account age (days since user creation)
  const accountAge = user?.createdAt
    ? Math.floor(
        (new Date().getTime() - new Date(user.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrder({ id: orderId });
      toast.success("Order cancelled successfully");
    } catch (error) {
      toast.error("Failed to cancel order");
    }
  };

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (error) {
      toast.error("Failed to copy address");
    }
  };

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency === "CYP" ? "USD" : currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: string | Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      open: "default",
      "partially-filled": "default",
      filled: "outline",
      cancelled: "destructive",
      rejected: "destructive",
      expired: "secondary",
      completed: "outline",
      processing: "secondary",
      failed: "destructive",
    };

    const icons: Record<string, any> = {
      completed: CheckCircle,
      filled: CheckCircle,
      pending: Clock,
      open: Clock,
      processing: Clock,
      cancelled: XCircle,
      rejected: XCircle,
      failed: XCircle,
    };

    const Icon = icons[status];

    return (
      <Badge variant={variants[status] || "default"} className="gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {status}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.firstName || user?.email}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/help">
              <HelpCircle className="h-4 w-4 mr-2" />
              Help
            </Link>
          </Button>
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Portfolio</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalPortfolioValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Combined USD + CYP value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CYP Balance</CardTitle>
            <Bitcoin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cypBalance.toFixed(4)} CYP
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ≈ {formatCurrency(cypValueUsd)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">USD Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(usdBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Available funds</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's P&L</CardTitle>
            {todayPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                todayPnL >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {todayPnL >= 0 ? "+" : ""}
              {formatCurrency(todayPnL)}
            </div>
            <p
              className={`text-xs mt-1 ${
                todayPnLPercent >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {todayPnLPercent >= 0 ? "+" : ""}
              {todayPnLPercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common trading and wallet operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Button className="w-full" variant="default">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Buy CYP
            </Button>
            <Button className="w-full" variant="default">
              <ArrowDownRight className="h-4 w-4 mr-2" />
              Sell CYP
            </Button>
            <Button className="w-full" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Deposit USD
            </Button>
            <Button className="w-full" variant="outline">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Withdraw USD
            </Button>
            <Button className="w-full" variant="outline">
              <Send className="h-4 w-4 mr-2" />
              Send CYP
            </Button>
            <Button className="w-full" variant="outline">
              <QrCode className="h-4 w-4 mr-2" />
              Receive CYP
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Wallet Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet
            </CardTitle>
            <CardDescription>Your CYP wallet information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cypWallet?.address && (
              <div>
                <label className="text-sm font-medium">Wallet Address</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono truncate">
                    {cypWallet.address}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyAddress(cypWallet.address!)}
                  >
                    {copiedAddress ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">QR Code</label>
              <div className="mt-2 p-4 bg-muted rounded flex items-center justify-center">
                <div className="w-32 h-32 bg-background border-2 border-border rounded flex items-center justify-center">
                  <QrCode className="h-16 w-16 text-muted-foreground" />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <label className="text-sm font-medium">Private Key</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono">
                  {showPrivateKey ? "0x..." : "••••••••••••••••"}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Keep your private key secure and never share it
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Statistics
            </CardTitle>
            <CardDescription>Your trading performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Trades</span>
              <span className="font-semibold">{totalTrades}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Win Rate</span>
              <span className="font-semibold text-green-500">
                {winRate.toFixed(2)}%
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Trade Size</span>
              <span className="font-semibold">{formatCurrency(avgTradeSize)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Fees</span>
              <span className="font-semibold">{formatCurrency(totalFees)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Volume</span>
              <span className="font-semibold">{formatCurrency(totalVolume)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Account Age</span>
              <span className="font-semibold">{accountAge} days</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders and Trades */}
      <Tabs defaultValue="open-orders" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="open-orders">Open Orders</TabsTrigger>
          <TabsTrigger value="trade-history">Trade History</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="open-orders">
          <Card>
            <CardHeader>
              <CardTitle>Open Orders</CardTitle>
              <CardDescription>Your active trading orders</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading orders...
                </div>
              ) : !openOrders || openOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No open orders
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Filled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.symbol}</TableCell>
                        <TableCell>
                          <Badge
                            variant={order.side === "buy" ? "default" : "destructive"}
                          >
                            {order.side}
                          </Badge>
                        </TableCell>
                        <TableCell>{order.type}</TableCell>
                        <TableCell>
                          {order.price ? formatCurrency(order.price) : "Market"}
                        </TableCell>
                        <TableCell>{order.quantity}</TableCell>
                        <TableCell>{order.filledQuantity ?? 0}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {order.placedAt ? formatDate(order.placedAt) : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={cancellingOrder}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trade-history">
          <Card>
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
              <CardDescription>Your completed trades</CardDescription>
            </CardHeader>
            <CardContent>
              {tradesLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading trades...
                </div>
              ) : !trades || trades.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No trades yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>P&L</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                        <TableCell>
                          <Badge
                            variant={trade.side === "buy" ? "default" : "destructive"}
                          >
                            {trade.side}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(trade.price)}</TableCell>
                        <TableCell>{trade.quantity}</TableCell>
                        <TableCell>{formatCurrency(trade.fee)}</TableCell>
                        <TableCell
                          className={
                            (trade.realizedPnL ?? 0) >= 0
                              ? "text-green-500"
                              : "text-red-500"
                          }
                        >
                          {trade.realizedPnL
                            ? formatCurrency(trade.realizedPnL)
                            : "-"}
                        </TableCell>
                        <TableCell>{trade.executedAt ? formatDate(trade.executedAt) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export to CSV
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Wallet Transactions</CardTitle>
              <CardDescription>Deposits, withdrawals, and transfers</CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading transactions...
                </div>
              ) : !transactions || transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No transactions yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium capitalize">
                          {tx.type}
                        </TableCell>
                        <TableCell>{formatCurrency(tx.amount)}</TableCell>
                        <TableCell>{tx.currency}</TableCell>
                        <TableCell>{getStatusBadge(tx.status)}</TableCell>
                        <TableCell>
                          {tx.completedAt ? formatDate(tx.completedAt) : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>Manage your account security</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security
              </p>
            </div>
            <Badge variant="secondary">Not Enabled</Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">API Keys</p>
              <p className="text-sm text-muted-foreground">
                Manage your API access
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings/api-keys">Manage</Link>
            </Button>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">Recent Activity</p>
              <p className="text-sm text-muted-foreground">
                View your login history
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings/activity">View</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}