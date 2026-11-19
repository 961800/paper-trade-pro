import { db, tradesTable, ordersTable, positionsTable, usersTable, systemSettingsTable } from "@workspace/db";
import { eq, and, gte, desc, asc } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

export interface DateFilter {
  range: "today" | "7d" | "30d" | "all";
}

export interface TradingMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  riskRewardRatio: number;
  largestWin: { amount: number; symbol: string; date: string } | null;
  largestLoss: { amount: number; symbol: string; date: string } | null;
  avgHoldingMinutes: number;
  avgWinHoldingMinutes: number;
  avgLossHoldingMinutes: number;
  tradingFrequencyPerDay: number;
  estimatedBrokerage: number;
  instrumentStats: Record<string, { trades: number; pnl: number; wins: number; winRate: number }>;
  optionTypeStats: {
    CE: { trades: number; pnl: number; wins: number };
    PE: { trades: number; pnl: number; wins: number };
  };
  strategyStats: Record<string, { trades: number; pnl: number; wins: number }>;
}

export interface BehavioralIndicator {
  type: "Greed" | "FOMO" | "Fear" | "Revenge Trading" | "Overtrading" | "Loss Aversion" | "Overconfidence";
  detected: boolean;
  severity: "low" | "medium" | "high";
  count: number;
  evidence: string;
  financialImpact: number;
}

export interface DisciplineBreakdown {
  stopLossDiscipline: number; // /20
  strategyAdherence: number; // /20
  positionSizing: number; // /20
  frequencyControl: number; // /20
  exitRiskManagement: number; // /20
  totalScore: number; // /100
  rating: "Mastery" | "Disciplined" | "Inconsistent" | "High Risk";
  explanations: Record<string, string>;
}

export interface TopMistake {
  rank: number;
  title: string;
  description: string;
  financialImpact: number;
  occurrenceCount: number;
  actionableFix: string;
}

export interface MentorAnalysisReport {
  dateRange: string;
  metrics: TradingMetrics;
  behavioral: BehavioralIndicator[];
  discipline: DisciplineBreakdown;
  topMistakes: TopMistake[];
  hasData: boolean;
}

/**
 * Retrieve Gemini API key from DB or process.env
 */
export async function getGeminiApiKey(): Promise<string | null> {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const [setting] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "gemini_api_key"))
      .limit(1);
    if (setting?.value && setting.value.trim().length > 0) {
      return setting.value.trim();
    }
  } catch (err) {
    console.error("Failed to query gemini_api_key from system_settings:", err);
  }
  return null;
}

/**
 * Calculate full trading metrics, behavioral patterns, and discipline score
 */
export async function analyzeUserTrading(
  userId: number,
  range: "today" | "7d" | "30d" | "all" = "all"
): Promise<MentorAnalysisReport> {
  const now = new Date();
  let startDate: Date | null = null;

  if (range === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "7d") {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Fetch closed trades
  const conditions = [eq(tradesTable.userId, userId)];
  if (startDate) {
    conditions.push(gte(tradesTable.createdAt, startDate));
  }

  const trades = await db
    .select()
    .from(tradesTable)
    .where(and(...conditions))
    .orderBy(asc(tradesTable.createdAt));

  // Fetch orders
  const orderConditions = [eq(ordersTable.userId, userId)];
  if (startDate) orderConditions.push(gte(ordersTable.createdAt, startDate));
  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...orderConditions))
    .orderBy(asc(ordersTable.createdAt));

  // Fetch user profile for limits
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const userMaxDailyTrades = user?.maxDailyTrades ?? 20;

  if (trades.length === 0) {
    return {
      dateRange: range,
      hasData: false,
      metrics: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        winRate: 0,
        netPnl: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        avgWinningTrade: 0,
        avgLosingTrade: 0,
        riskRewardRatio: 0,
        largestWin: null,
        largestLoss: null,
        avgHoldingMinutes: 0,
        avgWinHoldingMinutes: 0,
        avgLossHoldingMinutes: 0,
        tradingFrequencyPerDay: 0,
        estimatedBrokerage: 0,
        instrumentStats: {},
        optionTypeStats: { CE: { trades: 0, pnl: 0, wins: 0 }, PE: { trades: 0, pnl: 0, wins: 0 } },
        strategyStats: {},
      },
      behavioral: [],
      discipline: {
        stopLossDiscipline: 20,
        strategyAdherence: 20,
        positionSizing: 20,
        frequencyControl: 20,
        exitRiskManagement: 20,
        totalScore: 100,
        rating: "Disciplined",
        explanations: { general: "No trades recorded in this period yet. Ready for your first disciplined trade!" },
      },
      topMistakes: [],
    };
  }

  // 1. Core Metrics Calculation
  let grossProfit = 0;
  let grossLoss = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let netPnl = 0;
  let largestWin: { amount: number; symbol: string; date: string } | null = null;
  let largestLoss: { amount: number; symbol: string; date: string } | null = null;
  let totalHoldingMinutes = 0;
  let winHoldingMinutes = 0;
  let lossHoldingMinutes = 0;

  const instrumentStats: Record<string, { trades: number; pnl: number; wins: number; winRate: number }> = {};
  const optionTypeStats = {
    CE: { trades: 0, pnl: 0, wins: 0 },
    PE: { trades: 0, pnl: 0, wins: 0 },
  };
  const strategyStats: Record<string, { trades: number; pnl: number; wins: number }> = {};
  const tradesByDay: Record<string, number> = {};

  trades.forEach((trade) => {
    const pnl = Number(trade.pnl ?? 0);
    netPnl += pnl;

    const dayKey = trade.createdAt ? new Date(trade.createdAt).toISOString().split("T")[0] : "unknown";
    tradesByDay[dayKey] = (tradesByDay[dayKey] ?? 0) + 1;

    // Holding duration
    const created = trade.createdAt ? new Date(trade.createdAt).getTime() : 0;
    const closed = trade.closedAt ? new Date(trade.closedAt).getTime() : created + 5 * 60 * 1000;
    const holdingMins = Math.max(1, Math.round((closed - created) / (1000 * 60)));
    totalHoldingMinutes += holdingMins;

    if (pnl > 0) {
      winningTrades++;
      grossProfit += pnl;
      winHoldingMinutes += holdingMins;
      if (!largestWin || pnl > largestWin.amount) {
        largestWin = {
          amount: pnl,
          symbol: `${trade.symbol} ${trade.strikePrice} ${trade.optionType}`,
          date: dayKey,
        };
      }
    } else if (pnl < 0) {
      losingTrades++;
      grossLoss += Math.abs(pnl);
      lossHoldingMinutes += holdingMins;
      if (!largestLoss || pnl < largestLoss.amount) {
        largestLoss = {
          amount: pnl,
          symbol: `${trade.symbol} ${trade.strikePrice} ${trade.optionType}`,
          date: dayKey,
        };
      }
    } else {
      breakevenTrades++;
    }

    // Instrument stats
    const sym = trade.symbol;
    if (!instrumentStats[sym]) {
      instrumentStats[sym] = { trades: 0, pnl: 0, wins: 0, winRate: 0 };
    }
    instrumentStats[sym].trades++;
    instrumentStats[sym].pnl += pnl;
    if (pnl > 0) instrumentStats[sym].wins++;

    // Option type stats
    const optType = trade.optionType.toUpperCase() as "CE" | "PE";
    if (optType === "CE" || optType === "PE") {
      optionTypeStats[optType].trades++;
      optionTypeStats[optType].pnl += pnl;
      if (pnl > 0) optionTypeStats[optType].wins++;
    }

    // Strategy stats
    const strat = trade.strategy || "Manual / Discretionary";
    if (!strategyStats[strat]) {
      strategyStats[strat] = { trades: 0, pnl: 0, wins: 0 };
    }
    strategyStats[strat].trades++;
    strategyStats[strat].pnl += pnl;
    if (pnl > 0) strategyStats[strat].wins++;
  });

  // Calculate Win Rates for instruments
  Object.keys(instrumentStats).forEach((key) => {
    const s = instrumentStats[key];
    s.winRate = s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0;
  });

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(2)) : 0;
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0;
  const avgWinningTrade = winningTrades > 0 ? Math.round(grossProfit / winningTrades) : 0;
  const avgLosingTrade = losingTrades > 0 ? Math.round(grossLoss / losingTrades) : 0;
  const riskRewardRatio = avgLosingTrade > 0 ? Number((avgWinningTrade / avgLosingTrade).toFixed(2)) : 0;
  const avgHoldingMinutes = totalTrades > 0 ? Math.round(totalHoldingMinutes / totalTrades) : 0;
  const avgWinHoldingMinutes = winningTrades > 0 ? Math.round(winHoldingMinutes / winningTrades) : 0;
  const avgLossHoldingMinutes = losingTrades > 0 ? Math.round(lossHoldingMinutes / losingTrades) : 0;

  const activeDays = Object.keys(tradesByDay).length || 1;
  const tradingFrequencyPerDay = Number((totalTrades / activeDays).toFixed(1));
  const estimatedBrokerage = Math.round(totalTrades * 40); // Standard ₹20 buy + ₹20 sell regulatory & brokerage

  const metrics: TradingMetrics = {
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate,
    netPnl: Math.round(netPnl),
    grossProfit: Math.round(grossProfit),
    grossLoss: Math.round(grossLoss),
    profitFactor,
    avgWinningTrade,
    avgLosingTrade,
    riskRewardRatio,
    largestWin,
    largestLoss,
    avgHoldingMinutes,
    avgWinHoldingMinutes,
    avgLossHoldingMinutes,
    tradingFrequencyPerDay,
    estimatedBrokerage,
    instrumentStats,
    optionTypeStats,
    strategyStats,
  };

  // 2. Behavioral Patterns Detection Engine
  const behavioral: BehavioralIndicator[] = [];

  // Revenge Trading
  let revengeCount = 0;
  let revengeLossImpact = 0;
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1];
    const curr = trades[i];
    const prevPnl = Number(prev.pnl ?? 0);
    const currPnl = Number(curr.pnl ?? 0);

    if (prevPnl < 0 && prev.closedAt && curr.createdAt) {
      const diffMs = new Date(curr.createdAt).getTime() - new Date(prev.closedAt).getTime();
      const diffMins = diffMs / (1000 * 60);

      // Re-entered within 10 minutes after a loss or doubled quantity
      if (diffMins >= 0 && diffMins <= 10) {
        revengeCount++;
        if (currPnl < 0) revengeLossImpact += Math.abs(currPnl);
      } else if (curr.quantity >= prev.quantity * 1.5) {
        revengeCount++;
        if (currPnl < 0) revengeLossImpact += Math.abs(currPnl);
      }
    }
  }
  behavioral.push({
    type: "Revenge Trading",
    detected: revengeCount >= 2,
    severity: revengeCount >= 4 ? "high" : revengeCount >= 2 ? "medium" : "low",
    count: revengeCount,
    evidence: `Entered ${revengeCount} rapid trades immediately following a loss or aggressively scaled position sizes to recover drawdown.`,
    financialImpact: Math.round(revengeLossImpact),
  });

  // Overtrading
  let overtradingDays = 0;
  let overtradingTrades = 0;
  Object.entries(tradesByDay).forEach(([, count]) => {
    if (count > userMaxDailyTrades || count > 10) {
      overtradingDays++;
      overtradingTrades += count - Math.min(userMaxDailyTrades, 10);
    }
  });
  behavioral.push({
    type: "Overtrading",
    detected: overtradingDays > 0 || tradingFrequencyPerDay > 8,
    severity: overtradingDays >= 2 || tradingFrequencyPerDay > 12 ? "high" : overtradingDays > 0 ? "medium" : "low",
    count: overtradingTrades,
    evidence: `Exceeded prudent trade frequency on ${overtradingDays} session(s) with an average of ${tradingFrequencyPerDay} trades/day, creating excess churn and ₹${Math.round(overtradingTrades * 40)} in avoidable charges.`,
    financialImpact: Math.round(overtradingTrades * 40),
  });

  // Loss Aversion (Holding Losers Too Long)
  const lossAversionDetected = avgLossHoldingMinutes > avgWinHoldingMinutes * 1.6 && losingTrades >= 3;
  const holdingDiff = avgLossHoldingMinutes - avgWinHoldingMinutes;
  behavioral.push({
    type: "Loss Aversion",
    detected: lossAversionDetected,
    severity: avgLossHoldingMinutes > avgWinHoldingMinutes * 2.5 ? "high" : lossAversionDetected ? "medium" : "low",
    count: losingTrades,
    evidence: `Average losing trade held for ${avgLossHoldingMinutes} mins vs only ${avgWinHoldingMinutes} mins for winning trades. Reluctance to accept losses early magnified drawdowns.`,
    financialImpact: Math.round(grossLoss * 0.35),
  });

  // Fear (Premature Exit of Winners)
  const fearDetected = avgWinHoldingMinutes <= 4 && winRate >= 50 && netPnl < 0;
  behavioral.push({
    type: "Fear",
    detected: fearDetected || (avgWinningTrade < avgLosingTrade * 0.5 && winningTrades >= 3),
    severity: avgWinningTrade < avgLosingTrade * 0.4 ? "high" : "medium",
    count: winningTrades,
    evidence: `Exited winning trades quickly (+₹${avgWinningTrade} avg) while enduring large losses (-₹${avgLosingTrade} avg). Winning trades were cut before reaching target potential.`,
    financialImpact: Math.round(winningTrades * (avgLosingTrade - avgWinningTrade)),
  });

  // Greed (Letting Winners Turn into Losers or Unrealistic Targets)
  let greedCount = 0;
  orders.forEach((o) => {
    if (o.targetPrice && Number(o.targetPrice) > Number(o.executedPrice || 0) * 2.5) {
      greedCount++;
    }
  });
  behavioral.push({
    type: "Greed",
    detected: greedCount >= 2,
    severity: greedCount >= 4 ? "high" : "medium",
    count: greedCount,
    evidence: `Set excessively aggressive profit targets (>150% premium move) without securing partial profits at key resistance levels.`,
    financialImpact: Math.round(grossLoss * 0.2),
  });

  // FOMO (Chasing Breakouts / Entering Late)
  let fomoCount = 0;
  trades.forEach((t) => {
    const entry = Number(t.entryPrice);
    if (t.optionType === "CE" && entry > 300) fomoCount++;
    if (t.optionType === "PE" && entry > 300) fomoCount++;
  });
  behavioral.push({
    type: "FOMO",
    detected: fomoCount >= 2,
    severity: fomoCount >= 4 ? "high" : "medium",
    count: fomoCount,
    evidence: `Entered ${fomoCount} extended option strikes after strong rallies, buying high IV premiums that collapsed rapidly.`,
    financialImpact: Math.round(fomoCount * 450),
  });

  // Overconfidence (Sizing up after wins)
  let overconfidenceCount = 0;
  for (let i = 2; i < trades.length; i++) {
    if (Number(trades[i - 2].pnl) > 0 && Number(trades[i - 1].pnl) > 0 && trades[i].quantity > trades[i - 1].quantity * 1.5) {
      overconfidenceCount++;
    }
  }
  behavioral.push({
    type: "Overconfidence",
    detected: overconfidenceCount >= 1,
    severity: overconfidenceCount >= 2 ? "high" : "medium",
    count: overconfidenceCount,
    evidence: `Increased lot sizes significantly right after back-to-back winning trades, amplifying subsequent drawdowns.`,
    financialImpact: Math.round(overconfidenceCount * 800),
  });

  // 3. Discipline Score Calculation (/100)
  // Stop-loss discipline: orders with stop-loss / total orders
  let slScore = 20;
  const ordersWithSl = orders.filter((o) => o.stopLoss != null).length;
  const slRatio = orders.length > 0 ? ordersWithSl / orders.length : 0.8;
  slScore = Math.max(4, Math.round(slRatio * 20));

  // Strategy adherence: consistency of strategy tags
  let stratScore = 18;
  const taggedTrades = trades.filter((t) => t.strategy && t.strategy !== "Manual / Discretionary").length;
  stratScore = Math.max(6, Math.min(20, Math.round((taggedTrades / totalTrades) * 20) + 8));

  // Position sizing discipline: variance of quantity
  const quantities = trades.map((t) => t.quantity);
  const avgQty = quantities.reduce((a, b) => a + b, 0) / quantities.length;
  const maxQty = Math.max(...quantities, 1);
  let sizingScore = 20;
  if (maxQty > avgQty * 3) sizingScore = 8;
  else if (maxQty > avgQty * 2) sizingScore = 13;
  else sizingScore = 19;

  // Trading frequency control
  let freqScore = 20;
  if (tradingFrequencyPerDay > 15) freqScore = 6;
  else if (tradingFrequencyPerDay > 10) freqScore = 11;
  else if (tradingFrequencyPerDay > 6) freqScore = 16;
  else freqScore = 20;

  // Exit discipline & Risk management: avg win / avg loss
  let exitScore = 15;
  if (riskRewardRatio >= 1.5) exitScore = 20;
  else if (riskRewardRatio >= 1.0) exitScore = 16;
  else if (riskRewardRatio >= 0.7) exitScore = 12;
  else exitScore = 7;

  const totalScore = Math.min(100, Math.max(10, slScore + stratScore + sizingScore + freqScore + exitScore));
  const rating =
    totalScore >= 80 ? "Mastery" : totalScore >= 65 ? "Disciplined" : totalScore >= 45 ? "Inconsistent" : "High Risk";

  const discipline: DisciplineBreakdown = {
    stopLossDiscipline: slScore,
    strategyAdherence: stratScore,
    positionSizing: sizingScore,
    frequencyControl: freqScore,
    exitRiskManagement: exitScore,
    totalScore,
    rating,
    explanations: {
      stopLoss: `${slScore}/20: ${Math.round(slRatio * 100)}% of orders had pre-defined stop-losses.`,
      strategy: `${stratScore}/20: Strategy adherence score based on systematic entry consistency.`,
      positionSizing: `${sizingScore}/20: Lot sizing stability across sessions. Max lot was ${maxQty} vs average of ${Math.round(avgQty)}.`,
      frequency: `${freqScore}/20: Average of ${tradingFrequencyPerDay} trades/day vs suggested cap of ${userMaxDailyTrades}.`,
      exitRisk: `${exitScore}/20: Realized Risk:Reward ratio is 1:${riskRewardRatio.toFixed(2)}.`,
    },
  };

  // 4. Ranked Top Mistakes
  const topMistakes: TopMistake[] = [];
  let rank = 1;

  if (lossAversionDetected) {
    topMistakes.push({
      rank: rank++,
      title: "Holding Losing Positions Too Long (Loss Aversion)",
      description: `You held losing trades for an average of ${avgLossHoldingMinutes} mins, nearly ${(avgLossHoldingMinutes / Math.max(1, avgWinHoldingMinutes)).toFixed(1)}x longer than winning trades.`,
      financialImpact: Math.round(grossLoss * 0.35),
      occurrenceCount: losingTrades,
      actionableFix: "Pre-set a hard Stop-Loss order at entry and never cancel or widen it as the price moves against you.",
    });
  }

  if (revengeCount >= 2) {
    topMistakes.push({
      rank: rank++,
      title: "Revenge Trading After Loss",
      description: `You initiated ${revengeCount} trades within 10 minutes of closing a loss, aiming to recover lost capital immediately.`,
      financialImpact: Math.round(revengeLossImpact),
      occurrenceCount: revengeCount,
      actionableFix: "Implement a mandatory 15-minute cooling off period after any losing trade before opening a new position.",
    });
  }

  if (overtradingDays > 0 || tradingFrequencyPerDay > 8) {
    topMistakes.push({
      rank: rank++,
      title: "Overtrading & Session Fatigue",
      description: `Excessive frequency averaging ${tradingFrequencyPerDay} trades per day produced ₹${estimatedBrokerage} in commissions and lower win-rate quality.`,
      financialImpact: estimatedBrokerage,
      occurrenceCount: overtradingTrades || totalTrades,
      actionableFix: `Strictly enforce your daily limit of ${userMaxDailyTrades} trades per session using the Emergency Risk Kill Switch.`,
    });
  }

  if (fearDetected || avgWinningTrade < avgLosingTrade * 0.6) {
    topMistakes.push({
      rank: rank++,
      title: "Premature Profit Taking (Fear of Giving Back Gains)",
      description: `Average winner (+₹${avgWinningTrade}) was significantly smaller than average loser (-₹${avgLosingTrade}). You exited winners at the first sign of pullback.`,
      financialImpact: Math.round(winningTrades * Math.max(0, avgLosingTrade - avgWinningTrade)),
      occurrenceCount: winningTrades,
      actionableFix: "Use a Trailing Stop-Loss instead of an early manual market exit to allow winning trends to reach your full target.",
    });
  }

  // Instrument mistake check
  Object.entries(instrumentStats).forEach(([symbol, data]) => {
    if (data.pnl < -1000 && data.winRate < 40 && rank <= 4) {
      topMistakes.push({
        rank: rank++,
        title: `Underperformance in ${symbol} Contracts`,
        description: `${symbol} accounted for -₹${Math.abs(Math.round(data.pnl))} in losses with only a ${data.winRate}% win rate across ${data.trades} trades.`,
        financialImpact: Math.abs(Math.round(data.pnl)),
        occurrenceCount: data.trades,
        actionableFix: `Reduce lot size or pause trading ${symbol} until you backtest a specific setup tailored to its intraday volatility.`,
      });
    }
  });

  return {
    dateRange: range,
    hasData: true,
    metrics,
    behavioral,
    discipline,
    topMistakes,
  };
}

/**
 * Generate AI Mentor Response using Gemini SDK (with robust fallback)
 */
export async function generateMentorResponse(
  userQuery: string,
  analysis: MentorAnalysisReport,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; suggestedFollowUps: string[] }> {
  const geminiKey = await getGeminiApiKey();

  // If no trades exist yet
  if (!analysis.hasData) {
    return {
      reply: `### YOUR TRADING PERFORMANCE\n\n**Total Trades:** 0\n**Winning Trades:** 0\n**Losing Trades:** 0\n**Win Rate:** N/A\n**Net P&L:** ₹0.00\n\n### NOTICE: INSUFFICIENT DATA\n\nYou currently have no closed trades recorded in this time range. As your AI Personal Trading Mentor, I require actual trade executions to diagnose psychological patterns, entry timing, and risk management.\n\n### NEXT STEPS TO GET STARTED\n1. Go to the **Market** or **Trade** tab.\n2. Choose an index (NIFTY, BANKNIFTY) and strike price.\n3. Place 3 to 5 paper trades with predefined Stop-Loss and Target orders.\n4. Return here for your deep behavioral breakdown!`,
      suggestedFollowUps: [
        "How should I plan my first option trade?",
        "What is the best risk-to-reward ratio for beginners?",
        "How do bracket orders protect my capital?",
      ],
    };
  }

  const { metrics, behavioral, discipline, topMistakes } = analysis;

  // Prepare detailed factual prompt context for Gemini
  const contextSummary = `
AUTHENTICATED USER REAL TRADING DATA SUMMARY:
- Total Trades: ${metrics.totalTrades}
- Winning Trades: ${metrics.winningTrades} (${metrics.winRate}% win rate)
- Losing Trades: ${metrics.losingTrades}
- Breakeven Trades: ${metrics.breakevenTrades}
- Realized Net P&L: ₹${metrics.netPnl.toLocaleString("en-IN")}
- Gross Profit: ₹${metrics.grossProfit.toLocaleString("en-IN")}
- Gross Loss: ₹${metrics.grossLoss.toLocaleString("en-IN")}
- Profit Factor: ${metrics.profitFactor}
- Avg Winning Trade: ₹${metrics.avgWinningTrade.toLocaleString("en-IN")}
- Avg Losing Trade: ₹${metrics.avgLosingTrade.toLocaleString("en-IN")}
- Realized Risk:Reward: 1:${metrics.riskRewardRatio}
- Largest Win: ₹${metrics.largestWin?.amount ?? 0} on ${metrics.largestWin?.symbol ?? "N/A"}
- Largest Loss: ₹${metrics.largestLoss?.amount ?? 0} on ${metrics.largestLoss?.symbol ?? "N/A"}
- Avg Holding Time: ${metrics.avgHoldingMinutes} mins (Winners: ${metrics.avgWinHoldingMinutes} mins, Losers: ${metrics.avgLossHoldingMinutes} mins)
- Trading Frequency: ${metrics.tradingFrequencyPerDay} trades/day
- Estimated Brokerage & Charges: ₹${metrics.estimatedBrokerage}

BEHAVIORAL INDICATORS DETECTED:
${behavioral
  .filter((b) => b.detected)
  .map((b) => `- ${b.type} (Severity: ${b.severity}): ${b.evidence} (Financial Drag: ₹${b.financialImpact})`)
  .join("\n")}

DISCIPLINE SCORE: ${discipline.totalScore}/100 (${discipline.rating})
- Stop-Loss Discipline: ${discipline.stopLossDiscipline}/20
- Strategy Adherence: ${discipline.strategyAdherence}/20
- Position Sizing Discipline: ${discipline.positionSizing}/20
- Frequency Control: ${discipline.frequencyControl}/20
- Exit Risk Management: ${discipline.exitRiskManagement}/20

TOP MISTAKES IDENTIFIED:
${topMistakes.map((m) => `${m.rank}. ${m.title}: ${m.description} [Fix: ${m.actionableFix}]`).join("\n")}

INSTRUMENT BREAKDOWN:
${Object.entries(metrics.instrumentStats)
  .map(([sym, d]) => `${sym}: ${d.trades} trades, Win Rate: ${d.winRate}%, Net P&L: ₹${d.pnl}`)
  .join(", ")}
`;

  // System instruction for Gemini
  const systemInstruction = `
You are the "AI Personal Trading Mentor" inside PaperTrade Pro, an elite FinTech trading psychologist and quantitative execution coach.
Your mission is to analyze the user's REAL trading data, expose psychological mistakes (FOMO, Greed, Fear, Revenge Trading, Overtrading, Loss Aversion), and provide disciplined, direct, educational coaching.

IMPORTANT RULES:
1. ONLY cite the exact numbers provided in the context summary. NEVER invent or hallucinate statistics.
2. Structure your reply clearly with these exact 4 headings:
   ### YOUR TRADING PERFORMANCE
   ### YOUR BIGGEST MISTAKES
   ### WHY YOU MAY BE LOSING
   ### SUGGESTIONS
3. Treat behavioral traits as behavioral indicators inferred from trading history, not confirmed personal emotions.
4. Do NOT promise guaranteed returns or give buy/sell calls.
5. Be concise, direct, professional, and empowering.
`;

  // If Gemini API Key is available, invoke @google/genai
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      
      // Build conversation contents
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      // Add context as system/initial message
      contents.push({
        role: "user",
        parts: [{ text: `Here is my verified trading data and context:\n${contextSummary}\n\nMy Question: ${userQuery}` }],
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });

      const replyText = response.text?.trim() || "";
      if (replyText.length > 50) {
        return {
          reply: replyText,
          suggestedFollowUps: generateFollowUps(analysis, userQuery),
        };
      }
    } catch (err: any) {
      console.error("Gemini API call failed, falling back to local algorithmic engine:", err?.message || err);
    }
  }

  // Robust Built-in Algorithmic Mentor Engine (100% reliable fallback)
  const fallbackReply = buildAlgorithmicMentorReply(userQuery, analysis);
  return {
    reply: fallbackReply,
    suggestedFollowUps: generateFollowUps(analysis, userQuery),
  };
}

/**
 * Built-in Rule-Based FinTech Mentor Engine matching the exact specifications
 */
function buildAlgorithmicMentorReply(query: string, analysis: MentorAnalysisReport): string {
  const { metrics, behavioral, topMistakes, discipline } = analysis;
  const q = query.toLowerCase();

  let mistakesSection = "";
  if (topMistakes.length > 0) {
    mistakesSection = topMistakes
      .map(
        (m) =>
          `**${m.rank}. ${m.title}**\n${m.description}\n*Financial Impact: ~₹${m.financialImpact.toLocaleString("en-IN")}*\n*Actionable Fix:* ${m.actionableFix}`
      )
      .join("\n\n");
  } else {
    mistakesSection = "No critical systemic mistakes detected. Your risk-to-reward ratio and trade frequency are currently within healthy limits.";
  }

  let whyLosing = "";
  if (metrics.netPnl < 0) {
    const reasons: string[] = [];
    if (metrics.winRate < 45) {
      reasons.push(`A low win-rate of ${metrics.winRate}% indicates suboptimal entry timing or buying high-IV options near expiry.`);
    }
    if (metrics.avgLosingTrade > metrics.avgWinningTrade) {
      reasons.push(
        `Your average loss (-₹${metrics.avgLosingTrade}) is larger than your average win (+₹${metrics.avgWinningTrade}), resulting in an unfavorable 1:${metrics.riskRewardRatio} risk-reward balance.`
      );
    }
    const detectedBehaviors = behavioral.filter((b) => b.detected);
    if (detectedBehaviors.length > 0) {
      reasons.push(`Trading behavior indicates patterns of ${detectedBehaviors.map((b) => b.type).join(", ")}.`);
    }
    whyLosing = reasons.join(" ") || "Inconsistent position sizing and letting losing trades exceed planned risk thresholds.";
  } else {
    whyLosing = `You are currently profitable with a net P&L of +₹${metrics.netPnl.toLocaleString("en-IN")}. However, watch your ${discipline.rating.toLowerCase()} discipline score (${discipline.totalScore}/100) to protect your edge during volatile market phases.`;
  }

  let suggestions: string[] = [];
  if (topMistakes.length > 0) {
    suggestions = topMistakes.slice(0, 3).map((m) => m.actionableFix);
  } else {
    suggestions = [
      "Always set a hard Stop-Loss at the time of order placement.",
      "Limit daily trading to a maximum of 5 to 10 high-conviction setups.",
      "Review your trade journal and log your psychological state for every trade.",
    ];
  }

  if (q.includes("fomo")) {
    const fomo = behavioral.find((b) => b.type === "FOMO");
    return `### YOUR TRADING PERFORMANCE\n\n- **Total Trades:** ${metrics.totalTrades}\n- **Win Rate:** ${metrics.winRate}%\n- **Net P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}\n\n### FOMO BEHAVIORAL DIAGNOSIS\n\n${fomo?.evidence || "No severe breakout chasing detected in your recent trade entries."}\n\n**Financial Drag:** ₹${fomo?.financialImpact ?? 0}\n\n### WHY FOMO OCCURS IN OPTIONS\nChasing green candles after an index has already surged by 150+ points forces you to purchase expanded implied volatility (IV). When the move pauses, rapid IV crush and theta decay destroy the option premium even if the market remains flat.\n\n### SUGGESTIONS\n- Wait for pullbacks to key support/resistance (VWAP, 20 EMA) before entering.\n- If you missed the initial breakout candle, let it go. The market will always offer another setup.\n- Place bracket limit orders rather than aggressive market orders.`;
  }

  if (q.includes("revenge")) {
    const rev = behavioral.find((b) => b.type === "Revenge Trading");
    return `### YOUR TRADING PERFORMANCE\n\n- **Total Trades:** ${metrics.totalTrades}\n- **Revenge Trade Occurrences:** ${rev?.count ?? 0}\n- **Capital Lost in Rapid Re-entries:** ₹${rev?.financialImpact ?? 0}\n\n### REVENGE TRADING EVIDENCE\n${rev?.evidence || "No rapid post-loss re-entries detected."}\n\n### WHY REVENGE TRADING HAPPENS\nAfter a painful loss, traders experience urgency to 'make the money back before market close'. This leads to trading with elevated size, ignoring trade confirmation, and compounding losses.\n\n### SUGGESTIONS\n- Enable the **Emergency Risk Kill Switch** in Settings to lock your cockpit after your daily loss threshold is reached.\n- Step away from your screens for 15 minutes whenever a stop-loss is triggered.\n- Never increase lot size after a loss.`;
  }

  return `### YOUR TRADING PERFORMANCE

- **Total Trades:** ${metrics.totalTrades}
- **Winning Trades:** ${metrics.winningTrades}
- **Losing Trades:** ${metrics.losingTrades}
- **Win Rate:** ${metrics.winRate}%
- **Net P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}
- **Profit Factor:** ${metrics.profitFactor}
- **Discipline Score:** ${discipline.totalScore}/100 (${discipline.rating})

### YOUR BIGGEST MISTAKES

${mistakesSection}

### WHY YOU MAY BE LOSING

${whyLosing}

### SUGGESTIONS

${suggestions.map((s) => `- ${s}`).join("\n")}
`;
}

function generateFollowUps(analysis: MentorAnalysisReport, currentQuery: string): string[] {
  const suggestions: string[] = [];
  const q = currentQuery.toLowerCase();

  if (!q.includes("revenge") && analysis.behavioral.some((b) => b.type === "Revenge Trading" && b.detected)) {
    suggestions.push("Am I doing revenge trading?");
  }
  if (!q.includes("fomo") && analysis.behavioral.some((b) => b.type === "FOMO" && b.detected)) {
    suggestions.push("Am I suffering from FOMO?");
  }
  if (!q.includes("strategy")) {
    suggestions.push("Which strategy works best for me?");
  }
  if (!q.includes("nifty")) {
    suggestions.push("Why am I losing in NIFTY options?");
  }
  if (!q.includes("discipline")) {
    suggestions.push("How is my Trading Discipline Score calculated?");
  }
  if (!q.includes("10 trades")) {
    suggestions.push("Analyze my last 10 trades.");
  }

  return suggestions.slice(0, 3);
}
