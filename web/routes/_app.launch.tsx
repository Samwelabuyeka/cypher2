import { useGlobalAction } from "@gadgetinc/react";
import { useState, useEffect } from "react";
import { api } from "../api";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Rocket, Zap, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type LaunchPhase = {
  phase: number;
  description: string;
};

const LAUNCH_PHASES: LaunchPhase[] = [
  { phase: 1, description: "Initializing blockchain consensus" },
  { phase: 2, description: "Deploying smart contracts" },
  { phase: 3, description: "Configuring quantum cryptography" },
  { phase: 4, description: "Connecting to exchanges" },
  { phase: 5, description: "Initializing AI prediction models" },
  { phase: 6, description: "Starting autonomous trading bots" },
  { phase: 7, description: "Activating mining coordination" },
  { phase: 8, description: "Optimizing DeFi strategies" },
];

export default function LaunchPage() {
  const [{ data: platformData, fetching: platformFetching, error: platformError }, launchPlatform] =
    useGlobalAction(api.launchCypherPlatform);
  const [{ data: coinData, fetching: coinFetching, error: coinError }, launchCoin] =
    useGlobalAction(api.launchCypherCoin);

  const [currentPhase, setCurrentPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLaunched, setIsLaunched] = useState(false);
  const [launchType, setLaunchType] = useState<"platform" | "coin" | null>(null);

  const isLaunching = platformFetching || coinFetching;

  // Update elapsed time
  useEffect(() => {
    if (!startTime || !isLaunching) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isLaunching]);

  // Simulate phase progression
  useEffect(() => {
    if (!isLaunching) return;

    const phaseCount = launchType === "platform" ? 8 : 3;
    const interval = setInterval(() => {
      setCurrentPhase((prev) => {
        const next = prev + 1;
        if (next <= phaseCount) {
          setProgress((next / phaseCount) * 100);
          return next;
        }
        return prev;
      });
    }, launchType === "platform" ? 7000 : 3000);

    return () => clearInterval(interval);
  }, [isLaunching, launchType]);

  // Handle launch completion
  useEffect(() => {
    if (platformData?.success || coinData?.success) {
      setIsLaunched(true);
      toast.success("Launch completed successfully!", {
        description: launchType === "platform" 
          ? "Cypher Platform is now fully operational"
          : "CypherCoin blockchain is now active",
      });
    }
  }, [platformData, coinData, launchType]);

  // Handle errors
  useEffect(() => {
    if (platformError) {
      toast.error("Platform launch failed", {
        description: platformError.message,
      });
    }
    if (coinError) {
      toast.error("CypherCoin launch failed", {
        description: coinError.message,
      });
    }
  }, [platformError, coinError]);

  const handleLaunchPlatform = async () => {
    setLaunchType("platform");
    setStartTime(new Date());
    setCurrentPhase(0);
    setProgress(0);
    toast.info("Initiating platform launch sequence...");
    await launchPlatform();
  };

  const handleLaunchCoin = async () => {
    setLaunchType("coin");
    setStartTime(new Date());
    setCurrentPhase(0);
    setProgress(0);
    toast.info("Initiating CypherCoin launch...");
    await launchCoin();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentData = platformData || coinData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              Cypher Platform Launch Control
            </h1>
            <Badge
              variant={isLaunched ? "default" : "secondary"}
              className={`text-sm ${
                isLaunched
                  ? "bg-green-500/20 text-green-400 border-green-500/50"
                  : "bg-slate-700/50 text-slate-400"
              }`}
            >
              {isLaunched ? "OPERATIONAL" : "STANDBY"}
            </Badge>
          </div>
          <p className="text-xl text-slate-300">
            Initialize the complete quantum-AI hybrid blockchain ecosystem
          </p>
        </div>

        {/* Launch Cards */}
        {!isLaunched && !isLaunching && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Main Launch Card */}
            <Card className="border-purple-500/30 bg-slate-900/50 backdrop-blur-sm hover:border-purple-500/50 transition-all">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-500/20 rounded-lg">
                    <Rocket className="h-8 w-8 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">Launch Complete Platform</CardTitle>
                    <CardDescription className="text-slate-400">Full ecosystem deployment</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-300">This will initialize:</p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-400" />
                    CypherCoin blockchain with quantum cryptography
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-400" />
                    200+ trading pairs across multiple exchanges
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-400" />
                    AI prediction models and autonomous trading bots
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-400" />
                    Multi-chain mining coordination
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-400" />
                    DeFi yield farming optimization
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-400" />
                    Arbitrage detection systems
                  </li>
                </ul>
                <div className="pt-2 text-sm text-slate-500">
                  <span className="font-medium">Estimated time:</span> ~15 minutes
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleLaunchPlatform}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold text-lg py-6"
                >
                  <Rocket className="mr-2 h-5 w-5" />
                  Launch Platform
                </Button>
              </CardFooter>
            </Card>

            {/* Quick Launch Card */}
            <Card className="border-cyan-500/30 bg-slate-900/50 backdrop-blur-sm hover:border-cyan-500/50 transition-all">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-cyan-500/20 rounded-lg">
                    <Zap className="h-8 w-8 text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">Quick Launch - CypherCoin Only</CardTitle>
                    <CardDescription className="text-slate-400">Blockchain initialization</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-300">
                  Launch only the CypherCoin blockchain with quantum-resistant cryptography and proof-of-stake
                  consensus.
                </p>
                <div className="pt-2 text-sm text-slate-500">
                  <span className="font-medium">Estimated time:</span> ~2 minutes
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleLaunchCoin}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold text-lg py-6"
                >
                  <Zap className="mr-2 h-5 w-5" />
                  Launch CypherCoin
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Real-time Status */}
        {isLaunching && (
          <Card className="border-purple-500/50 bg-slate-900/80 backdrop-blur-sm animate-pulse-slow">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                Launch in Progress
              </CardTitle>
              <CardDescription className="text-slate-400">
                {launchType === "platform" ? "Full Platform Deployment" : "CypherCoin Blockchain Initialization"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">
                    Phase {currentPhase}/{launchType === "platform" ? 8 : 3}:{" "}
                    {LAUNCH_PHASES[currentPhase - 1]?.description || "Preparing..."}
                  </span>
                  <span className="text-purple-400 font-mono">{formatTime(elapsedTime)}</span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>

              <Alert className="border-purple-500/30 bg-purple-500/10">
                <AlertCircle className="h-4 w-4 text-purple-400" />
                <AlertDescription className="text-slate-300">
                  Do not close this window. Launch sequence is in progress...
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {currentData && currentData.success && (
          <Card className="border-green-500/50 bg-slate-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-400" />
                Launch Successful
              </CardTitle>
              <CardDescription className="text-slate-400">
                Execution time: {formatTime(elapsedTime)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="border-green-500/30 bg-green-500/10">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-slate-300">
                  {launchType === "platform"
                    ? "Cypher Platform is now fully operational with all systems active."
                    : "CypherCoin blockchain is live and accepting transactions."}
                </AlertDescription>
              </Alert>

              {currentData.result && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">System Status</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentData.result.blockchain && (
                      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <h4 className="text-sm font-medium text-purple-400 mb-2">Blockchain</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Validators:</span>
                            <span className="text-white font-mono">{currentData.result.blockchain.validators}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Block Height:</span>
                            <span className="text-white font-mono">{currentData.result.blockchain.blockHeight}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Supply:</span>
                            <span className="text-white font-mono">
                              {currentData.result.blockchain.totalSupply} CYPH
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentData.result.tradingPairs && (
                      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <h4 className="text-sm font-medium text-cyan-400 mb-2">Trading</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Pairs:</span>
                            <span className="text-white font-mono">{currentData.result.tradingPairs}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Exchanges:</span>
                            <span className="text-white font-mono">{currentData.result.exchanges}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentData.result.aiSystems && (
                      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <h4 className="text-sm font-medium text-pink-400 mb-2">AI Systems</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Models:</span>
                            <span className="text-white font-mono">{currentData.result.aiSystems.models}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Bots:</span>
                            <span className="text-white font-mono">{currentData.result.aiSystems.bots}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentData.result.mining && (
                      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <h4 className="text-sm font-medium text-green-400 mb-2">Mining</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Rigs:</span>
                            <span className="text-white font-mono">{currentData.result.mining.rigs}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Hashrate:</span>
                            <span className="text-white font-mono">{currentData.result.mining.hashrate}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {currentData.result.warnings && currentData.result.warnings.length > 0 && (
                    <Alert className="border-yellow-500/30 bg-yellow-500/10">
                      <AlertCircle className="h-4 w-4 text-yellow-400" />
                      <AlertDescription className="text-slate-300">
                        <p className="font-medium mb-2">Warnings:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {currentData.result.warnings.map((warning: string, idx: number) => (
                            <li key={idx} className="text-sm">
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {currentData.result.recommendations && currentData.result.recommendations.length > 0 && (
                    <Alert className="border-blue-500/30 bg-blue-500/10">
                      <AlertCircle className="h-4 w-4 text-blue-400" />
                      <AlertDescription className="text-slate-300">
                        <p className="font-medium mb-2">Recommendations:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {currentData.result.recommendations.map((rec: string, idx: number) => (
                            <li key={idx} className="text-sm">
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => {
                  setIsLaunched(false);
                  setCurrentPhase(0);
                  setProgress(0);
                  setStartTime(null);
                  setElapsedTime(0);
                  setLaunchType(null);
                }}
                variant="outline"
                className="w-full border-slate-600 hover:border-purple-500"
              >
                Launch Again
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Error Section */}
        {(platformError || coinError) && (
          <Card className="border-red-500/50 bg-slate-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <AlertCircle className="h-6 w-6 text-red-400" />
                Launch Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className="border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-slate-300">
                  {(platformError || coinError)?.message || "An unknown error occurred during launch"}
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => {
                  setCurrentPhase(0);
                  setProgress(0);
                  setStartTime(null);
                  setElapsedTime(0);
                  setLaunchType(null);
                }}
                variant="outline"
                className="w-full border-slate-600 hover:border-red-500"
              >
                Try Again
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}