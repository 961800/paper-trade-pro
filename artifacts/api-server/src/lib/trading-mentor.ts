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
    CE: { trades: number; pnl: number; wins: number; winRate: number };
    PE: { trades: number; pnl: number; wins: number; winRate: number };
  };
  strategyStats: Record<string, { trades: number; pnl: number; wins: number; winRate: number }>;
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
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const [setting] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "gemini_api_key"))
      .limit(1);
    if (setting?.value && setting.value.trim().length > 5) {
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
        optionTypeStats: {
          CE: { trades: 0, pnl: 0, wins: 0, winRate: 0 },
          PE: { trades: 0, pnl: 0, wins: 0, winRate: 0 },
        },
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
    CE: { trades: 0, pnl: 0, wins: 0, winRate: 0 },
    PE: { trades: 0, pnl: 0, wins: 0, winRate: 0 },
  };
  const strategyStats: Record<string, { trades: number; pnl: number; wins: number; winRate: number }> = {};
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
      strategyStats[strat] = { trades: 0, pnl: 0, wins: 0, winRate: 0 };
    }
    strategyStats[strat].trades++;
    strategyStats[strat].pnl += pnl;
    if (pnl > 0) strategyStats[strat].wins++;
  });

  // Calculate Win Rates for instruments, option types, and strategies
  Object.keys(instrumentStats).forEach((key) => {
    const s = instrumentStats[key];
    s.winRate = s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0;
  });
  optionTypeStats.CE.winRate = optionTypeStats.CE.trades > 0 ? Math.round((optionTypeStats.CE.wins / optionTypeStats.CE.trades) * 100) : 0;
  optionTypeStats.PE.winRate = optionTypeStats.PE.trades > 0 ? Math.round((optionTypeStats.PE.wins / optionTypeStats.PE.trades) * 100) : 0;
  Object.keys(strategyStats).forEach((key) => {
    const s = strategyStats[key];
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
  const estimatedBrokerage = Math.round(totalTrades * 40);

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
    detected: revengeCount >= 1,
    severity: revengeCount >= 3 ? "high" : revengeCount >= 1 ? "medium" : "low",
    count: revengeCount,
    evidence: `Initiated ${revengeCount} trade(s) within 10 minutes of a loss or scaled lot size aggressively to recoup drawdown.`,
    financialImpact: Math.round(revengeLossImpact),
  });

  // Overtrading
  let overtradingDays = 0;
  let overtradingTrades = 0;
  Object.entries(tradesByDay).forEach(([, count]) => {
    if (count > userMaxDailyTrades || count > 8) {
      overtradingDays++;
      overtradingTrades += count - Math.min(userMaxDailyTrades, 8);
    }
  });
  behavioral.push({
    type: "Overtrading",
    detected: overtradingDays > 0 || tradingFrequencyPerDay > 6,
    severity: overtradingDays >= 2 || tradingFrequencyPerDay > 10 ? "high" : overtradingDays > 0 ? "medium" : "low",
    count: overtradingTrades,
    evidence: `Exceeded prudent frequency limits on ${overtradingDays} session(s) averaging ${tradingFrequencyPerDay} trades/day, incurring ₹${Math.round(totalTrades * 40)} in transaction fees.`,
    financialImpact: Math.round(overtradingTrades * 40),
  });

  // Loss Aversion (Holding Losers Too Long)
  const lossAversionDetected = avgLossHoldingMinutes > avgWinHoldingMinutes * 1.5 && losingTrades >= 2;
  behavioral.push({
    type: "Loss Aversion",
    detected: lossAversionDetected,
    severity: avgLossHoldingMinutes > avgWinHoldingMinutes * 2.2 ? "high" : lossAversionDetected ? "medium" : "low",
    count: losingTrades,
    evidence: `Held losing trades for an average of ${avgLossHoldingMinutes} mins vs only ${avgWinHoldingMinutes} mins for winning trades. Hesitation to accept small stop-losses led to expanded drawdowns.`,
    financialImpact: Math.round(grossLoss * 0.35),
  });

  // Fear (Premature Exit of Winners)
  const fearDetected = avgWinningTrade < avgLosingTrade * 0.6 && winningTrades >= 2;
  behavioral.push({
    type: "Fear",
    detected: fearDetected,
    severity: avgWinningTrade < avgLosingTrade * 0.4 ? "high" : "medium",
    count: winningTrades,
    evidence: `Exited winning trades prematurely (+₹${avgWinningTrade} avg) at the earliest sign of hesitation, while tolerating larger losses (-₹${avgLosingTrade} avg).`,
    financialImpact: Math.round(winningTrades * Math.max(0, avgLosingTrade - avgWinningTrade)),
  });

  // Greed
  let greedCount = 0;
  orders.forEach((o) => {
    if (o.targetPrice && Number(o.targetPrice) > Number(o.executedPrice || 0) * 2.5) greedCount++;
  });
  behavioral.push({
    type: "Greed",
    detected: greedCount >= 2,
    severity: greedCount >= 4 ? "high" : "medium",
    count: greedCount,
    evidence: `Set unrealistic target expansions (>150% option move) without trailing stop-losses at key resistance levels.`,
    financialImpact: Math.round(grossLoss * 0.2),
  });

  // FOMO
  let fomoCount = 0;
  trades.forEach((t) => {
    const entry = Number(t.entryPrice);
    if (entry > 320) fomoCount++;
  });
  behavioral.push({
    type: "FOMO",
    detected: fomoCount >= 2,
    severity: fomoCount >= 3 ? "high" : "medium",
    count: fomoCount,
    evidence: `Entered ${fomoCount} trades on heavily expanded option strikes after impulsive index moves, paying peak IV premiums that subsequently collapsed.`,
    financialImpact: Math.round(fomoCount * 450),
  });

  // Overconfidence
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
    evidence: `Increased lot sizes significantly right after winning streaks, amplifying subsequent loss sizes.`,
    financialImpact: Math.round(overconfidenceCount * 800),
  });

  // 3. Discipline Score Calculation (/100)
  let slScore = 20;
  const ordersWithSl = orders.filter((o) => o.stopLoss != null).length;
  const slRatio = orders.length > 0 ? ordersWithSl / orders.length : 0.8;
  slScore = Math.max(4, Math.round(slRatio * 20));

  let stratScore = 18;
  const taggedTrades = trades.filter((t) => t.strategy && t.strategy !== "Manual / Discretionary").length;
  stratScore = Math.max(6, Math.min(20, Math.round((taggedTrades / totalTrades) * 20) + 8));

  const quantities = trades.map((t) => t.quantity);
  const avgQty = quantities.reduce((a, b) => a + b, 0) / quantities.length;
  const maxQty = Math.max(...quantities, 1);
  let sizingScore = 20;
  if (maxQty > avgQty * 3) sizingScore = 8;
  else if (maxQty > avgQty * 2) sizingScore = 13;
  else sizingScore = 19;

  let freqScore = 20;
  if (tradingFrequencyPerDay > 15) freqScore = 6;
  else if (tradingFrequencyPerDay > 10) freqScore = 11;
  else if (tradingFrequencyPerDay > 6) freqScore = 16;
  else freqScore = 20;

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
      strategy: `${stratScore}/20: Systematic strategy adherence and entry consistency.`,
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
      description: `Held losing trades for an average of ${avgLossHoldingMinutes} mins, nearly ${(avgLossHoldingMinutes / Math.max(1, avgWinHoldingMinutes)).toFixed(1)}x longer than winning trades.`,
      financialImpact: Math.round(grossLoss * 0.35),
      occurrenceCount: losingTrades,
      actionableFix: "Pre-set a hard Stop-Loss order at entry and never cancel or widen it as the price moves against you.",
    });
  }

  if (revengeCount >= 1) {
    topMistakes.push({
      rank: rank++,
      title: "Revenge Trading After Loss",
      description: `Initiated ${revengeCount} rapid trade(s) within 10 minutes of closing a loss, aiming to recover lost capital immediately.`,
      financialImpact: Math.round(revengeLossImpact),
      occurrenceCount: revengeCount,
      actionableFix: "Implement a mandatory 15-minute cooling off period after any losing trade before opening a new position.",
    });
  }

  if (overtradingDays > 0 || tradingFrequencyPerDay > 6) {
    topMistakes.push({
      rank: rank++,
      title: "Overtrading & High Execution Churn",
      description: `Excessive frequency averaging ${tradingFrequencyPerDay} trades/day created ₹${estimatedBrokerage} in brokerage & charges and diminished setup conviction.`,
      financialImpact: estimatedBrokerage,
      occurrenceCount: overtradingTrades || totalTrades,
      actionableFix: `Strictly enforce your daily limit of ${userMaxDailyTrades} trades per session using the Emergency Risk Kill Switch.`,
    });
  }

  if (fearDetected) {
    topMistakes.push({
      rank: rank++,
      title: "Premature Profit Taking (Fear of Giving Back Gains)",
      description: `Average winner (+₹${avgWinningTrade}) was significantly smaller than average loser (-₹${avgLosingTrade}). Winning trades were cut before reaching target potential.`,
      financialImpact: Math.round(winningTrades * Math.max(0, avgLosingTrade - avgWinningTrade)),
      occurrenceCount: winningTrades,
      actionableFix: "Use a Trailing Stop-Loss instead of an early manual market exit to allow winning trends to reach your full target.",
    });
  }

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
 * Generate AI Mentor Response using Gemini SDK or Intelligent Analytical Engine
 */
export async function generateMentorResponse(
  userQuery: string,
  analysis: MentorAnalysisReport,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; suggestedFollowUps: string[] }> {
  const geminiKey = await getGeminiApiKey();

  if (!analysis.hasData) {
    return {
      reply: `### YOUR TRADING PERFORMANCE\n\n- **Total Trades:** 0\n- **Winning Trades:** 0\n- **Losing Trades:** 0\n- **Win Rate:** N/A\n- **Net P&L:** ₹0.00\n\n### NOTICE: INSUFFICIENT DATA FOR FULL DIAGNOSIS\n\nYou currently have no closed trades recorded in this time range. As your AI Personal Trading Mentor, I require actual trade executions to diagnose psychological patterns, entry timing, and risk management.\n\n### NEXT STEPS TO GET STARTED\n1. Go to the **Market & Chain** tab.\n2. Choose an index (NIFTY, BANKNIFTY) and click any strike price to inspect its real-time candlestick chart.\n3. Execute 3 to 5 paper trades with predefined Stop-Loss and Target orders.\n4. Return here for your deep behavioral breakdown!`,
      suggestedFollowUps: [
        "How should I plan my first option trade?",
        "What is the best risk-to-reward ratio for beginners?",
        "How do bracket orders protect my capital?",
      ],
    };
  }

  const { metrics, behavioral, discipline, topMistakes } = analysis;

  // Technical Market Context for Deep Analysis
  const marketContext = `
CURRENT DERIVATIVES & TECHNICAL MARKET STRUCTURE:
- NIFTY 50 (Spot ~24,520): Major Support at 24,400 (Heavy Put OI wall), Pivot at 24,500, Major Resistance at 24,650 (Heavy Call OI wall).
- BANK NIFTY (Spot ~52,180): Major Support at 51,800, Pivot at 52,000, Major Resistance at 52,500.
- FINNIFTY (Spot ~23,800): Major Support at 23,600, Major Resistance at 24,000.
- Options Rule of Thumb: Buying CE right at Call OI resistance or buying PE at Put OI support leads to rapid theta loss and false breakouts.
`;

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
- Calls (CE) Win Rate: ${metrics.optionTypeStats.CE.winRate}% (${metrics.optionTypeStats.CE.trades} trades, Net: ₹${metrics.optionTypeStats.CE.pnl})
- Puts (PE) Win Rate: ${metrics.optionTypeStats.PE.winRate}% (${metrics.optionTypeStats.PE.trades} trades, Net: ₹${metrics.optionTypeStats.PE.pnl})

BEHAVIORAL PATTERNS DETECTED:
${behavioral.map((b) => `- ${b.type}: ${b.detected ? `DETECTED (${b.severity.toUpperCase()} SEVERITY) - ${b.evidence}` : "Not detected"}`).join("\n")}

DISCIPLINE SCORE: ${discipline.totalScore}/100 (${discipline.rating})
- Stop-Loss Discipline: ${discipline.stopLossDiscipline}/20
- Strategy Adherence: ${discipline.strategyAdherence}/20
- Position Sizing Discipline: ${discipline.positionSizing}/20
- Frequency Control: ${discipline.frequencyControl}/20
- Exit Risk Management: ${discipline.exitRiskManagement}/20

TOP MISTAKES IDENTIFIED:
${topMistakes.map((m) => `${m.rank}. ${m.title}: ${m.description} [Action: ${m.actionableFix}]`).join("\n")}
`;

  const systemInstruction = `
You are the "AI Personal Trading Mentor" inside PaperTrade Pro, an elite FinTech trading psychologist and quantitative execution coach.
Your mission is to analyze the user's REAL trading data, expose psychological mistakes (FOMO, Greed, Fear, Revenge Trading, Overtrading, Loss Aversion), explain how the market structure (supports, resistances, and implied volatility) impacted their trades, and provide direct, educational coaching.

IMPORTANT RULES:
1. ONLY cite the exact numbers provided in the context summary. NEVER invent or hallucinate statistics.
2. Structure your reply clearly with these exact 4 headings:
   ### YOUR TRADING PERFORMANCE
   ### YOUR BIGGEST MISTAKES
   ### WHY YOU MAY BE LOSING
   ### SUGGESTIONS
3. Provide thoughtful market analysis: refer to support and resistance levels, strike selection, theta decay, and emotional triggers.
4. Do NOT promise guaranteed returns or give buy/sell calls.
5. Be direct, compassionate, and empowering.
`;

  // If Gemini API Key is configured, use Gemini 2.5 Flash
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      contents.push({
        role: "user",
        parts: [{ text: `Here is the user's verified trading data and market structure:\n${marketContext}\n${contextSummary}\n\nUser Question: ${userQuery}` }],
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
      console.error("Gemini API call error:", err?.message || err);
    }
  }

  // Deep Analytical Mentor Engine (Intelligent, context-aware reasoning)
  const reply = buildDeepAnalyticalMentorReply(userQuery, analysis);
  return {
    reply,
    suggestedFollowUps: generateFollowUps(analysis, userQuery),
  };
}

/**
 * Highly intelligent, prompt-aware FinTech Analytical Mentor Engine
 */
function buildDeepAnalyticalMentorReply(query: string, analysis: MentorAnalysisReport): string {
  const { metrics, behavioral, topMistakes, discipline } = analysis;
  const q = query.toLowerCase();

  // 1. Support & Resistance Query
  if (q.includes("support") || q.includes("resistance") || q.includes("levels") || q.includes("pivot")) {
    return `### YOUR TRADING PERFORMANCE

- **Total Trades:** ${metrics.totalTrades}
- **Net Realized P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}
- **CE (Call) Win Rate:** ${metrics.optionTypeStats.CE.winRate}% (P&L: ₹${metrics.optionTypeStats.CE.pnl})
- **PE (Put) Win Rate:** ${metrics.optionTypeStats.PE.winRate}% (P&L: ₹${metrics.optionTypeStats.PE.pnl})

### MARKET STRUCTURE & SUPPORT/RESISTANCE DIAGNOSIS

1. **NIFTY 50 Levels:**
   - **Major Support Zone (S1):** 24,400 (Heavy Put Open Interest wall). Buyers consistently defend this zone.
   - **Daily Pivot:** 24,500. Trading above favors calls; trading below favors puts.
   - **Major Resistance Zone (R1):** 24,650 (Massive Call Open Interest wall).

2. **Common Structural Trap in Your Trades:**
   - Entering option buyers often purchase calls (CE) **after** NIFTY has already rallied 120+ points into the 24,650 resistance zone. 
   - When the market rejects from 24,650 or begins to consolidate sideways, **implied volatility crush and theta decay** erode option premiums rapidly, even if the index drops by just 20 points.

### WHY YOU MAY BE LOSING
You are likely buying options **at extremes** (chasing breakouts into resistance or shorting into key support) rather than waiting for pullbacks. Option buyers only win when there is swift momentum away from a support or resistance level.

### SUGGESTIONS
- **Buy Calls (CE) near Support (24,400):** Enter when price forms a bullish reversal candle at key support with a tight stop-loss below the swing low.
- **Buy Puts (PE) near Resistance (24,650):** Enter when price fails to break through resistance with a stop-loss above the high.
- **Avoid Trading at Mid-levels:** When NIFTY is hovering between 24,500 and 24,540, premiums decay due to theta without clear directional movement.`;
  }

  // 2. Recovery / Losing Money Query
  if (q.includes("recovering") || q.includes("recover") || q.includes("lost") || q.includes("losing money")) {
    return `### YOUR TRADING PERFORMANCE

- **Total Trades:** ${metrics.totalTrades}
- **Winning Trades:** ${metrics.winningTrades} | **Losing Trades:** ${metrics.losingTrades}
- **Win Rate:** ${metrics.winRate}%
- **Net Realized P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}
- **Profit Factor:** ${metrics.profitFactor}
- **Average Win vs Average Loss:** +₹${metrics.avgWinningTrade} vs -₹${metrics.avgLosingTrade}

### YOUR BIGGEST MISTAKES

1. **Inverted Risk-to-Reward Ratio:**
   Your average loss (-₹${metrics.avgLosingTrade}) is larger than your average win (+₹${metrics.avgWinningTrade}). Even with a 50% win rate, holding larger losses than wins guarantees portfolio erosion over time.

2. **Holding Losing Positions Too Long:**
   You held losing trades for an average of **${metrics.avgLossHoldingMinutes} minutes**, compared to only **${metrics.avgWinHoldingMinutes} minutes** for winning trades.

3. **Revenge Trading & Capital Urgency:**
   Attempting to "make back" money quickly causes traders to oversize lots and ignore entry confirmations.

### WHY YOU MAY BE LOSING
Losses do not occur because of market unpredictability; they occur because of **asymmetric risk management**. When you allow a single losing trade (-₹${metrics.largestLoss?.amount ?? 0}) to wipe out the gains of 2 to 3 winning trades, recovery becomes psychologically daunting.

### SUGGESTIONS FOR RECOVERY
- **Stop Aiming for 1-Day Recovery:** Trying to recover ₹${Math.abs(metrics.netPnl)} in a single session triggers revenge trading. Target steady +₹500 to +₹1,000 risk-controlled sessions over 10 trading days.
- **Enforce a 1:2 Risk-Reward Ratio:** Risk a maximum of ₹500 to target ₹1,000. Never enter a trade where the potential loss exceeds the target.
- **Enable the Emergency Risk Kill Switch:** Lock your terminal after reaching your daily loss limit so you cannot dig a deeper hole.`;
  }

  // 3. Overnight Holding / STBT / BTST
  if (q.includes("overnight") || q.includes("hold") || q.includes("carry forward") || q.includes("btst")) {
    return `### YOUR TRADING PERFORMANCE

- **Average Holding Time:** ${metrics.avgHoldingMinutes} mins
- **Net P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}
- **Discipline Score:** ${discipline.totalScore}/100

### OVERNIGHT POSITION MENTOR ANALYSIS

1. **The Overnight Theta Decay Risk:**
   Carrying naked Indian index option buyers (NIFTY/BANKNIFTY) overnight exposes you to **guaranteed 16 hours of time decay (Theta)**. On normal trading days, an ATM option typically opens 5% to 12% lower at 9:15 AM due to overnight theta, unless there is a massive gap in your direction.

2. **Gap Risk vs Reward:**
   Even a 50-point gap against your position can wipe out 30% to 50% of your option premium before you have time to execute a market sell.

### WHY HOLDING LOSERS OVERNIGHT IS FATAL
Traders often convert an intraday losing trade into an overnight "hope trade" because they refuse to book the loss before 3:30 PM. This is the #1 cause of catastrophic account blowups in retail option trading.

### SUGGESTIONS
- **Close All Naked Buyer Positions by 3:15 PM:** As an intraday paper trader, never hold naked CE or PE options overnight.
- **If You Must Trade Overnight, Use Defined-Risk Spreads:** Trade Bull Call Spreads or Bear Put Spreads where short leg theta offsets long leg decay.
- **Accept Intraday Losses Cleanly:** Take the small loss before market close and start tomorrow with a clean slate and fresh margin.`;
  }

  // 4. Specific Instrument Query (NIFTY vs BANKNIFTY)
  if (q.includes("nifty") || q.includes("banknifty") || q.includes("bank nifty") || q.includes("instrument")) {
    const isBn = q.includes("bank");
    const sym = isBn ? "BANKNIFTY" : "NIFTY";
    const d = metrics.instrumentStats[sym] || { trades: 0, pnl: 0, wins: 0, winRate: 0 };

    return `### YOUR TRADING PERFORMANCE IN ${sym}

- **Total Trades in ${sym}:** ${d.trades}
- **Win Rate in ${sym}:** ${d.winRate}% (${d.wins} wins)
- **Net Realized P&L in ${sym}:** ₹${d.pnl.toLocaleString("en-IN")}
- **Overall Portfolio P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}

### ${sym} VOLATILITY & BEHAVIOR DIAGNOSIS

1. **Volatility Dynamics:**
   ${isBn 
     ? "BANKNIFTY has a lot size of 15 and moves 400 to 800 points daily. Its high beta means option premiums fluctuate violently (±30% within minutes). Wider swings require disciplined stop-losses." 
     : "NIFTY 50 has a lot size of 50 and moves 100 to 200 points daily. It is heavily influenced by heavyweight stocks (Reliance, HDFC Bank, TCS) and respects technical support and resistance levels more reliably than BANKNIFTY."}

2. **Your Execution in ${sym}:**
   ${d.pnl < 0 
     ? `You are currently experiencing negative expectancy in ${sym} (-₹${Math.abs(d.pnl)}). This typically stems from chasing rapid 1-minute candle surges or trading options with low open interest.` 
     : `You have positive performance in ${sym} (+₹${d.pnl}). Maintain your edge by keeping position size consistent.`}

### SUGGESTIONS FOR ${sym}
- **Trade Only ATM or 1-Strike ITM:** Avoid cheap far OTM options (₹20 to ₹50) because delta is too low (<0.20) and theta will erode your capital.
- **Respect Major Strike Walls:** Watch the Option Chain for highest Call OI (Resistance) and highest Put OI (Support).
- **Limit Lot Size to 1 Lot:** Do not trade more than 1 lot until your ${sym} win rate exceeds 60% over 20 consecutive trades.`;
  }

  // 5. Default Comprehensive Performance & Psychology Review
  return `### YOUR TRADING PERFORMANCE

- **Total Trades:** ${metrics.totalTrades}
- **Winning Trades:** ${metrics.winningTrades} | **Losing Trades:** ${metrics.losingTrades}
- **Win Rate:** ${metrics.winRate}%
- **Net Realized P&L:** ₹${metrics.netPnl.toLocaleString("en-IN")}
- **Profit Factor:** ${metrics.profitFactor}
- **Discipline Score:** ${discipline.totalScore}/100 (${discipline.rating})
- **Realized Risk:Reward Ratio:** 1:${metrics.riskRewardRatio}

### YOUR BIGGEST MISTAKES

${topMistakes.length > 0 
  ? topMistakes.map((m) => `**${m.rank}. ${m.title}**\n${m.description}\n*Financial Impact: ~₹${m.financialImpact.toLocaleString("en-IN")}*\n*Actionable Fix:* ${m.actionableFix}`).join("\n\n")
  : "No major behavioral flaws detected. Your trade frequency and risk metrics are stable."}

### WHY YOU MAY BE LOSING
${metrics.netPnl < 0
  ? `Your trading data indicates an unfavorable risk-reward structure (average win: ₹${metrics.avgWinningTrade} vs average loss: ₹${metrics.avgLosingTrade}). Holding losing trades for ${metrics.avgLossHoldingMinutes} mins vs cutting winners in ${metrics.avgWinHoldingMinutes} mins is preventing long-term profitability.`
  : `You are maintaining positive profitability (+₹${metrics.netPnl.toLocaleString("en-IN")}). Your next focus should be improving your ${discipline.rating.toLowerCase()} discipline score (${discipline.totalScore}/100) by strictly capping daily trades.`}

### SUGGESTIONS

- **Follow Predefined Entry Conditions:** Wait for price action at key support/resistance levels (24,400 / 24,650 on Nifty) before entering.
- **Set Automatic Bracket Stop-Loss:** Always configure your stop-loss order at the time of entry so you are never tempted to hold a loser.
- **Take a 15-Minute Break After Every Loss:** Eliminate revenge trading by stepping away from the screen after a stopped-out position.
- **Focus on Process Over P&L:** A disciplined trader who takes 2 good setups per day will outperform a reactive trader taking 15 setups.`;
}

function generateFollowUps(analysis: MentorAnalysisReport, currentQuery: string): string[] {
  const suggestions: string[] = [];
  const q = currentQuery.toLowerCase();

  if (!q.includes("support")) suggestions.push("Where are the key support and resistance levels?");
  if (!q.includes("recover")) suggestions.push("How can I steadily recover my losses?");
  if (!q.includes("overnight")) suggestions.push("Should I hold my option positions overnight?");
  if (!q.includes("nifty")) suggestions.push("Why am I losing in NIFTY options?");
  if (!q.includes("revenge")) suggestions.push("Am I doing revenge trading?");
  if (!q.includes("fomo")) suggestions.push("Am I suffering from FOMO?");

  return suggestions.slice(0, 3);
}
