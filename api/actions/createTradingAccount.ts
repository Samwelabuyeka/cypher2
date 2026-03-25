import { QuantumCrypto } from "../lib/blockchain/quantum/quantumCrypto";
import crypto from "crypto";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  const { email, password, initialDeposit = 0 } = params;

  logger.info({ email, initialDeposit }, "Creating trading account");

  // Check if user already exists
  let user = await api.user.findFirst({
    filter: { email: { equals: email } },
  });

  // If user doesn't exist, create one
  if (!user) {
    logger.info({ email }, "Creating new user");
    user = await api.user.create({
      email,
      password,
      emailVerified: false,
      roles: ["signed-in"],
    });
  }

  // Initialize quantum crypto for wallet generation
  const quantumCrypto = new QuantumCrypto();
  
  // Generate quantum-resistant key pair
  const { publicKey, privateKey } = await quantumCrypto.generateKeyPair();
  
  // Generate wallet address from public key
  const walletAddress = crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .substring(0, 42);

  // Encrypt private key for secure storage
  const encryptedPrivateKey = await quantumCrypto.encrypt(
    privateKey,
    password
  );

  // Find or create default exchange (using first active exchange)
  let exchange = await api.exchange.findFirst({
    filter: { isActive: { equals: true } },
  });

  if (!exchange) {
    logger.info("Creating default exchange");
    exchange = await api.exchange.create({
      name: "Cypher Exchange",
      code: "CYP",
      isActive: true,
      apiEndpoint: "https://api.cypher.exchange",
      websocketEndpoint: "wss://ws.cypher.exchange",
    });
  }

  // Create trading account
  const tradingAccount = await api.tradingAccount.create({
    accountName: `${email} - Trading Account`,
    user: { _link: user.id },
    exchange: { _link: exchange.id },
    isActive: true,
    isPaperTrading: false,
    balance: {
      CYP: 0,
      USD: initialDeposit,
    },
    riskLimits: {
      maxPositionSize: 10000,
      maxDailyLoss: 1000,
      maxLeverage: 10,
    },
  });

  // Create CYP wallet for the user
  const cypWallet = await api.wallet.create({
    user: { _link: user.id },
    currency: "CYP",
    address: walletAddress,
    balance: 0,
    availableBalance: 0,
    lockedBalance: 0,
    isActive: true,
    network: "Cypher Network",
    metadata: {
      publicKey,
      encryptedPrivateKey,
      quantumResistant: true,
    },
  });

  // If initial deposit provided, create USD wallet
  let usdWallet;
  if (initialDeposit > 0) {
    usdWallet = await api.wallet.create({
      user: { _link: user.id },
      currency: "USD",
      balance: initialDeposit,
      availableBalance: initialDeposit,
      lockedBalance: 0,
      isActive: true,
      metadata: {
        initialDeposit,
      },
    });

    // Create wallet transaction for initial deposit
    await api.walletTransaction.create({
      user: { _link: user.id },
      wallet: { _link: usdWallet.id },
      type: "deposit",
      amount: initialDeposit,
      currency: "USD",
      status: "completed",
      description: "Initial deposit",
      completedAt: new Date(),
    });
  }

  // Generate QR code data for wallet address
  const qrCodeData = {
    address: walletAddress,
    currency: "CYP",
    network: "Cypher Network",
  };

  // Send verification email
  await api.user.sendVerifyEmail({ id: user.id });

  logger.info(
    {
      userId: user.id,
      tradingAccountId: tradingAccount.id,
      walletAddress,
    },
    "Trading account created successfully"
  );

  // Return comprehensive account information
  return {
    success: true,
    account: {
      id: tradingAccount.id,
      accountName: tradingAccount.accountName,
      createdAt: tradingAccount.createdAt,
      status: "active",
      requiresEmailVerification: !user.emailVerified,
    },
    wallet: {
      address: walletAddress,
      publicKey,
      encryptedPrivateKey,
      qrCode: qrCodeData,
      network: "Cypher Network",
    },
    balances: {
      CYP: 0,
      USD: initialDeposit,
    },
    tradingLimits: {
      maxPositionSize: 10000,
      maxDailyLoss: 1000,
      maxLeverage: 10,
    },
    security: {
      twoFactorEnabled: false,
      quantumResistant: true,
      emailVerificationSent: true,
    },
    instructions: {
      deposit: "Transfer funds to your account using the wallet address or through supported payment methods",
      withdraw: "Request withdrawals from your account dashboard - subject to verification",
      trading: "Start trading once your email is verified and you have funds in your account",
      security: "Enable 2FA in account settings for enhanced security",
    },
  };
};

export const params = {
  email: { type: "string", required: true },
  password: { type: "string", required: true },
  initialDeposit: { type: "number", required: false },
};
