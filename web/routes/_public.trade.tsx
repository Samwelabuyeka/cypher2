import { useState, useEffect } from "react";
import { useFindMany, useAction, useUser } from "@gadgetinc/react";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  Shield,
  Brain,
  Cpu,
} from "lucide-react";

interface OrderFormData {
  amount: string;
  price: string;
  orderType: "market" | "limit";
}

interface MockMarketData {
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
}

interface MockOrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

interface MockTrade {
  id: string;
  time: string;
  type: "buy" | "sell";
  price: number;
  amount: number;
  total: number;
}

export default function TradePage() {
  const user = useUser();
  const [timeframe, setTimeframe] = useState("1h");
  const [buyForm, setBuyForm] = useState<OrderFormData>({
    amount: "",
    price: "",
    orderType: "market",
  });
  const [sellForm, setSellForm] = useState<OrderFormData>({
    amount: "",
    price: "",
    orderType: "market",
  });

  // Mock market data (in production, this would come from real-time API)
  const [marketData, setMarketData] = useState<MockMarketData>({
    price: 47582.35,
    change24h: 2.47,
    volume24h: 28457320000,
    marketCap: 892450000000,
    high24h: 48120.50,
    low24h: 46890.20,
  });

  // Mock order book data
  const [buyOrders] = useState<MockOrderBookEntry[]>([
    { price: 47580.00, amount: 2.453, total: 116702.94 },
    { price: 47575.50, amount: 1.892, total: 90010.65 },
    { price: 47570.00, amount: 3.124, total: 148638.68 },
    { price: 47565.25, amount: 0.856, total: 40735.85 },
    { price: 47560.00, amount: 4.237, total: 201520.32 },
  ]);

  const [sellOrders] = useState<MockOrderBookEntry[]>([
    { price: 47585.00, amount: 1.567, total: 74569.50 },
    { price: 47590.50, amount: 2.234, total: 106326.66 },
    { price: 47595.00, amount: 0.945, total: 44977.28 },
    { price: 47600.25, amount: 3.156, total: 150228.79 },
    { price: 47605.00, amount: 1.823, total: 86780.32 },
  ]);

  // Mock recent trades
  const [recentTrades] = useState<MockTrade[]>([
    { id: "1", time: "14:32:15", type: "buy", price: 47582.35, amount: 0.523, total: 24885.57 },
    { id: "2", time: "14:32:10", type: "sell", price: 47580.00, amount: 1.234, total: 58709.72 },
    { id: "3", time: "14:32:05", type: "buy", price: 47585.50, amount: 0.892, total: 42444.27 },
    { id: "4", time: "14:31:58", type: "buy", price: 47583.25, amount: 2.156, total: 102599.45 },
    { id: "5", time: "14:31:52", type: "sell", price: 47578.00, amount: 0.445, total: 21172.21 },
  ]);

  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketData((prev) => {
        const change = (Math.random() - 0.5) * 100;
        const newPrice = prev.price + change;
        const newChange24h = ((newPrice - 46500) / 46500) * 100;
        return {
          ...prev,
          price: newPrice,
          change24h: newChange24h,
        };
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Action hooks
  const [{ fetching: creatingOrder }, createOrder] = useAction(api.order.create);
  const [{ fetching: creatingAccount }, createAccount] = useAction(api.tradingAccount.create);

  const handleBuy = async () => {
    if (!user) {
      toast.error("Please sign in to trade");
      return;
    }

    if (!buyForm.amount || parseFloat(buyForm.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (buyForm.orderType === "limit" && (!buyForm.price || parseFloat(buyForm.price) <= 0)) {
      toast.error("Please enter a valid price for limit order");
      return;
    }

    try {
      await createOrder({
        symbol: "CYP/USD",
        side: "buy",
        type: buyForm.orderType,
        quantity: parseFloat(buyForm.amount),
        price: buyForm.orderType === "limit" ? parseFloat(buyForm.price) : undefined,
        user: { _link: user.id },
      });

      toast.success("Buy order placed successfully!");
      setBuyForm({ amount: "", price: "", orderType: "market" });
    } catch (error) {
      toast.error("Failed to place order. Please try again.");
    }
  };

  const handleSell = async () => {
    if (!user) {
      toast.error("Please sign in to trade");
      return;
    }

    if (!sellForm.amount || parseFloat(sellForm.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (sellForm.orderType === "limit" && (!sellForm.price || parseFloat(sellForm.price) <= 0)) {
      toast.error("Please enter a valid price for limit order");
      return;
    }

    try {
      await createOrder({
        symbol: "CYP/USD",
        side: "sell",
        type: sellForm.orderType,
        quantity: parseFloat(sellForm.amount),
        price: sellForm.orderType === "limit" ? parseFloat(sellForm.price) : undefined,
        user: { _link: user.id },
      });

      toast.success("Sell order placed successfully!");
      setSellForm({ amount: "", price: "", orderType: "market" });
    } catch (error) {
      toast.error("Failed to place order. Please try again.");
    }
  };

  const calculateTotal = (amount: string, price: string, orderType: string) => {
    const amt = parseFloat(amount) || 0;
    const prc = orderType === "market" ? marketData.price : parseFloat(price) || 0;
    return (amt * prc).toFixed(2);
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const formatCurrency = (num: number) => {
    if (num >= 1e9) {
      return `$${(num / 1e9).toFixed(2)}B`;
    }
    if (num >= 1e6) {
      return `$${(num / 1e6).toFixed(2)}M`;
    }
    return `$${formatNumber(num)}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                  <Cpu className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">CypherCoin</h1>
                  <p className="text-xs text-zinc-400">CYP/USD</p>
                </div>
              </div>

              <Separator orientation="vertical" className="h-12 bg-zinc-700" />

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">${formatNumber(marketData.price, 2)}</span>
                  <Badge
                    variant={marketData.change24h >= 0 ? "default" : "destructive"}
                    className={
                      marketData.change24h >= 0
                        ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                        : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    }
                  >
                    {marketData.change24h >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                    {marketData.change24h >= 0 ? "+" : ""}
                    {formatNumber(marketData.change24h, 2)}%
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400">24h Change</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-zinc-400">24h High</p>
                <p className="text-sm font-semibold text-green-400">${formatNumber(marketData.high24h, 2)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">24h Low</p>
                <p className="text-sm font-semibold text-red-400">${formatNumber(marketData.low24h, 2)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">24h Volume</p>
                <p className="text-sm font-semibold">{formatCurrency(marketData.volume24h)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Market Cap</p>
                <p className="text-sm font-semibold">{formatCurrency(marketData.marketCap)}</p>
              </div>
              <div>
                <Badge variant="default" className="bg-green-500/20 text-green-400">
                  <Activity className="mr-1 h-3 w-3" />
                  ONLINE
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left Column - Order Book */}
          <div className="lg:col-span-3">
            <Card className="border-zinc-800 bg-zinc-900">
              <div className="p-4">
                <h2 className="mb-4 text-sm font-semibold">Order Book</h2>

                {/* Buy Orders */}
                <div className="mb-4">
                  <div className="mb-2 grid grid-cols-3 text-xs text-zinc-400">
                    <span>Price (USD)</span>
                    <span className="text-right">Amount (CYP)</span>
                    <span className="text-right">Total</span>
                  </div>
                  <div className="space-y-1">
                    {buyOrders.map((order, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-3 text-xs"
                        style={{
                          background: `linear-gradient(to right, rgba(34, 197, 94, 0.1) ${(order.amount / 5) * 100}%, transparent ${(order.amount / 5) * 100}%)`,
                        }}
                      >
                        <span className="text-green-400">{formatNumber(order.price, 2)}</span>
                        <span className="text-right">{formatNumber(order.amount, 3)}</span>
                        <span className="text-right text-zinc-400">{formatNumber(order.total, 2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="my-3 border-t border-zinc-700 pt-3 text-center">
                  <span className="text-lg font-bold">${formatNumber(marketData.price, 2)}</span>
                </div>

                {/* Sell Orders */}
                <div>
                  <div className="mb-2 grid grid-cols-3 text-xs text-zinc-400">
                    <span>Price (USD)</span>
                    <span className="text-right">Amount (CYP)</span>
                    <span className="text-right">Total</span>
                  </div>
                  <div className="space-y-1">
                    {sellOrders.map((order, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-3 text-xs"
                        style={{
                          background: `linear-gradient(to right, rgba(239, 68, 68, 0.1) ${(order.amount / 5) * 100}%, transparent ${(order.amount / 5) * 100}%)`,
                        }}
                      >
                        <span className="text-red-400">{formatNumber(order.price, 2)}</span>
                        <span className="text-right">{formatNumber(order.amount, 3)}</span>
                        <span className="text-right text-zinc-400">{formatNumber(order.total, 2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Center Column - Chart */}
          <div className="lg:col-span-6">
            <Card className="border-zinc-800 bg-zinc-900">
              <div className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">CYP/USD Price Chart</h2>
                  <div className="flex gap-1">
                    {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
                      <Button
                        key={tf}
                        variant={timeframe === tf ? "default" : "ghost"}
                        size="sm"
                        className={
                          timeframe === tf
                            ? "h-7 bg-cyan-600 text-xs hover:bg-cyan-700"
                            : "h-7 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        }
                        onClick={() => setTimeframe(tf)}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Chart Placeholder */}
                <div className="flex h-96 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
                  <div className="text-center">
                    <BarChart3 className="mx-auto mb-2 h-12 w-12 text-zinc-600" />
                    <p className="text-sm text-zinc-400">Interactive chart will be displayed here</p>
                    <p className="text-xs text-zinc-500">Real-time candlestick chart with technical indicators</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column - Trading Panel */}
          <div className="lg:col-span-3">
            <Card className="border-zinc-800 bg-zinc-900">
              <div className="p-4">
                <Tabs defaultValue="buy">
                  <TabsList className="mb-4 grid w-full grid-cols-2 bg-zinc-800">
                    <TabsTrigger value="buy" className="data-[state=active]:bg-green-600">
                      Buy CYP
                    </TabsTrigger>
                    <TabsTrigger value="sell" className="data-[state=active]:bg-red-600">
                      Sell CYP
                    </TabsTrigger>
                  </TabsList>

                  {/* Buy Tab */}
                  <TabsContent value="buy" className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Order Type</Label>
                      <Select
                        value={buyForm.orderType}
                        onValueChange={(value: "market" | "limit") => setBuyForm({ ...buyForm, orderType: value })}
                      >
                        <SelectTrigger className="border-zinc-700 bg-zinc-950">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {buyForm.orderType === "limit" && (
                      <div className="space-y-2">
                        <Label className="text-xs text-zinc-400">Price (USD)</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={buyForm.price}
                          onChange={(e) => setBuyForm({ ...buyForm, price: e.target.value })}
                          className="border-zinc-700 bg-zinc-950"
                          disabled={!user}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Amount (CYP)</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={buyForm.amount}
                        onChange={(e) => setBuyForm({ ...buyForm, amount: e.target.value })}
                        className="border-zinc-700 bg-zinc-950"
                        disabled={!user}
                      />
                    </div>

                    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="text-zinc-400">Total</span>
                        <span className="font-semibold">${calculateTotal(buyForm.amount, buyForm.price, buyForm.orderType)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Fee (0.1%)</span>
                        <span className="text-zinc-400">${(parseFloat(calculateTotal(buyForm.amount, buyForm.price, buyForm.orderType)) * 0.001).toFixed(2)}</span>
                      </div>
                    </div>

                    {user && (
                      <div className="text-xs text-zinc-400">
                        <span>Available: </span>
                        <span className="font-semibold text-zinc-100">$0.00 USD</span>
                      </div>
                    )}

                    {user ? (
                      <Button
                        onClick={handleBuy}
                        disabled={creatingOrder}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {creatingOrder ? "Processing..." : "Buy CYP"}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Button asChild className="w-full bg-cyan-600 hover:bg-cyan-700">
                          <a href="/sign-in">Sign In to Trade</a>
                        </Button>
                        <Button asChild variant="outline" className="w-full border-zinc-700">
                          <a href="/sign-up">Create Account</a>
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Sell Tab */}
                  <TabsContent value="sell" className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Order Type</Label>
                      <Select
                        value={sellForm.orderType}
                        onValueChange={(value: "market" | "limit") => setSellForm({ ...sellForm, orderType: value })}
                      >
                        <SelectTrigger className="border-zinc-700 bg-zinc-950">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {sellForm.orderType === "limit" && (
                      <div className="space-y-2">
                        <Label className="text-xs text-zinc-400">Price (USD)</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={sellForm.price}
                          onChange={(e) => setSellForm({ ...sellForm, price: e.target.value })}
                          className="border-zinc-700 bg-zinc-950"
                          disabled={!user}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Amount (CYP)</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={sellForm.amount}
                        onChange={(e) => setSellForm({ ...sellForm, amount: e.target.value })}
                        className="border-zinc-700 bg-zinc-950"
                        disabled={!user}
                      />
                    </div>

                    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="text-zinc-400">Total</span>
                        <span className="font-semibold">${calculateTotal(sellForm.amount, sellForm.price, sellForm.orderType)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Fee (0.1%)</span>
                        <span className="text-zinc-400">${(parseFloat(calculateTotal(sellForm.amount, sellForm.price, sellForm.orderType)) * 0.001).toFixed(2)}</span>
                      </div>
                    </div>

                    {user && (
                      <div className="text-xs text-zinc-400">
                        <span>Available: </span>
                        <span className="font-semibold text-zinc-100">0.00 CYP</span>
                      </div>
                    )}

                    {user ? (
                      <Button
                        onClick={handleSell}
                        disabled={creatingOrder}
                        className="w-full bg-red-600 hover:bg-red-700"
                      >
                        {creatingOrder ? "Processing..." : "Sell CYP"}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Button asChild className="w-full bg-cyan-600 hover:bg-cyan-700">
                          <a href="/sign-in">Sign In to Trade</a>
                        </Button>
                        <Button asChild variant="outline" className="w-full border-zinc-700">
                          <a href="/sign-up">Create Account</a>
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </Card>
          </div>
        </div>

        {/* Trade History */}
        <div className="mt-6">
          <Card className="border-zinc-800 bg-zinc-900">
            <div className="p-4">
              <h2 className="mb-4 text-sm font-semibold">Recent Trades</h2>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800">
                    <TableHead className="text-zinc-400">Time</TableHead>
                    <TableHead className="text-zinc-400">Type</TableHead>
                    <TableHead className="text-right text-zinc-400">Price (USD)</TableHead>
                    <TableHead className="text-right text-zinc-400">Amount (CYP)</TableHead>
                    <TableHead className="text-right text-zinc-400">Total (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.map((trade) => (
                    <TableRow key={trade.id} className="border-zinc-800 hover:bg-zinc-800">
                      <TableCell className="text-xs text-zinc-400">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {trade.time}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={trade.type === "buy" ? "default" : "destructive"}
                          className={
                            trade.type === "buy"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          }
                        >
                          {trade.type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right ${trade.type === "buy" ? "text-green-400" : "text-red-400"}`}>
                        ${formatNumber(trade.price, 2)}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(trade.amount, 3)}</TableCell>
                      <TableCell className="text-right">${formatNumber(trade.total, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Information Section */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="border-zinc-800 bg-zinc-900">
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-5 w-5 text-cyan-500" />
                <h3 className="font-semibold">Secure Trading</h3>
              </div>
              <p className="text-sm text-zinc-400">
                Advanced encryption and multi-layer security protocols protect your assets.
              </p>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900">
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-5 w-5 text-cyan-500" />
                <h3 className="font-semibold">AI-Powered</h3>
              </div>
              <p className="text-sm text-zinc-400">
                Intelligent algorithms optimize your trading strategies in real-time.
              </p>
            </div>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900">
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Zap className="h-5 w-5 text-cyan-500" />
                <h3 className="font-semibold">Lightning Fast</h3>
              </div>
              <p className="text-sm text-zinc-400">
                Execute trades instantly with our high-performance infrastructure.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}