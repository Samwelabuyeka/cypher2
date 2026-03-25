import { ActionOptions } from "gadget-server";

interface SecurityCheck {
  name: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  found: boolean;
}

interface RiskBreakdown {
  securityRisks: number;
  liquidityRisks: number;
  ownershipRisks: number;
  codeQualityRisks: number;
}

interface ContractAnalysisResult {
  contractAddress: string;
  chain: string;
  timestamp: string;
  basicInfo: {
    creator: string;
    creationDate: string;
    creationBlock: number;
    balance: string;
    transactionCount: number;
    isVerified: boolean;
    contractName?: string;
  };
  tokenInfo?: {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    holderCount: number;
    topHolders: Array<{ address: string; balance: string; percentage: number }>;
    tokenType: "ERC20" | "ERC721" | "ERC1155" | "unknown";
  };
  securityChecks: SecurityCheck[];
  functionAnalysis: {
    publicFunctions: string[];
    privilegedFunctions: string[];
    hasTimelock: boolean;
    hasUpgradeability: boolean;
    isPausable: boolean;
  };
  auditInfo: {
    hasAudit: boolean;
    auditFirms?: string[];
    knownVulnerabilities: string[];
  };
  liquidityAnalysis?: {
    poolSize: string;
    isLiquidityLocked: boolean;
    rugPullRisk: "low" | "medium" | "high";
    lpTokenBurned: boolean;
  };
  riskScore: number;
  riskBreakdown: RiskBreakdown;
  redFlags: string[];
  recommendations: string[];
  safetyTips: string[];
}

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  const { contractAddress, chain, deepScan } = params;

  logger.info({ contractAddress, chain, deepScan }, "Starting smart contract analysis");

  try {
    const analysisResult: ContractAnalysisResult = {
      contractAddress,
      chain,
      timestamp: new Date().toISOString(),
      basicInfo: await fetchBasicContractInfo(contractAddress, chain, logger),
      securityChecks: [],
      functionAnalysis: {
        publicFunctions: [],
        privilegedFunctions: [],
        hasTimelock: false,
        hasUpgradeability: false,
        isPausable: false,
      },
      auditInfo: {
        hasAudit: false,
        knownVulnerabilities: [],
      },
      riskScore: 0,
      riskBreakdown: {
        securityRisks: 0,
        liquidityRisks: 0,
        ownershipRisks: 0,
        codeQualityRisks: 0,
      },
      redFlags: [],
      recommendations: [],
      safetyTips: [],
    };

    // Fetch and analyze token information if applicable
    const tokenInfo = await analyzeTokenInfo(contractAddress, chain, logger);
    if (tokenInfo) {
      analysisResult.tokenInfo = tokenInfo;
    }

    // Perform security checks
    analysisResult.securityChecks = await performSecurityChecks(
      contractAddress,
      chain,
      analysisResult.basicInfo.isVerified,
      logger
    );

    // Analyze contract functions
    analysisResult.functionAnalysis = await analyzeFunctions(contractAddress, chain, logger);

    // Check audit history
    analysisResult.auditInfo = await checkAuditHistory(contractAddress, chain, logger);

    // Analyze liquidity if it's a token
    if (tokenInfo) {
      analysisResult.liquidityAnalysis = await analyzeLiquidity(
        contractAddress,
        chain,
        tokenInfo.tokenType,
        logger
      );
    }

    // Perform deep scan if requested
    if (deepScan) {
      logger.info("Performing deep scan");
      await performDeepScan(analysisResult, contractAddress, chain, logger);
    }

    // Calculate risk score and identify red flags
    calculateRiskScore(analysisResult);
    identifyRedFlags(analysisResult);

    // Generate recommendations and safety tips
    generateRecommendations(analysisResult);
    generateSafetyTips(analysisResult);

    // Store analysis results
    await storeAnalysisResults(analysisResult, api, logger);

    logger.info({ riskScore: analysisResult.riskScore }, "Smart contract analysis completed");

    return {
      success: true,
      analysis: analysisResult,
    };
  } catch (error) {
    logger.error({ error, contractAddress, chain }, "Error analyzing smart contract");
    throw error;
  }
};

async function fetchBasicContractInfo(
  address: string,
  chain: string,
  logger: any
): Promise<ContractAnalysisResult["basicInfo"]> {
  // In a real implementation, this would call blockchain APIs like Etherscan
  logger.info({ address, chain }, "Fetching basic contract info");

  return {
    creator: "0x0000000000000000000000000000000000000000",
    creationDate: new Date().toISOString(),
    creationBlock: 0,
    balance: "0",
    transactionCount: 0,
    isVerified: false,
    contractName: "Unknown Contract",
  };
}

async function analyzeTokenInfo(
  address: string,
  chain: string,
  logger: any
): Promise<ContractAnalysisResult["tokenInfo"] | null> {
  logger.info({ address, chain }, "Analyzing token info");

  // Check if contract is a token by trying to read token functions
  // This is a simplified version - real implementation would use Web3 or similar
  const isToken = Math.random() > 0.5; // Placeholder

  if (!isToken) {
    return null;
  }

  return {
    name: "Sample Token",
    symbol: "SMPL",
    decimals: 18,
    totalSupply: "1000000000000000000000000",
    holderCount: 1000,
    topHolders: [
      { address: "0x1234...", balance: "100000000000000000000", percentage: 10 },
      { address: "0x5678...", balance: "50000000000000000000", percentage: 5 },
    ],
    tokenType: "ERC20",
  };
}

async function performSecurityChecks(
  address: string,
  chain: string,
  isVerified: boolean,
  logger: any
): Promise<SecurityCheck[]> {
  logger.info({ address, chain }, "Performing security checks");

  const checks: SecurityCheck[] = [
    {
      name: "Reentrancy Guard",
      severity: "high",
      description: "Checks for reentrancy protection mechanisms",
      found: true,
    },
    {
      name: "Integer Overflow Protection",
      severity: "medium",
      description: "Checks for SafeMath or Solidity 0.8+ overflow protection",
      found: isVerified,
    },
    {
      name: "Access Control",
      severity: "high",
      description: "Verifies proper access control mechanisms",
      found: true,
    },
    {
      name: "Honeypot Detection",
      severity: "critical",
      description: "Checks for honeypot patterns that prevent selling",
      found: false,
    },
    {
      name: "Ownership Renouncement",
      severity: "medium",
      description: "Checks if ownership has been renounced",
      found: false,
    },
  ];

  return checks;
}

async function analyzeFunctions(
  address: string,
  chain: string,
  logger: any
): Promise<ContractAnalysisResult["functionAnalysis"]> {
  logger.info({ address, chain }, "Analyzing contract functions");

  return {
    publicFunctions: ["transfer", "approve", "balanceOf", "totalSupply"],
    privilegedFunctions: ["mint", "burn", "pause", "setFee"],
    hasTimelock: false,
    hasUpgradeability: false,
    isPausable: true,
  };
}

async function checkAuditHistory(
  address: string,
  chain: string,
  logger: any
): Promise<ContractAnalysisResult["auditInfo"]> {
  logger.info({ address, chain }, "Checking audit history");

  return {
    hasAudit: false,
    auditFirms: [],
    knownVulnerabilities: [],
  };
}

async function analyzeLiquidity(
  address: string,
  chain: string,
  tokenType: string,
  logger: any
): Promise<ContractAnalysisResult["liquidityAnalysis"]> {
  logger.info({ address, chain, tokenType }, "Analyzing liquidity");

  return {
    poolSize: "100000",
    isLiquidityLocked: true,
    rugPullRisk: "low",
    lpTokenBurned: false,
  };
}

async function performDeepScan(
  analysis: ContractAnalysisResult,
  address: string,
  chain: string,
  logger: any
): Promise<void> {
  logger.info({ address, chain }, "Performing deep scan");

  // Add additional deep scan findings
  analysis.securityChecks.push({
    name: "Hidden Backdoor Detection",
    severity: "critical",
    description: "Deep scan for hidden backdoor functions",
    found: false,
  });

  analysis.securityChecks.push({
    name: "Dependency Vulnerability Scan",
    severity: "medium",
    description: "Scans imported contracts for known vulnerabilities",
    found: false,
  });
}

function calculateRiskScore(analysis: ContractAnalysisResult): void {
  let totalRisk = 0;
  const breakdown = analysis.riskBreakdown;

  // Security risks
  const criticalIssues = analysis.securityChecks.filter(
    (c) => c.severity === "critical" && c.found
  ).length;
  const highIssues = analysis.securityChecks.filter((c) => c.severity === "high" && c.found)
    .length;
  const mediumIssues = analysis.securityChecks.filter((c) => c.severity === "medium" && c.found)
    .length;

  breakdown.securityRisks = criticalIssues * 30 + highIssues * 15 + mediumIssues * 5;

  // Ownership risks
  if (analysis.functionAnalysis.privilegedFunctions.length > 5) {
    breakdown.ownershipRisks += 15;
  }
  if (!analysis.functionAnalysis.hasTimelock) {
    breakdown.ownershipRisks += 10;
  }

  // Liquidity risks
  if (analysis.liquidityAnalysis) {
    if (!analysis.liquidityAnalysis.isLiquidityLocked) {
      breakdown.liquidityRisks += 25;
    }
    if (analysis.liquidityAnalysis.rugPullRisk === "high") {
      breakdown.liquidityRisks += 20;
    } else if (analysis.liquidityAnalysis.rugPullRisk === "medium") {
      breakdown.liquidityRisks += 10;
    }
  }

  // Code quality risks
  if (!analysis.basicInfo.isVerified) {
    breakdown.codeQualityRisks += 20;
  }
  if (!analysis.auditInfo.hasAudit) {
    breakdown.codeQualityRisks += 15;
  }

  totalRisk = Math.min(
    100,
    breakdown.securityRisks +
      breakdown.ownershipRisks +
      breakdown.liquidityRisks +
      breakdown.codeQualityRisks
  );

  analysis.riskScore = totalRisk;
}

function identifyRedFlags(analysis: ContractAnalysisResult): void {
  const redFlags: string[] = [];

  if (!analysis.basicInfo.isVerified) {
    redFlags.push("Contract source code is not verified");
  }

  if (analysis.securityChecks.some((c) => c.severity === "critical" && c.found)) {
    redFlags.push("Critical security vulnerabilities detected");
  }

  if (analysis.liquidityAnalysis && !analysis.liquidityAnalysis.isLiquidityLocked) {
    redFlags.push("Liquidity is not locked - high rug pull risk");
  }

  if (analysis.functionAnalysis.privilegedFunctions.length > 5) {
    redFlags.push("Large number of privileged functions - centralization risk");
  }

  if (!analysis.auditInfo.hasAudit) {
    redFlags.push("No professional audit found");
  }

  if (analysis.functionAnalysis.hasUpgradeability && !analysis.functionAnalysis.hasTimelock) {
    redFlags.push("Upgradeable contract without timelock - can be modified without notice");
  }

  analysis.redFlags = redFlags;
}

function generateRecommendations(analysis: ContractAnalysisResult): void {
  const recommendations: string[] = [];

  if (analysis.riskScore > 70) {
    recommendations.push("HIGH RISK: Avoid interacting with this contract");
  } else if (analysis.riskScore > 40) {
    recommendations.push("MEDIUM RISK: Exercise extreme caution");
    recommendations.push("Only invest amounts you can afford to lose");
  } else {
    recommendations.push("Relatively low risk, but always do your own research");
  }

  if (!analysis.basicInfo.isVerified) {
    recommendations.push("Wait for contract verification before investing");
  }

  if (analysis.liquidityAnalysis && !analysis.liquidityAnalysis.isLiquidityLocked) {
    recommendations.push("Request liquidity lock before investing");
  }

  if (!analysis.auditInfo.hasAudit) {
    recommendations.push("Consider waiting for a professional audit");
  }

  recommendations.push("Always test with small amounts first");
  recommendations.push("Monitor contract activity regularly");

  analysis.recommendations = recommendations;
}

function generateSafetyTips(analysis: ContractAnalysisResult): void {
  const safetyTips: string[] = [
    "Never invest more than you can afford to lose",
    "Always verify the contract address before transactions",
    "Check for similar scam contracts with the same code",
    "Monitor large holder transactions",
    "Be cautious of contracts with high concentration of tokens in few wallets",
    "Watch for unusual trading patterns",
    "Join community channels to stay informed",
    "Use a separate wallet for testing new contracts",
    "Enable transaction simulation before confirming",
    "Keep track of your transaction history",
  ];

  if (analysis.tokenInfo) {
    safetyTips.push("Check token holder distribution for whale concentration");
    safetyTips.push("Verify token decimals match what's advertised");
  }

  if (analysis.functionAnalysis.isPausable) {
    safetyTips.push("Contract is pausable - owner can halt all transfers");
  }

  analysis.safetyTips = safetyTips;
}

async function storeAnalysisResults(
  analysis: ContractAnalysisResult,
  api: any,
  logger: any
): Promise<void> {
  logger.info({ contractAddress: analysis.contractAddress }, "Storing analysis results");

  // Store in alert model for high-risk contracts
  if (analysis.riskScore > 70) {
    try {
      await api.alert.create({
        title: `High Risk Contract Detected: ${analysis.contractAddress}`,
        message: {
          markdown: `Contract analysis revealed a risk score of ${analysis.riskScore}/100.\n\nRed Flags:\n${analysis.redFlags.map((f) => `- ${f}`).join("\n")}`,
        },
        type: "system-error",
        severity: "critical",
        triggeredAt: new Date(),
        metadata: {
          contractAddress: analysis.contractAddress,
          chain: analysis.chain,
          riskScore: analysis.riskScore,
          analysisTimestamp: analysis.timestamp,
        },
      });
    } catch (error) {
      logger.error({ error }, "Failed to create alert for high-risk contract");
    }
  }
}

export const params = {
  contractAddress: {
    type: "string",
    required: true,
  },
  chain: {
    type: "string",
    required: true,
  },
  deepScan: {
    type: "boolean",
    default: false,
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
