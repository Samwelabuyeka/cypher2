import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "performanceMetric" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "HBtx04FG8kyd",
  comment:
    "Tracks historical performance metrics for strategies, trading accounts, mining rigs, and portfolios. Records P&L, returns, risk metrics, and activity data across configurable time periods. Essential for analyzing performance trends and comparing asset performance over time.",
  fields: {
    fees: { type: "number", decimals: 8, storageKey: "ome8VY9082de" },
    maxDrawdown: {
      type: "number",
      decimals: 2,
      storageKey: "AAEDj5P8h4hD",
      searchIndex: false,
    },
    metricType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "strategy-performance",
        "account-performance",
        "mining-performance",
        "portfolio-performance",
      ],
      validations: { required: true },
      storageKey: "r98JDC57vAy7",
    },
    metrics: { type: "json", storageKey: "NsthCUZRAkv3" },
    miningRig: {
      type: "belongsTo",
      parent: { model: "miningRig" },
      storageKey: "rFRQYCLgacqN",
    },
    numberOfTrades: {
      type: "number",
      default: 0,
      decimals: 0,
      storageKey: "QbwYwYgpyQ_8",
    },
    periodEnd: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "WU4ZgnzQuWgQ",
      searchIndex: false,
    },
    periodStart: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "tjm3bYx4Ye17",
    },
    roi: {
      type: "number",
      decimals: 2,
      storageKey: "R3O3DjyJ7wjc",
      searchIndex: false,
    },
    sharpeRatio: {
      type: "number",
      decimals: 2,
      storageKey: "yHq5SB4bIJni",
      searchIndex: false,
    },
    strategy: {
      type: "belongsTo",
      parent: { model: "strategy" },
      storageKey: "Qn-RsNnH06WM",
    },
    timeframe: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["hourly", "daily", "weekly", "monthly", "yearly"],
      validations: { required: true },
      storageKey: "EtT-QWWbWrvP",
    },
    totalPnL: {
      type: "number",
      decimals: 2,
      storageKey: "UpFk6nPRrg_S",
    },
    totalPnLPercent: {
      type: "number",
      decimals: 2,
      storageKey: "Y9Wmu8DucOG7",
      searchIndex: false,
    },
    tradingAccount: {
      type: "belongsTo",
      parent: { model: "tradingAccount" },
      storageKey: "6N5ZYsAby1b3",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "tOOuDhLJPeM4",
    },
    volume: {
      type: "number",
      decimals: 2,
      storageKey: "y4YoX1vtNBFZ",
    },
    winRate: {
      type: "number",
      decimals: 2,
      storageKey: "I2zR5ajak4Nm",
      searchIndex: false,
    },
  },
};
