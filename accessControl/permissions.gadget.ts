import type { GadgetPermissions } from "gadget-server";

/**
 * This metadata describes the access control configuration available in your application.
 * Grants that are not defined here are set to false by default.
 *
 * View and edit your roles and permissions in the Gadget editor at https://cypher.gadget.app/edit/settings/permissions
 */
export const permissions: GadgetPermissions = {
  type: "gadget/permissions/v1",
  roles: {
    "signed-in": {
      storageKey: "signed-in",
      default: {
        read: true,
        action: true,
      },
      models: {
        aiPrediction: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        alert: {
          read: {
            filter:
              "accessControl/filters/alert/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        apiKey: {
          read: {
            filter:
              "accessControl/filters/apiKey/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        backtestRun: {
          read: {
            filter:
              "accessControl/filters/backtestRun/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        cypherTransaction: {
          read: {
            filter:
              "accessControl/filters/cypherTransaction/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        exchange: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        internalOrderBook: {
          read: {
            filter:
              "accessControl/filters/internalOrderBook/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        marketData: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        miningRig: {
          read: {
            filter:
              "accessControl/filters/miningRig/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        miningSession: {
          read: {
            filter:
              "accessControl/filters/miningSession/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        notification: {
          read: {
            filter:
              "accessControl/filters/notification/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        order: {
          read: {
            filter:
              "accessControl/filters/order/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        paymentMethod: {
          read: {
            filter:
              "accessControl/filters/paymentMethod/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        performanceMetric: {
          read: {
            filter:
              "accessControl/filters/performanceMetric/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        position: {
          read: {
            filter:
              "accessControl/filters/position/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        recurringDeposit: {
          read: {
            filter:
              "accessControl/filters/recurringDeposit/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        strategy: {
          read: {
            filter:
              "accessControl/filters/strategy/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        trade: {
          read: {
            filter:
              "accessControl/filters/trade/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        tradingAccount: {
          read: {
            filter:
              "accessControl/filters/tradingAccount/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        tradingBot: {
          read: {
            filter:
              "accessControl/filters/tradingBot/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        user: {
          read: {
            filter: "accessControl/filters/user/tenant.gelly",
          },
          actions: {
            changePassword: {
              filter: "accessControl/filters/user/tenant.gelly",
            },
            signOut: {
              filter: "accessControl/filters/user/tenant.gelly",
            },
            update: {
              filter: "accessControl/filters/user/tenant.gelly",
            },
          },
        },
        wallet: {
          read: {
            filter:
              "accessControl/filters/wallet/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        walletTransaction: {
          read: {
            filter:
              "accessControl/filters/walletTransaction/signed-in-read.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
      },
    },
    unauthenticated: {
      storageKey: "unauthenticated",
      models: {
        user: {
          actions: {
            resetPassword: true,
            sendResetPassword: true,
            sendVerifyEmail: true,
            signIn: true,
            signUp: true,
            verifyEmail: true,
          },
        },
      },
    },
  },
};
