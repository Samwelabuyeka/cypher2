/**
 * Multi-Agent Trading System
 * 
 * Implements a sophisticated trading system with multiple specialized agents
 * that can compete, cooperate, and learn from each other using swarm intelligence.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  indicators?: {
    [key: string]: number;
  };
  sentiment?: number;
  fundamentals?: {
    [key: string]: number;
  };
}

export interface TradingDecision {
  action: 'buy' | 'sell' | 'hold';
  symbol: string;
  quantity: number;
  price: number;
  confidence: number;
  reasoning: string;
  agentId: string;
  timestamp: Date;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface Performance {
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface TradeOutcome {
  decision: TradingDecision;
  actualPrice: number;
  pnl: number;
  pnlPercent: number;
  success: boolean;
}

export interface AgentInsight {
  agentId: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  reasoning: string;
  marketData: MarketData;
  timestamp: Date;
}

export interface AgentSignal {
  agentId: string;
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  confidence: number;
  timestamp: Date;
}

// ============================================================================
// Base Trading Agent (Abstract Class)
// ============================================================================

export abstract class TradingAgent {
  public id: string;
  public name: string;
  public strategy: string;
  public currentPosition: Position | null;
  public capital: number;
  public performance: Performance;
  public weight: number;
  protected trainingData: TradeOutcome[];

  constructor(
    id: string,
    name: string,
    strategy: string,
    initialCapital: number
  ) {
    this.id = id;
    this.name = name;
    this.strategy = strategy;
    this.currentPosition = null;
    this.capital = initialCapital;
    this.weight = 1.0;
    this.trainingData = [];
    this.performance = {
      totalReturn: 0,
      totalReturnPercent: 0,
      sharpeRatio: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      maxDrawdown: 0,
      profitFactor: 0,
    };
  }

  abstract decide(marketData: MarketData): TradingDecision;
  abstract learn(outcome: TradeOutcome): void;

  executeOrder(decision: TradingDecision): void {
    if (decision.action === 'buy') {
      const cost = decision.quantity * decision.price;
      if (cost <= this.capital) {
        this.capital -= cost;
        this.currentPosition = {
          symbol: decision.symbol,
          quantity: decision.quantity,
          averagePrice: decision.price,
          currentPrice: decision.price,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        };
      }
    } else if (decision.action === 'sell' && this.currentPosition) {
      const revenue = decision.quantity * decision.price;
      this.capital += revenue;
      const pnl = revenue - (this.currentPosition.averagePrice * this.currentPosition.quantity);
      this.updatePerformance(pnl, decision.price > this.currentPosition.averagePrice);
      this.currentPosition = null;
    }
  }

  updatePerformance(pnl: number, isWin: boolean): void {
    this.performance.totalReturn += pnl;
    this.performance.totalTrades++;

    if (isWin) {
      this.performance.winningTrades++;
      this.performance.averageWin =
        (this.performance.averageWin * (this.performance.winningTrades - 1) + pnl) /
        this.performance.winningTrades;
    } else {
      this.performance.losingTrades++;
      this.performance.averageLoss =
        (this.performance.averageLoss * (this.performance.losingTrades - 1) + Math.abs(pnl)) /
        this.performance.losingTrades;
    }

    this.performance.winRate =
      this.performance.totalTrades > 0
        ? this.performance.winningTrades / this.performance.totalTrades
        : 0;

    this.performance.profitFactor =
      this.performance.averageLoss > 0
        ? (this.performance.averageWin * this.performance.winningTrades) /
          (this.performance.averageLoss * this.performance.losingTrades)
        : 0;
  }

  updatePosition(currentPrice: number): void {
    if (this.currentPosition) {
      this.currentPosition.currentPrice = currentPrice;
      this.currentPosition.unrealizedPnL =
        (currentPrice - this.currentPosition.averagePrice) * this.currentPosition.quantity;
      this.currentPosition.unrealizedPnLPercent =
        ((currentPrice - this.currentPosition.averagePrice) / this.currentPosition.averagePrice) * 100;
    }
  }
}

// ============================================================================
// Specialized Agent Implementations
// ============================================================================

export class MomentumAgent extends TradingAgent {
  private momentumPeriod: number;

  constructor(id: string, initialCapital: number, momentumPeriod: number = 14) {
    super(id, 'Momentum Agent', 'momentum', initialCapital);
    this.momentumPeriod = momentumPeriod;
  }

  decide(marketData: MarketData): TradingDecision {
    const momentum = marketData.indicators?.momentum || 0;
    const rsi = marketData.indicators?.rsi || 50;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reasoning = '';

    if (momentum > 0 && rsi < 70) {
      action = 'buy';
      confidence = Math.min(momentum / 100, 0.95);
      reasoning = `Strong upward momentum detected (${momentum.toFixed(2)})`;
    } else if (momentum < 0 && rsi > 30) {
      action = 'sell';
      confidence = Math.min(Math.abs(momentum) / 100, 0.95);
      reasoning = `Strong downward momentum detected (${momentum.toFixed(2)})`;
    } else {
      confidence = 0.3;
      reasoning = 'No clear momentum signal';
    }

    return {
      action,
      symbol: marketData.symbol,
      quantity: Math.floor((this.capital * confidence) / marketData.close),
      price: marketData.close,
      confidence,
      reasoning,
      agentId: this.id,
      timestamp: new Date(),
    };
  }

  learn(outcome: TradeOutcome): void {
    this.trainingData.push(outcome);
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
    // Adjust momentum period based on success
    if (outcome.success) {
      this.momentumPeriod = Math.max(7, this.momentumPeriod - 0.1);
    } else {
      this.momentumPeriod = Math.min(21, this.momentumPeriod + 0.1);
    }
  }
}

export class MeanReversionAgent extends TradingAgent {
  private lookbackPeriod: number;
  private threshold: number;

  constructor(id: string, initialCapital: number, lookbackPeriod: number = 20) {
    super(id, 'Mean Reversion Agent', 'mean-reversion', initialCapital);
    this.lookbackPeriod = lookbackPeriod;
    this.threshold = 2.0;
  }

  decide(marketData: MarketData): TradingDecision {
    const bollingerBands = marketData.indicators?.bollingerBands || { upper: 0, middle: 0, lower: 0 };
    const price = marketData.close;
    const zScore = marketData.indicators?.zScore || 0;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reasoning = '';

    if (zScore < -this.threshold) {
      action = 'buy';
      confidence = Math.min(Math.abs(zScore) / 3, 0.95);
      reasoning = `Price significantly below mean (z-score: ${zScore.toFixed(2)})`;
    } else if (zScore > this.threshold) {
      action = 'sell';
      confidence = Math.min(Math.abs(zScore) / 3, 0.95);
      reasoning = `Price significantly above mean (z-score: ${zScore.toFixed(2)})`;
    } else {
      confidence = 0.3;
      reasoning = 'Price within normal range';
    }

    return {
      action,
      symbol: marketData.symbol,
      quantity: Math.floor((this.capital * confidence) / price),
      price,
      confidence,
      reasoning,
      agentId: this.id,
      timestamp: new Date(),
    };
  }

  learn(outcome: TradeOutcome): void {
    this.trainingData.push(outcome);
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
    // Adjust threshold based on performance
    const recentWinRate = this.trainingData.slice(-20).filter(o => o.success).length / 20;
    if (recentWinRate < 0.4) {
      this.threshold = Math.min(3.0, this.threshold + 0.1);
    } else if (recentWinRate > 0.6) {
      this.threshold = Math.max(1.5, this.threshold - 0.1);
    }
  }
}

export class ArbitrageAgent extends TradingAgent {
  private minSpread: number;

  constructor(id: string, initialCapital: number, minSpread: number = 0.005) {
    super(id, 'Arbitrage Agent', 'arbitrage', initialCapital);
    this.minSpread = minSpread;
  }

  decide(marketData: MarketData): TradingDecision {
    const bidAskSpread = marketData.indicators?.bidAskSpread || 0;
    const crossExchangeSpread = marketData.indicators?.crossExchangeSpread || 0;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reasoning = '';

    const totalSpread = Math.max(bidAskSpread, crossExchangeSpread);

    if (totalSpread > this.minSpread) {
      action = crossExchangeSpread > bidAskSpread ? 'buy' : 'sell';
      confidence = Math.min(totalSpread * 10, 0.95);
      reasoning = `Arbitrage opportunity detected with ${(totalSpread * 100).toFixed(3)}% spread`;
    } else {
      confidence = 0.2;
      reasoning = 'No significant arbitrage opportunity';
    }

    return {
      action,
      symbol: marketData.symbol,
      quantity: Math.floor((this.capital * confidence) / marketData.close),
      price: marketData.close,
      confidence,
      reasoning,
      agentId: this.id,
      timestamp: new Date(),
    };
  }

  learn(outcome: TradeOutcome): void {
    this.trainingData.push(outcome);
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
    // Adjust minimum spread threshold
    const recentProfitability = this.trainingData.slice(-10).reduce((sum, o) => sum + o.pnl, 0);
    if (recentProfitability < 0) {
      this.minSpread = Math.min(0.02, this.minSpread + 0.001);
    } else if (recentProfitability > 0) {
      this.minSpread = Math.max(0.002, this.minSpread - 0.0005);
    }
  }
}

export class SentimentAgent extends TradingAgent {
  private sentimentThreshold: number;

  constructor(id: string, initialCapital: number, sentimentThreshold: number = 0.6) {
    super(id, 'Sentiment Agent', 'sentiment', initialCapital);
    this.sentimentThreshold = sentimentThreshold;
  }

  decide(marketData: MarketData): TradingDecision {
    const sentiment = marketData.sentiment || 0.5;
    const sentimentStrength = Math.abs(sentiment - 0.5) * 2;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reasoning = '';

    if (sentiment > 0.5 + this.sentimentThreshold / 2) {
      action = 'buy';
      confidence = sentimentStrength;
      reasoning = `Highly positive sentiment detected (${(sentiment * 100).toFixed(1)}%)`;
    } else if (sentiment < 0.5 - this.sentimentThreshold / 2) {
      action = 'sell';
      confidence = sentimentStrength;
      reasoning = `Highly negative sentiment detected (${(sentiment * 100).toFixed(1)}%)`;
    } else {
      confidence = 0.3;
      reasoning = 'Neutral sentiment';
    }

    return {
      action,
      symbol: marketData.symbol,
      quantity: Math.floor((this.capital * confidence) / marketData.close),
      price: marketData.close,
      confidence,
      reasoning,
      agentId: this.id,
      timestamp: new Date(),
    };
  }

  learn(outcome: TradeOutcome): void {
    this.trainingData.push(outcome);
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
    // Adjust sentiment threshold based on accuracy
    const recentAccuracy = this.trainingData.slice(-15).filter(o => o.success).length / 15;
    if (recentAccuracy < 0.45) {
      this.sentimentThreshold = Math.min(0.8, this.sentimentThreshold + 0.05);
    } else if (recentAccuracy > 0.6) {
      this.sentimentThreshold = Math.max(0.4, this.sentimentThreshold - 0.05);
    }
  }
}

export class ValueAgent extends TradingAgent {
  private peThreshold: number;

  constructor(id: string, initialCapital: number, peThreshold: number = 15) {
    super(id, 'Value Agent', 'value', initialCapital);
    this.peThreshold = peThreshold;
  }

  decide(marketData: MarketData): TradingDecision {
    const peRatio = marketData.fundamentals?.peRatio || 20;
    const pbRatio = marketData.fundamentals?.pbRatio || 3;
    const debtToEquity = marketData.fundamentals?.debtToEquity || 1;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reasoning = '';

    const valueScore = this.calculateValueScore(peRatio, pbRatio, debtToEquity);

    if (valueScore > 0.7) {
      action = 'buy';
      confidence = valueScore;
      reasoning = `Strong fundamental value detected (PE: ${peRatio.toFixed(2)})`;
    } else if (valueScore < 0.3) {
      action = 'sell';
      confidence = 1 - valueScore;
      reasoning = `Overvalued fundamentals (PE: ${peRatio.toFixed(2)})`;
    } else {
      confidence = 0.4;
      reasoning = 'Fair valuation';
    }

    return {
      action,
      symbol: marketData.symbol,
      quantity: Math.floor((this.capital * confidence) / marketData.close),
      price: marketData.close,
      confidence,
      reasoning,
      agentId: this.id,
      timestamp: new Date(),
    };
  }

  private calculateValueScore(peRatio: number, pbRatio: number, debtToEquity: number): number {
    const peScore = peRatio < this.peThreshold ? 1 : Math.max(0, 1 - (peRatio - this.peThreshold) / this.peThreshold);
    const pbScore = pbRatio < 2 ? 1 : Math.max(0, 1 - (pbRatio - 2) / 2);
    const debtScore = debtToEquity < 1 ? 1 : Math.max(0, 1 - (debtToEquity - 1) / 2);
    return (peScore + pbScore + debtScore) / 3;
  }

  learn(outcome: TradeOutcome): void {
    this.trainingData.push(outcome);
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
  }
}

export class TechnicalAgent extends TradingAgent {
  private patterns: string[];

  constructor(id: string, initialCapital: number) {
    super(id, 'Technical Agent', 'technical', initialCapital);
    this.patterns = ['head-shoulders', 'double-top', 'double-bottom', 'triangle', 'wedge'];
  }

  decide(marketData: MarketData): TradingDecision {
    const macdSignal = marketData.indicators?.macdSignal || 0;
    const rsi = marketData.indicators?.rsi || 50;
    const stochastic = marketData.indicators?.stochastic || 50;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reasoning = '';

    const technicalScore = this.calculateTechnicalScore(macdSignal, rsi, stochastic);

    if (technicalScore > 0.65) {
      action = 'buy';
      confidence = technicalScore;
      reasoning = `Bullish technical signals (RSI: ${rsi.toFixed(2)}, MACD: ${macdSignal > 0 ? 'bullish' : 'bearish'})`;
    } else if (technicalScore < 0.35) {
      action = 'sell';
      confidence = 1 - technicalScore;
      reasoning = `Bearish technical signals (RSI: ${rsi.toFixed(2)}, MACD: ${macdSignal > 0 ? 'bullish' : 'bearish'})`;
    } else {
      confidence = 0.3;
      reasoning = 'Mixed technical signals';
    }

    return {
      action,
      symbol: marketData.symbol,
      quantity: Math.floor((this.capital * confidence) / marketData.close),
      price: marketData.close,
      confidence,
      reasoning,
      agentId: this.id,
      timestamp: new Date(),
    };
  }

  private calculateTechnicalScore(macdSignal: number, rsi: number, stochastic: number): number {
    const macdScore = macdSignal > 0 ? 0.7 : 0.3;
    const rsiScore = rsi < 30 ? 1 : rsi > 70 ? 0 : (70 - rsi) / 40;
    const stochasticScore = stochastic < 20 ? 1 : stochastic > 80 ? 0 : (80 - stochastic) / 60;
    return (macdScore + rsiScore + stochasticScore) / 3;
  }

  learn(outcome: TradeOutcome): void {
    this.trainingData.push(outcome);
    if (this.trainingData.length > 100) {
      this.trainingData.shift();
    }
  }
}

// ============================================================================
// Agent Communication System
// ============================================================================

export class AgentCommunication {
  private insights: Map<string, AgentInsight[]>;
  private signals: Map<string, AgentSignal[]>;
  private subscribers: Map<string, Set<string>>;

  constructor() {
    this.insights = new Map();
    this.signals = new Map();
    this.subscribers = new Map();
  }

  broadcastSignal(signal: AgentSignal): void {
    if (!this.signals.has(signal.symbol)) {
      this.signals.set(signal.symbol, []);
    }
    this.signals.get(signal.symbol)!.push(signal);
  }

  shareInsights(insight: AgentInsight): void {
    const { symbol } = insight.marketData;
    if (!this.insights.has(symbol)) {
      this.insights.set(symbol, []);
    }
    this.insights.get(symbol)!.push(insight);
  }

  getInsights(symbol: string): AgentInsight[] {
    return this.insights.get(symbol) || [];
  }

  getSignals(symbol: string): AgentSignal[] {
    return this.signals.get(symbol) || [];
  }

  consensusBuilding(symbol: string): { direction: 'long' | 'short' | 'neutral'; confidence: number } {
    const signals = this.getSignals(symbol);
    if (signals.length === 0) {
      return { direction: 'neutral', confidence: 0 };
    }

    let longScore = 0;
    let shortScore = 0;

    signals.forEach(signal => {
      if (signal.direction === 'long') {
        longScore += signal.strength * signal.confidence;
      } else if (signal.direction === 'short') {
        shortScore += signal.strength * signal.confidence;
      }
    });

    const totalScore = longScore + shortScore;
    if (totalScore === 0) {
      return { direction: 'neutral', confidence: 0 };
    }

    const direction = longScore > shortScore ? 'long' : shortScore > longScore ? 'short' : 'neutral';
    const confidence = Math.abs(longScore - shortScore) / totalScore;

    return { direction, confidence };
  }

  subscribe(agentId: string, symbol: string): void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    this.subscribers.get(symbol)!.add(agentId);
  }

  unsubscribe(agentId: string, symbol: string): void {
    const subscribers = this.subscribers.get(symbol);
    if (subscribers) {
      subscribers.delete(agentId);
    }
  }

  clearOldData(maxAge: number = 3600000): void {
    const cutoffTime = Date.now() - maxAge;
    
    this.insights.forEach((insights, symbol) => {
      this.insights.set(
        symbol,
        insights.filter(i => i.timestamp.getTime() > cutoffTime)
      );
    });

    this.signals.forEach((signals, symbol) => {
      this.signals.set(
        symbol,
        signals.filter(s => s.timestamp.getTime() > cutoffTime)
      );
    });
  }
}

// ============================================================================
// Agent Performance Tracker
// ============================================================================

export class AgentPerformanceTracker {
  private performanceHistory: Map<string, Performance[]>;
  private returns: Map<string, number[]>;

  constructor() {
    this.performanceHistory = new Map();
    this.returns = new Map();
  }

  trackReturns(agentId: string, returnValue: number): void {
    if (!this.returns.has(agentId)) {
      this.returns.set(agentId, []);
    }
    this.returns.get(agentId)!.push(returnValue);
  }

  trackSharpeRatio(agentId: string, riskFreeRate: number = 0.02): number {
    const returns = this.returns.get(agentId) || [];
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev === 0 ? 0 : (avgReturn - riskFreeRate) / stdDev;
  }

  rankAgents(agents: TradingAgent[]): TradingAgent[] {
    return agents.sort((a, b) => {
      const scoreA = this.calculateAgentScore(a);
      const scoreB = this.calculateAgentScore(b);
      return scoreB - scoreA;
    });
  }

  private calculateAgentScore(agent: TradingAgent): number {
    const sharpeRatio = this.trackSharpeRatio(agent.id);
    const winRate = agent.performance.winRate;
    const profitFactor = agent.performance.profitFactor;
    const totalReturn = agent.performance.totalReturnPercent;

    return (
      sharpeRatio * 0.3 +
      winRate * 0.25 +
      profitFactor * 0.25 +
      totalReturn * 0.2
    );
  }

  adjustWeights(agents: TradingAgent[]): void {
    const rankedAgents = this.rankAgents(agents);
    const totalScore = rankedAgents.reduce((sum, agent) => sum + this.calculateAgentScore(agent), 0);

    if (totalScore === 0) {
      agents.forEach(agent => {
        agent.weight = 1.0 / agents.length;
      });
      return;
    }

    rankedAgents.forEach(agent => {
      const score = this.calculateAgentScore(agent);
      agent.weight = score / totalScore;
    });
  }

  recordPerformance(agentId: string, performance: Performance): void {
    if (!this.performanceHistory.has(agentId)) {
      this.performanceHistory.set(agentId, []);
    }
    this.performanceHistory.get(agentId)!.push({ ...performance });
  }

  getPerformanceHistory(agentId: string): Performance[] {
    return this.performanceHistory.get(agentId) || [];
  }
}

// ============================================================================
// Agent Coordinator
// ============================================================================

export class AgentCoordinator {
  private agents: Map<string, TradingAgent>;
  private communication: AgentCommunication;
  private performanceTracker: AgentPerformanceTracker;
  private totalCapital: number;

  constructor(totalCapital: number) {
    this.agents = new Map();
    this.communication = new AgentCommunication();
    this.performanceTracker = new AgentPerformanceTracker();
    this.totalCapital = totalCapital;
  }

  registerAgent(agent: TradingAgent): void {
    this.agents.set(agent.id, agent);
    this.allocateCapital();
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.allocateCapital();
  }

  coordinateActions(marketData: MarketData): TradingDecision[] {
    const decisions: TradingDecision[] = [];
    const conflictMap: Map<string, TradingDecision[]> = new Map();

    this.agents.forEach(agent => {
      const decision = agent.decide(marketData);
      decisions.push(decision);

      const key = `${decision.symbol}-${decision.action}`;
      if (!conflictMap.has(key)) {
        conflictMap.set(key, []);
      }
      conflictMap.get(key)!.push(decision);

      const signal: AgentSignal = {
        agentId: agent.id,
        symbol: marketData.symbol,
        direction: decision.action === 'buy' ? 'long' : decision.action === 'sell' ? 'short' : 'neutral',
        strength: decision.confidence,
        confidence: decision.confidence,
        timestamp: new Date(),
      };
      this.communication.broadcastSignal(signal);
    });

    return this.resolveConflicts(decisions);
  }

  private resolveConflicts(decisions: TradingDecision[]): TradingDecision[] {
    const buyDecisions = decisions.filter(d => d.action === 'buy');
    const sellDecisions = decisions.filter(d => d.action === 'sell');

    if (buyDecisions.length > 0 && sellDecisions.length > 0) {
      const buyConfidence = buyDecisions.reduce((sum, d) => {
        const agent = this.agents.get(d.agentId);
        return sum + d.confidence * (agent?.weight || 1);
      }, 0);

      const sellConfidence = sellDecisions.reduce((sum, d) => {
        const agent = this.agents.get(d.agentId);
        return sum + d.confidence * (agent?.weight || 1);
      }, 0);

      if (Math.abs(buyConfidence - sellConfidence) < 0.2) {
        return decisions.filter(d => d.action === 'hold');
      }

      return buyConfidence > sellConfidence ? buyDecisions : sellDecisions;
    }

    return decisions.filter(d => d.action !== 'hold');
  }

  allocateCapital(): void {
    const agentCount = this.agents.size;
    if (agentCount === 0) return;

    this.performanceTracker.adjustWeights(Array.from(this.agents.values()));

    this.agents.forEach(agent => {
      agent.capital = this.totalCapital * agent.weight;
    });
  }

  recordOutcome(agentId: string, outcome: TradeOutcome): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.learn(outcome);
      this.performanceTracker.trackReturns(agentId, outcome.pnl);
      this.performanceTracker.recordPerformance(agentId, agent.performance);
    }
  }

  getTopAgents(count: number = 3): TradingAgent[] {
    const ranked = this.performanceTracker.rankAgents(Array.from(this.agents.values()));
    return ranked.slice(0, count);
  }

  getConsensus(symbol: string): { direction: 'long' | 'short' | 'neutral'; confidence: number } {
    return this.communication.consensusBuilding(symbol);
  }

  cleanup(): void {
    this.communication.clearOldData();
  }
}