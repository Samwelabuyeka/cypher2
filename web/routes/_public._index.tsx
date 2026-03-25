import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Shield, 
  Cpu, 
  Zap, 
  Infinity, 
  Lock,
  ArrowRight,
  BarChart3,
  Layers,
  Check
} from "lucide-react";

interface MarketData {
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  totalSupply: number;
  blockHeight: number;
  tps: number;
}

export default function HomePage() {
  const [marketData, setMarketData] = useState<MarketData>({
    price: 42.75,
    change24h: 12.5,
    marketCap: 427500000,
    volume24h: 85600000,
    totalSupply: 10000000,
    blockHeight: 1245678,
    tps: 98543
  });

  useEffect(() => {
    // TODO: Replace with actual API call: useGlobalAction(api.getMarketData)
    const interval = setInterval(() => {
      setMarketData(prev => ({
        ...prev,
        price: prev.price + (Math.random() - 0.5) * 0.5,
        change24h: prev.change24h + (Math.random() - 0.5) * 0.2,
        tps: 95000 + Math.floor(Math.random() * 5000)
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(Math.floor(num));
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6TTEyIDM0YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTAtMTBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
        
        <div className="relative z-10 mx-auto max-w-6xl px-8 text-center flex flex-col gap-8">
          <div className="flex gap-2 justify-center flex-wrap">
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Quantum-Proof Security</Badge>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Decentralized</Badge>
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">100,000+ TPS</Badge>
            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">Live on Mainnet</Badge>
          </div>
          
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white animate-fade-in">
            CypherCoin
          </h1>
          
          <p className="text-2xl md:text-3xl text-gray-200 font-light">
            The Future of Cryptocurrency
          </p>
          
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Quantum-Resistant | AI-Powered | Infinitely Scalable
          </p>
          
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 max-w-md mx-auto border border-white/20">
            <div className="text-sm text-gray-300 mb-2">Current Price</div>
            <div className="text-5xl font-bold text-white mb-2">
              {formatCurrency(marketData.price)}
            </div>
            <div className={`text-lg font-semibold ${marketData.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {marketData.change24h >= 0 ? '↑' : '↓'} {Math.abs(marketData.change24h).toFixed(2)}% (24h)
            </div>
          </div>
          
          <div className="flex gap-4 justify-center flex-wrap">
            <Button asChild size="lg" className="text-lg px-8 py-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              <Link to="/trade">
                <TrendingUp className="mr-2" />
                Start Trading
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6 bg-white/10 border-white/30 text-white hover:bg-white/20">
              <Link to="/sign-up">
                Create Account
                <ArrowRight className="ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Live Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Current Price</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(marketData.price)}</div>
                <div className={`text-sm ${marketData.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {marketData.change24h >= 0 ? '↑' : '↓'} {Math.abs(marketData.change24h).toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Market Cap</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(marketData.marketCap)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">24h Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(marketData.volume24h)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Total Supply</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(marketData.totalSupply)} CYP</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Block Height</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(marketData.blockHeight)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">TPS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatNumber(marketData.tps)}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why CypherCoin */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-8">
          <h2 className="text-4xl font-bold text-center mb-4">Why CypherCoin?</h2>
          <p className="text-xl text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
            Next-generation blockchain technology that solves the limitations of traditional cryptocurrencies
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-2">
              <CardHeader>
                <Shield className="w-12 h-12 text-purple-600 mb-4" />
                <CardTitle>Quantum-Resistant Cryptography</CardTitle>
                <CardDescription>
                  Protected against quantum computing attacks with advanced post-quantum cryptographic algorithms
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-2">
              <CardHeader>
                <Cpu className="w-12 h-12 text-blue-600 mb-4" />
                <CardTitle>Decentralized AI Governance</CardTitle>
                <CardDescription>
                  Self-governing protocol powered by distributed artificial intelligence that evolves with the network
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-2">
              <CardHeader>
                <TrendingUp className="w-12 h-12 text-green-600 mb-4" />
                <CardTitle>Self-Evolving Protocol</CardTitle>
                <CardDescription>
                  Automatically adapts and improves through machine learning without manual upgrades or hard forks
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-2">
              <CardHeader>
                <Layers className="w-12 h-12 text-orange-600 mb-4" />
                <CardTitle>Multi-Dimensional Value</CardTitle>
                <CardDescription>
                  Beyond simple transfers - supports complex value representations and programmable economics
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-2">
              <CardHeader>
                <Zap className="w-12 h-12 text-yellow-600 mb-4" />
                <CardTitle>Instant Finality</CardTitle>
                <CardDescription>
                  1-second block times with 10-second finality - transactions confirmed faster than a credit card
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-2">
              <CardHeader>
                <Infinity className="w-12 h-12 text-indigo-600 mb-4" />
                <CardTitle>Unlimited Scalability</CardTitle>
                <CardDescription>
                  Dynamic sharding technology that scales automatically with network demand - no congestion ever
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Comparison to Bitcoin */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-5xl px-8">
          <h2 className="text-4xl font-bold text-center mb-12">CypherCoin vs Bitcoin</h2>
          
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left font-semibold">Feature</th>
                      <th className="px-6 py-4 text-left font-semibold text-purple-600">CypherCoin</th>
                      <th className="px-6 py-4 text-left font-semibold text-orange-600">Bitcoin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-6 py-4 font-medium">Speed (TPS)</td>
                      <td className="px-6 py-4 text-purple-600 font-bold">100,000+</td>
                      <td className="px-6 py-4 text-gray-600">~7</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-6 py-4 font-medium">Finality Time</td>
                      <td className="px-6 py-4 text-purple-600 font-bold">10 seconds</td>
                      <td className="px-6 py-4 text-gray-600">~2 hours</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium">Energy Efficiency</td>
                      <td className="px-6 py-4 text-purple-600 font-bold">99.9% more efficient</td>
                      <td className="px-6 py-4 text-gray-600">High consumption</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-6 py-4 font-medium">Quantum-Safe</td>
                      <td className="px-6 py-4 text-green-600 font-bold flex items-center gap-2">
                        <Check className="w-5 h-5" /> Yes
                      </td>
                      <td className="px-6 py-4 text-red-600">No</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium">Smart Contracts</td>
                      <td className="px-6 py-4 text-purple-600 font-bold">Advanced + AI-powered</td>
                      <td className="px-6 py-4 text-gray-600">Limited</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-6 py-4 font-medium">Scalability</td>
                      <td className="px-6 py-4 text-purple-600 font-bold">Unlimited (Dynamic Sharding)</td>
                      <td className="px-6 py-4 text-gray-600">Limited</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Price Chart Placeholder */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-5xl px-8">
          <h2 className="text-4xl font-bold text-center mb-12">Price Performance</h2>
          
          <Card>
            <CardContent className="p-8">
              <div className="h-64 flex items-center justify-center bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 text-purple-600" />
                  <p className="text-xl font-semibold mb-2">Interactive Price Chart</p>
                  <Button asChild>
                    <Link to="/trade">
                      View Full Trading Dashboard
                      <ArrowRight className="ml-2" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How to Get Started */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-5xl px-8">
          <h2 className="text-4xl font-bold text-center mb-12">How to Get Started</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-purple-600">1</span>
                </div>
                <CardTitle>Create Free Account</CardTitle>
                <CardDescription>
                  Sign up in seconds with email or Google OAuth
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-blue-600">2</span>
                </div>
                <CardTitle>Deposit Funds</CardTitle>
                <CardDescription>
                  Add funds via crypto, card, or bank transfer
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-green-600">3</span>
                </div>
                <CardTitle>Start Trading CYP</CardTitle>
                <CardDescription>
                  Buy CypherCoin with our advanced trading platform
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-orange-600">4</span>
                </div>
                <CardTitle>Earn from Growth</CardTitle>
                <CardDescription>
                  Watch your investment grow with the future of crypto
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <div className="mx-auto max-w-4xl px-8 text-center">
          <h2 className="text-5xl font-bold mb-6">Join the Revolution</h2>
          <p className="text-xl mb-8 text-gray-200">
            Be part of the next generation of cryptocurrency. Start trading CypherCoin today.
          </p>
          
          <div className="flex gap-4 justify-center flex-wrap">
            <Button asChild size="lg" className="text-lg px-10 py-6 bg-white text-purple-900 hover:bg-gray-100">
              <Link to="/sign-up">
                <Lock className="mr-2" />
                Start Trading Now
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-10 py-6 border-white/30 text-white hover:bg-white/20">
              <Link to="/about">
                Learn More
                <ArrowRight className="ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}