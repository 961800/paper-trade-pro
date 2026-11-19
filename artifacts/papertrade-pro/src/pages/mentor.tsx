import React, { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  Bot,
  BrainCircuit,
  Sparkles,
  Send,
  RotateCcw,
  Copy,
  Check,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Target,
  Clock,
  Compass,
  Flame,
  ArrowRight,
  Info,
  Calendar,
} from "lucide-react";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  suggestedFollowUps?: string[];
}

interface DisciplineData {
  stopLossDiscipline: number;
  strategyAdherence: number;
  positionSizing: number;
  frequencyControl: number;
  exitRiskManagement: number;
  totalScore: number;
  rating: string;
  explanations: Record<string, string>;
}

interface AnalysisReport {
  dateRange: string;
  hasData: boolean;
  metrics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    netPnl: number;
    profitFactor: number;
    avgWinningTrade: number;
    avgLosingTrade: number;
    riskRewardRatio: number;
    tradingFrequencyPerDay: number;
    estimatedBrokerage: number;
  };
  discipline: DisciplineData;
  topMistakes: Array<{
    rank: number;
    title: string;
    description: string;
    financialImpact: number;
    actionableFix: string;
  }>;
}

const SUGGESTED_QUESTIONS = [
  "Why am I losing money?",
  "Analyze my last 10 trades.",
  "What are my biggest mistakes?",
  "Am I suffering from FOMO?",
  "Am I doing revenge trading?",
  "Why am I exiting trades early?",
  "Why am I losing in NIFTY options?",
  "Am I overtrading?",
  "Which strategy works best for me?",
  "Give me my weekly trading analysis.",
];

export default function Mentor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState<"today" | "7d" | "30d" | "all">("all");
  const [analysis, setAnalysis] = useState<AnalysisReport | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load chat history & analysis on mount
  useEffect(() => {
    loadAnalysis(dateRange);
    loadHistory();
  }, [dateRange]);

  const loadAnalysis = async (range: string) => {
    try {
      const data = await customFetch<AnalysisReport>(`/api/mentor/analysis?range=${range}`);
      setAnalysis(data);
    } catch (err) {
      console.error("Failed to load mentor analysis:", err);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await customFetch<{ messages: Message[] }>("/api/mentor/history");
      if (res.messages && res.messages.length > 0) {
        setMessages(res.messages);
      } else {
        // Welcome message
        setMessages([
          {
            role: "assistant",
            content: `👋 Hello **${user?.fullName?.split(" ")[0] || "Trader"}**! I am your **AI Personal Trading Mentor**.\n\nI monitor your real trade executions in PaperTrade Pro to detect behavioral leaks like **FOMO**, **Revenge Trading**, **Overtrading**, and **Premature Exits**.\n\nChoose a question below or ask me anything about your trading performance!`,
            suggestedFollowUps: [
              "Why am I losing money?",
              "What are my biggest mistakes?",
              "Am I doing revenge trading?",
            ],
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    setInputMessage("");
    const newMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, newMsg]);
    setIsLoading(true);

    try {
      const res = await customFetch<any>("/api/mentor/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, range: dateRange }),
      });

      const assistantMsg: Message = {
        role: "assistant",
        content: res.reply,
        suggestedFollowUps: res.suggestedFollowUps,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      // Refresh analysis to reflect updated score
      loadAnalysis(dateRange);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Mentor communication error",
        description: err?.message || "Could not reach AI Trading Mentor",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await customFetch("/api/mentor/history", { method: "DELETE" });
      setMessages([
        {
          role: "assistant",
          content: `🔄 Conversation history cleared. Ask me a question to begin a fresh trading performance review.`,
          suggestedFollowUps: [
            "Why am I losing money?",
            "What are my biggest mistakes?",
            "Am I suffering from FOMO?",
          ],
        },
      ]);
      toast({ title: "Conversation cleared", description: "Chat history has been reset." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to clear history" });
    }
  };

  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
      toast({ title: "Copied to clipboard" });
    });
  };

  const discipline = analysis?.discipline;
  const metrics = analysis?.metrics;

  const scoreColor =
    (discipline?.totalScore ?? 0) >= 80
      ? "text-green-400 border-green-500/40 bg-green-500/10"
      : (discipline?.totalScore ?? 0) >= 65
      ? "text-blue-400 border-blue-500/40 bg-blue-500/10"
      : (discipline?.totalScore ?? 0) >= 45
      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
      : "text-red-400 border-red-500/40 bg-red-500/10";

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-primary/30 to-primary/10 border border-primary/40 flex items-center justify-center shadow-lg shadow-primary/10">
              <BrainCircuit className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  AI Personal Trading Mentor
                </h1>
                <Badge variant="outline" className="border-primary/40 text-primary text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">
                  <Sparkles className="w-3 h-3 mr-1 inline" /> Powered by Gemini
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Understand your mistakes. Improve your trading decisions.
              </p>
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Range:
            </span>
            <div className="bg-muted/70 p-1 rounded-lg border border-border flex items-center gap-1">
              {(["today", "7d", "30d", "all"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-md transition-all capitalize",
                    dateRange === r
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-card"
                  )}
                >
                  {r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : r === "all" ? "All Time" : "Today"}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              className="h-8 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
              title="Clear conversation"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear Chat
            </Button>
          </div>
        </div>

        {/* Trading Discipline Score Dashboard Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Main Score Card */}
          <Card className="md:col-span-2 bg-gradient-to-br from-card to-card/60 border-border/80 shadow-md">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Discipline Score
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold font-mono text-foreground">
                    {discipline?.totalScore ?? 0}
                  </span>
                  <span className="text-sm text-muted-foreground font-mono">/100</span>
                  <Badge variant="outline" className={cn("text-xs font-bold px-2 py-0.5", scoreColor)}>
                    {discipline?.rating ?? "Calculating..."}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Calculated from stop-loss, position sizing, & frequency control
                </p>
              </div>

              <div className="h-16 w-16 relative flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-muted/30 stroke-current"
                    strokeWidth="3.5"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={cn("stroke-current transition-all duration-1000", scoreColor.split(" ")[0])}
                    strokeDasharray={`${discipline?.totalScore ?? 0}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute font-bold text-xs font-mono">
                  {discipline?.totalScore ?? 0}%
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sub-Discipline Pills */}
          <Card className="bg-card/70 border-border">
            <CardContent className="p-3.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Stop-Loss</span>
                <strong className="font-mono">{discipline?.stopLossDiscipline ?? 0}/20</strong>
              </div>
              <Progress value={((discipline?.stopLossDiscipline ?? 0) / 20) * 100} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate">SL order compliance</p>
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border">
            <CardContent className="p-3.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Position Sizing</span>
                <strong className="font-mono">{discipline?.positionSizing ?? 0}/20</strong>
              </div>
              <Progress value={((discipline?.positionSizing ?? 0) / 20) * 100} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate">Lot size stability</p>
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border">
            <CardContent className="p-3.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Frequency</span>
                <strong className="font-mono">{discipline?.frequencyControl ?? 0}/20</strong>
              </div>
              <Progress value={((discipline?.frequencyControl ?? 0) / 20) * 100} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate">Overtrading control</p>
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border">
            <CardContent className="p-3.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Risk:Reward</span>
                <strong className="font-mono">{discipline?.exitRiskManagement ?? 0}/20</strong>
              </div>
              <Progress value={((discipline?.exitRiskManagement ?? 0) / 20) * 100} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate">Win/Loss ratio quality</p>
            </CardContent>
          </Card>
        </div>

        {/* Suggested Prompt Chips Carousel */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" /> Suggested Questions to Ask Your Mentor:
          </span>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {SUGGESTED_QUESTIONS.map((q) => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                onClick={() => handleSendMessage(q)}
                disabled={isLoading}
                className="text-xs h-7 whitespace-nowrap bg-card/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
              >
                {q}
              </Button>
            ))}
          </div>
        </div>

        {/* Chat Conversation Container */}
        <Card className="border-border shadow-xl bg-card/90 overflow-hidden flex flex-col h-[600px]">
          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-2xl rounded-2xl p-4 text-xs leading-relaxed space-y-2 shadow-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                      : "bg-muted/40 border border-border/80 text-foreground rounded-tl-none"
                  )}
                >
                  {/* Message Content Rendered */}
                  <div className="whitespace-pre-wrap font-sans text-xs space-y-2">
                    {msg.content.split("\n\n").map((para, pIdx) => {
                      if (para.startsWith("### ")) {
                        return (
                          <h3
                            key={pIdx}
                            className="text-sm font-bold tracking-tight text-primary uppercase border-b border-border/40 pb-1 mt-3 first:mt-0"
                          >
                            {para.replace("### ", "")}
                          </h3>
                        );
                      }
                      if (para.startsWith("**") && para.includes(".\n")) {
                        return (
                          <div key={pIdx} className="bg-card/50 p-2.5 rounded-lg border border-border/60">
                            {para}
                          </div>
                        );
                      }
                      return <p key={pIdx}>{para}</p>;
                    })}
                  </div>

                  {/* Copy Button & Actions for Assistant Messages */}
                  {msg.role === "assistant" && (
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>AI Personal Trading Mentor</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(msg.content, idx)}
                        className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                      >
                        {copiedIdx === idx ? (
                          <>
                            <Check className="w-3 h-3 mr-1 text-green-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" /> Copy Response
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Follow-up question chips */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border/30 space-y-1.5">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                        Follow-up Recommendations:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedFollowUps.map((chip, cIdx) => (
                          <button
                            key={cIdx}
                            onClick={() => handleSendMessage(chip)}
                            disabled={isLoading}
                            className="text-[11px] bg-background hover:bg-primary/20 hover:text-primary px-2.5 py-1 rounded-full border border-border/80 transition-colors text-left"
                          >
                            ↳ {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-3 justify-start items-center">
                <div className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 animate-pulse">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/40 border border-border/80 rounded-2xl rounded-tl-none p-4 text-xs text-muted-foreground flex items-center gap-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  </div>
                  <span>Analyzing your execution patterns, win rate, & discipline...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-border bg-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask your mentor (e.g. Why am I losing in Nifty? Am I doing revenge trading?)..."
                disabled={isLoading}
                className="text-xs h-10 bg-background"
              />
              <Button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                className="h-10 px-4 text-xs font-bold"
              >
                <Send className="w-4 h-4 mr-1" /> Ask
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
