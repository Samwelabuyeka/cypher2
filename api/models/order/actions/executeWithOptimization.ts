import { applyParams, save, ActionOptions, ActionRun } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { assert } from "gadget-server";
import { generateTradingSignal } from "../../../lib/calculations/machineLearning";
import { optimizePositionSize } from "../../../lib/calculations/quantitativeModels";
import { 
  calculateRSI, 
  calculateMACD, 
  calculateBollingerBands 
} from "../../../lib/calculations/technicalIndicators";
import { calculateMarketEntropy } from "../../../lib/calculations/mathUtils";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  const autoOptimize = params.autoOptimize ?? true;
  const riskBudget = params.riskBudget ?? 2; // default 2% risk
  const targetConfidence = params.targetConfidence ?? 70;

  // Fetch user's trading account to get balance
  const tradingAccount = await api.tradingAccount.findOne(record.tradingAccountId, {
    select: {
      id: true,
      balance: true,
      userId: true,
    }
  });
  assert(tradingAccount, "Trading account not found");

  // Fetch user's wallet for the base currency
  const userWallets = await api.wallet.findMany({
    filter: {
      userId: { equals: record.userId }
    },
    select: {
      id: true,
      currency: true,
      balance: true,
      availableBalance: true,
    }
  });

  // Fetch existing positions for this symbol
  const existingPositions = await api.position.findMany({
    filter: {
      userId: { equals: record.userId },
      symbol: { equals: record.symbol },
      tradingAccountId: { equals: record.tradingAccountId }
    },
    select: {
      id: true,
      quantity: true,
      side: true,
      averageEntryPrice: true,
    }
  });

  // Fetch latest market data for the symbol
  const marketDataPoints = await api.marketData.findMany({
    filter: {
      symbol: { equals: record.symbol }
    },
    sort: { timestamp: "Descending" },
    first: 50,
    select: {
      id: true,
      timestamp: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
      bidPrice: true,
      askPrice: true,
    }
  });

  assert(marketDataPoints.length > 0, "Market data unavailable for symbol");

  const latestMarketData = marketDataPoints[0];
  const currentPrice = latestMarketData.close;
  const closePrices = marketDataPoints.map(d => d.close).reverse();
  const volumes = marketDataPoints.map(d => d.volume).reverse();

  let optimizedQuantity = record.quantity;
  let signalConfidence = 100;
  let psi = 1;
  let lambda = 1;
  let xi = 1;

  if (autoOptimize) {
    // Calculate technical indicators
    const rsi = calculateRSI(closePrices, 14);
    const macd = calculateMACD(closePrices);
    const bollingerBands = calculateBollingerBands(closePrices, 20);

    // Calculate market entropy
    const entropy = calculateMarketEntropy(closePrices, volumes);

    // Generate trading signal
    const signal = generateTradingSignal({
      prices: closePrices,
      volumes,
      rsi,
      macd,
      bollingerBands,
      entropy,
      orderBook: {
        bid: latestMarketData.bidPrice || currentPrice,
        ask: latestMarketData.askPrice || currentPrice,
      }
    });

    signalConfidence = signal.confidence;

    // Check if signal confidence meets threshold
    if (signalConfidence < targetConfidence) {
      throw new Error(`Signal confidence (${signalConfidence.toFixed(2)}%) below threshold (${targetConfidence}%)`);
    }

    // Calculate volatility from close prices
    const returns = closePrices.slice(1).map((price, i) => 
      (price - closePrices[i]) / closePrices[i]
    );
    const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    // Get account balance (use first available wallet or trading account balance)
    const accountBalance = typeof tradingAccount.balance === 'object' 
      ? Object.values(tradingAccount.balance)[0] as number || 10000
      : 10000;

    // Optimize position size
    const optimizationResult = optimizePositionSize({
      accountBalance,
      riskBudget: riskBudget / 100, // Convert percentage to decimal
      volatility,
      confidence: signalConfidence / 100,
      currentPrice,
      existingPositions: existingPositions.map(p => ({
        quantity: p.quantity,
        entryPrice: p.averageEntryPrice || currentPrice,
      })),
    });

    optimizedQuantity = Math.min(record.quantity, optimizationResult.optimalSize);
    psi = optimizationResult.psi;
    lambda = optimizationResult.lambda;
    xi = optimizationResult.xi;

    logger.info({ 
      originalQuantity: record.quantity, 
      optimizedQuantity,
      signalConfidence,
      psi,
      lambda,
      xi,
    }, "Order optimization completed");
  }

  // Calculate order value
  const orderValue = optimizedQuantity * currentPrice;

  // Verify sufficient balance
  const relevantWallet = userWallets.find(w => w.currency === 'USDT' || w.currency === 'USD');
  if (relevantWallet && record.side === 'buy') {
    if (relevantWallet.availableBalance < orderValue) {
      throw new Error(`Insufficient balance. Required: ${orderValue.toFixed(2)}, Available: ${relevantWallet.availableBalance.toFixed(2)}`);
    }
  }

  // Set order fields
  record.quantity = optimizedQuantity;
  record.status = 'pending';
  record.price = record.type === 'market' ? currentPrice : record.price;
  record.metadata = {
    optimized: autoOptimize,
    confidence: signalConfidence,
    psi,
    lambda,
    xi,
    originalQuantity: params.quantity,
  };
  record.placedAt = new Date();

  // Save the order
  await save(record);

  // Handle market orders immediately
  if (record.type === 'market') {
    record.status = 'filled';
    record.filledAt = new Date();
    record.filledQuantity = optimizedQuantity;
    record.averageFillPrice = currentPrice;

    const tradeValue = optimizedQuantity * currentPrice;
    const fee = tradeValue * 0.001; // 0.1% fee

    // Create trade record
    await api.trade.create({
      user: { _link: record.userId },
      tradingAccount: { _link: record.tradingAccountId },
      order: { _link: record.id },
      symbol: record.symbol,
      side: record.side,
      quantity: optimizedQuantity,
      price: currentPrice,
      value: tradeValue,
      fee,
      feeCurrency: 'USDT',
      executedAt: new Date(),
      isMaker: false,
    });

    // Update or create position
    const existingPosition = existingPositions.find(p => p.side === (record.side === 'buy' ? 'long' : 'short'));
    
    if (existingPosition) {
      const newQuantity = existingPosition.quantity + optimizedQuantity;
      const newAvgPrice = ((existingPosition.averageEntryPrice || 0) * existingPosition.quantity + currentPrice * optimizedQuantity) / newQuantity;
      
      await api.position.update(existingPosition.id, {
        quantity: newQuantity,
        averageEntryPrice: newAvgPrice,
        currentPrice,
        lastUpdatedAt: new Date(),
      });
    } else {
      await api.position.create({
        user: { _link: record.userId },
        tradingAccount: { _link: record.tradingAccountId },
        symbol: record.symbol,
        side: record.side === 'buy' ? 'long' : 'short',
        quantity: optimizedQuantity,
        averageEntryPrice: currentPrice,
        currentPrice,
        asset: record.symbol.split('/')[0] || record.symbol,
      });
    }

    // Update wallet balances
    if (relevantWallet) {
      const newBalance = record.side === 'buy' 
        ? relevantWallet.balance - tradeValue - fee
        : relevantWallet.balance + tradeValue - fee;
      
      await api.wallet.update(relevantWallet.id, {
        balance: newBalance,
        availableBalance: newBalance,
        lastTransactionAt: new Date(),
      });
    }

    // Save updated order
    await save(record);
  }

  // Send notification
  await api.notification.create({
    user: { _link: record.userId },
    type: 'trade',
    severity: 'success',
    title: `Order ${record.type} ${record.side} executed`,
    message: `${record.side.toUpperCase()} ${optimizedQuantity} ${record.symbol} at ${currentPrice.toFixed(8)}${autoOptimize ? ` (optimized, confidence: ${signalConfidence.toFixed(1)}%)` : ''}`,
    relatedModel: 'order',
    relatedId: record.id,
  });

  logger.info({ orderId: record.id, status: record.status }, "Order execution completed");
};

export const options: ActionOptions = {
  actionType: "create",
  triggers: {
    api: true,
  },
};

export const params = {
  autoOptimize: { type: "boolean" },
  riskBudget: { type: "number" },
  targetConfidence: { type: "number" },
};
