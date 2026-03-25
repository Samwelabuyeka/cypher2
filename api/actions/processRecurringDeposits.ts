import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const stats = {
    processed: 0,
    successful: 0,
    failed: 0,
    paused: 0,
    completed: 0
  };

  try {
    const dueDeposits = await api.recurringDeposit.findMany({
      filter: {
        isActive: { equals: true },
        nextDepositDate: { lessThanOrEqual: today }
      }
    });

    logger.info({ count: dueDeposits.length }, "Found due recurring deposits");

    for (const deposit of dueDeposits) {
      stats.processed++;
      
      try {
        await api.depositFunds({
          walletId: deposit.walletId,
          amount: deposit.amount,
          currency: deposit.currency
        });

        const nextDate = calculateNextRecurringDate(
          deposit.nextDepositDate,
          deposit.frequency,
          deposit.interval
        );

        const updates: any = {
          successCount: (deposit.successCount || 0) + 1,
          failureCount: 0,
          lastProcessedAt: new Date(),
          nextDepositDate: nextDate
        };

        if (deposit.endDate && nextDate >= deposit.endDate) {
          updates.isActive = false;
          updates.status = "completed";
          stats.completed++;
          logger.info({ depositId: deposit.id }, "Recurring deposit completed");
        }

        await api.recurringDeposit.update(deposit.id, updates);
        stats.successful++;
        
      } catch (error) {
        const failureCount = (deposit.failureCount || 0) + 1;
        const updates: any = {
          failureCount,
          lastProcessedAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error)
        };

        if (failureCount >= 3) {
          updates.isActive = false;
          updates.status = "paused";
          stats.paused++;
          logger.warn({ depositId: deposit.id, failureCount }, "Recurring deposit paused due to failures");
        }

        await api.recurringDeposit.update(deposit.id, updates);
        stats.failed++;
        
        logger.error({ 
          depositId: deposit.id, 
          error: error instanceof Error ? error.message : String(error) 
        }, "Failed to process recurring deposit");
      }
    }

    logger.info(stats, "Recurring deposits processing completed");
    return stats;
    
  } catch (error) {
    logger.error({ error }, "Error processing recurring deposits");
    throw error;
  }
};

function calculateNextRecurringDate(
  currentDate: Date,
  frequency: string,
  interval: number
): Date {
  const next = new Date(currentDate);
  
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + (interval * 7));
      break;
    case "monthly":
      next.setMonth(next.getMonth() + interval);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
  
  return next;
}

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        cron: "0 0 * * *"
      }
    ]
  }
};
