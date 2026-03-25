import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const currentUserId = session?.get("user");
  
  if (!currentUserId) {
    throw new Error("User must be authenticated to deposit funds");
  }

  // Validate user matches current session (unless admin override)
  if (params.userId !== currentUserId) {
    throw new Error("Cannot deposit funds for another user");
  }

  // Validate amount
  if (params.amount <= 0) {
    throw new Error("Deposit amount must be greater than 0");
  }

  // Fetch and validate wallet
  const wallet = await api.wallet.findOne(params.walletId, {
    select: {
      id: true,
      userId: true,
      currency: true,
      balance: true,
      availableBalance: true,
      isActive: true,
    },
  });

  // Verify wallet belongs to user
  if (wallet.userId !== currentUserId) {
    throw new Error("Wallet does not belong to the current user");
  }

  // Verify wallet is active
  if (!wallet.isActive) {
    throw new Error("Cannot deposit to an inactive wallet");
  }

  // Verify currency matches
  if (wallet.currency !== params.currency) {
    throw new Error(`Wallet currency (${wallet.currency}) does not match deposit currency (${params.currency})`);
  }

  // Determine if this is an instant deposit
  const instantGateways = ["mpesa", "internal"];
  const isInstantDeposit = params.paymentGateway ? instantGateways.includes(params.paymentGateway.toLowerCase()) : false;

  // Create the wallet transaction
  const transaction = await api.walletTransaction.create({
    user: { _link: currentUserId },
    wallet: { _link: params.walletId },
    amount: params.amount,
    currency: params.currency,
    type: "deposit",
    status: isInstantDeposit ? "completed" : "pending",
    paymentMethod: params.paymentMethodId,
    description: params.note || `Deposit via ${params.paymentGateway || "unknown"}`,
    metadata: {
      paymentGateway: params.paymentGateway,
      externalTransactionId: params.externalTransactionId,
      ...params.metadata,
    },
    completedAt: isInstantDeposit ? new Date() : undefined,
    initiatedAt: new Date(),
  });

  // For instant deposits, update wallet balance immediately
  if (isInstantDeposit) {
    const newBalance = wallet.balance + params.amount;
    const newAvailableBalance = wallet.availableBalance + params.amount;

    await api.wallet.update(params.walletId, {
      balance: newBalance,
      availableBalance: newAvailableBalance,
      lastTransactionAt: new Date(),
    });

    logger.info({
      userId: currentUserId,
      walletId: params.walletId,
      transactionId: transaction.id,
      amount: params.amount,
      currency: params.currency,
      newBalance,
    }, "Instant deposit completed");
  } else {
    logger.info({
      userId: currentUserId,
      walletId: params.walletId,
      transactionId: transaction.id,
      amount: params.amount,
      currency: params.currency,
      status: "pending",
    }, "Pending deposit created");
  }

  return {
    success: true,
    transaction: {
      id: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      type: transaction.type,
      createdAt: transaction.createdAt,
    },
    walletId: params.walletId,
    message: isInstantDeposit 
      ? "Deposit completed successfully" 
      : "Deposit initiated and pending confirmation",
  };
};

export const params = {
  userId: {
    type: "string",
  },
  walletId: {
    type: "string",
  },
  amount: {
    type: "number",
  },
  currency: {
    type: "string",
  },
  paymentMethodId: {
    type: "string",
  },
  paymentGateway: {
    type: "string",
  },
  externalTransactionId: {
    type: "string",
  },
  note: {
    type: "string",
  },
  metadata: {
    type: "object",
    additionalProperties: true,
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
