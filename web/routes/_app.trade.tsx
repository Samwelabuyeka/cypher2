import { useState } from "react";
import { useFindMany, useGlobalAction, useUser } from "@gadgetinc/react";
import { api } from "../api";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

type TradingMode = "internal" | "external";
type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit";

export default function TradePage() {
  const user = useUser();
  const [tradingMode, setTradingMode] = useState<TradingMode>("internal");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [symbol, setSymbol] = useState<string>("CYP/USD");
  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [quantity, setQuantity] = useState<string>("");
  const [price, setPrice] = useState<string>("");

  // Fetch user's wallets
  const [{ data: wallets, fetching: walletsLoading }] = useFindMany(api.wallet, {
    filter: { userId: { equals: user?.id } },
    select: { id: true, currency: true, balance: true, availableBalance: true },
  });

  // Fetch user's trading accounts
  const [{ data: tradingAccounts, fetching: accountsLoading }] = useFindMany(api.tradingAccount, {
    filter: { userId: { equals: user?.id } },
    select: { 
      id: true, 
      accountName: true, 
      exchangeId: true,
      isPaperTrading: true,
      isActive: true 
    },
  });

  // Fetch recent orders
  const [{ data: recentOrders, fetching: ordersLoading }, refetchOrders] = useFindMany(api.order, {
    filter: { userId: { equals: user?.id } },
    sort: { createdAt: "Descending" },
    first: 10,
    select: {
      id: true,
      symbol: true,
      side: true,
      type: true,
      quantity: true,
      price: true,
      status: true,
      createdAt: true,
    },
  });

  // Fetch recent trades
  const [{ data: recentTrades, fetching: tradesLoading }, refetchTrades] = useFindMany(api.trade, {
    filter: { userId: { equals: user?.id } },
    sort: { executedAt: "Descending" },
    first: 10,
    select: {
      id: true,
      symbol: true,
      side: true,
      quantity: true,
      price: true,
      executedAt: true,
      fee: true,
    },
  });

  // Fetch order book for internal mode
  const [{ data: orderBook, fetching: orderBookLoading }, refetchOrderBook] = useFindMany(
    api.internalOrderBook,
    {
      filter: { 
        symbol: { equals: symbol },
        status: { in: ["open", "partially-filled"] }
      },
      sort: { price: "Descending" },
      first: 20,
      select: {
        id: true,
        side: true,
        orderType: true,
        price: true,
        quantity: true,
        remainingQuantity: true,
        status: true,
      },
    }
  );

  // Fetch latest market data for price display
  const [{ data: marketData }] = useFindMany(api.marketData, {
    filter: { symbol: { equals: symbol.replace("/", "") } },
    sort: { timestamp: "Descending" },
    first: 1,
    select: {
      id: true,
      close: true,
      high: true,
      low: true,
      volume: true,
      timestamp: true,
    },
  });

  // Execute internal trade action
  const [{ fetching: executingInternal }, executeInternalTrade] = useGlobalAction(
    api.executeInternalTrade
  );

  // Execute external trade action
  const [{ fetching: executingExternal }, executeTrade] = useGlobalAction(api.executeTrade);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    if (orderType === "limit" && (!price || parseFloat(price) <= 0)) {
      toast.error("Please enter a valid price for limit orders");
      return;
    }

    if (tradingMode === "external" && !selectedAccount) {
      toast.error("Please select a trading account");
      return;
    }

    try {
      if (tradingMode === "internal") {
        const result = await executeInternalTrade({
          symbol,
          side,
          orderType,
          quantity: parseFloat(quantity),
          price: orderType === "limit" ? parseFloat(price) : undefined,
        });

        if (result.error) {
          toast.error(`Trade failed: ${result.error.message}`);
        } else {
          toast.success("Trade executed successfully!");
          setQuantity("");
          setPrice("");
          refetchOrders();
          refetchTrades();
          refetchOrderBook();
        }
      } else {
        const result = await executeTrade({
          accountId: selectedAccount,
          symbol,
          side,
          orderType,
          quantity: parseFloat(quantity),
          price: orderType === "limit" ? parseFloat(price) : undefined,
        });

        if (result.error) {
          toast.error(`Trade failed: ${result.error.message}`);
        } else {
          toast.success("Trade executed successfully!");
          setQuantity("");
          setPrice("");
          refetchOrders();
          refetchTrades();
        }
      }
    } catch (error) {
      toast.error(`An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const buyOrders = orderBook?.filter((order) => order.side === "buy") || [];
  const sellOrders = orderBook?.filter((order) => order.side === "sell") || [];

  const currentPrice = marketData?.[0]?.close || 0;
  const estimatedFee = parseFloat(quantity || "0") * (orderType === "limit" ? parseFloat(price || "0") : currentPrice) * 0.001;

  const selectedAccountData = tradingAccounts?.find((acc) => acc.id === selectedAccount);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Trading</h1>
        <div className="flex gap-2">
          <Button
            variant={tradingMode === "internal" ? "default" : "outline"}
            onClick={() => setTradingMode("internal")}
          >
            Internal Engine
          </Button>
          <Button
            variant={tradingMode === "external" ? "default" : "outline"}
            onClick={() => setTradingMode("external")}
          >
            External Exchange
          </Button>
        </div>
      </div>

      {tradingMode === "external" && selectedAccountData?.isPaperTrading === false && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Warning: You are trading with real funds on an external exchange. All trades are final.
          </AlertDescription>
        </Alert>
      )}

      {tradingMode === "external" && selectedAccountData?.isPaperTrading === true && (
        <Alert>
          <AlertDescription>
            Paper Trading Mode: This account is in paper trading mode. No real funds will be used.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Place Order</CardTitle>
              <CardDescription>
                {tradingMode === "internal" 
                  ? "Trade using the internal matching engine" 
                  : "Trade on external exchanges"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {tradingMode === "external" && (
                  <div className="space-y-2">
                    <Label htmlFor="account">Trading Account</Label>
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                      <SelectTrigger id="account">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsLoading && <SelectItem value="">Loading...</SelectItem>}
                        {tradingAccounts?.filter(acc => acc.isActive).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.accountName} ({account.exchangeId})
                            {account.isPaperTrading && " - Paper"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger id="symbol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CYP/USD">CYP/USD</SelectItem>
                      <SelectItem value="BTC/USD">BTC/USD</SelectItem>
                      <SelectItem value="ETH/USD">ETH/USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Side</Label>
                  <Tabs value={side} onValueChange={(value) => setSide(value as OrderSide)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="buy" className="data-[state=active]:bg-green-600">
                        Buy
                      </TabsTrigger>
                      <TabsTrigger value="sell" className="data-[state=active]:bg-red-600">
                        Sell
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <Label>Order Type</Label>
                  <RadioGroup value={orderType} onValueChange={(value) => setOrderType(value as OrderType)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="market" id="market" />
                      <Label htmlFor="market">Market</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="limit" id="limit" />
                      <Label htmlFor="limit">Limit</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.00000001"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                {orderType === "limit" && (
                  <div className="space-y-2">
                    <Label htmlFor="price">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.00000001"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}

                <div className="pt-2 space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Estimated Fee:</span>
                    <span>${estimatedFee.toFixed(2)}</span>
                  </div>
                  {orderType === "market" && (
                    <div className="flex justify-between">
                      <span>Current Price:</span>
                      <span>${currentPrice.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={executingInternal || executingExternal}
                >
                  {executingInternal || executingExternal ? "Executing..." : `${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
                </Button>
              </form>
            </CardContent>
          </Card>

          {tradingMode === "internal" && (
            <Card>
              <CardHeader>
                <CardTitle>Order Book</CardTitle>
                <CardDescription>Live buy and sell orders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      Buy Orders
                    </h3>
                    <div className="space-y-1">
                      {orderBookLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                      {buyOrders.length === 0 && !orderBookLoading && (
                        <p className="text-sm text-muted-foreground">No buy orders</p>
                      )}
                      {buyOrders.slice(0, 10).map((order) => (
                        <div key={order.id} className="flex justify-between text-sm">
                          <span className="text-green-600">${order.price.toFixed(2)}</span>
                          <span className="text-muted-foreground">{order.remainingQuantity.toFixed(8)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      Sell Orders
                    </h3>
                    <div className="space-y-1">
                      {orderBookLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                      {sellOrders.length === 0 && !orderBookLoading && (
                        <p className="text-sm text-muted-foreground">No sell orders</p>
                      )}
                      {sellOrders.slice(0, 10).map((order) => (
                        <div key={order.id} className="flex justify-between text-sm">
                          <span className="text-red-600">${order.price.toFixed(2)}</span>
                          <span className="text-muted-foreground">{order.remainingQuantity.toFixed(8)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
            </CardHeader>
            <CardContent>
              {walletsLoading && <p className="text-sm text-muted-foreground">Loading balances...</p>}
              {!walletsLoading && wallets?.length === 0 && (
                <p className="text-sm text-muted-foreground">No wallets found</p>
              )}
              <div className="space-y-2">
                {wallets?.map((wallet) => (
                  <div key={wallet.id} className="flex justify-between items-center">
                    <span className="font-medium">{wallet.currency}</span>
                    <div className="text-right">
                      <div className="text-sm">{wallet.balance.toFixed(8)}</div>
                      <div className="text-xs text-muted-foreground">
                        Available: {wallet.availableBalance.toFixed(8)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {marketData?.[0] && (
            <Card>
              <CardHeader>
                <CardTitle>Market Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Price</span>
                    <span className="font-semibold">${marketData[0].close.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24h High</span>
                    <span>${marketData[0].high.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24h Low</span>
                    <span>${marketData[0].low.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Volume</span>
                    <span>{marketData[0].volume.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading && <p className="text-sm text-muted-foreground">Loading orders...</p>}
            {!ordersLoading && recentOrders?.length === 0 && (
              <p className="text-sm text-muted-foreground">No orders yet</p>
            )}
            {recentOrders && recentOrders.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.symbol}</TableCell>
                        <TableCell>
                          <span className={order.side === "buy" ? "text-green-600" : "text-red-600"}>
                            {order.side.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell>{order.type}</TableCell>
                        <TableCell>{order.quantity.toFixed(8)}</TableCell>
                        <TableCell>{order.price ? `$${order.price.toFixed(2)}` : "-"}</TableCell>
                        <TableCell>{order.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {tradesLoading && <p className="text-sm text-muted-foreground">Loading trades...</p>}
            {!tradesLoading && recentTrades?.length === 0 && (
              <p className="text-sm text-muted-foreground">No trades yet</p>
            )}
            {recentTrades && recentTrades.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTrades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell>{trade.symbol}</TableCell>
                        <TableCell>
                          <span className={trade.side === "buy" ? "text-green-600" : "text-red-600"}>
                            {trade.side.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell>{trade.quantity.toFixed(8)}</TableCell>
                        <TableCell>${trade.price.toFixed(2)}</TableCell>
                        <TableCell>${trade.fee.toFixed(4)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(trade.executedAt).toLocaleTimeString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}