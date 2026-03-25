import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "backtestRun" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "_AS3F9NaPFKa",
  comment:
    "This model represents a backtest run configuration and result, used to store and display strategy performance metrics.",
  fields: {
    avgLoss: {
      type: "number",
      decimals: 2,
      storageKey: "3YHZH5CcqzBg",
      searchIndex: false,
    },
    avgWin: {
      type: "number",
      decimals: 2,
      storageKey: "mpa0OL4lOYKv",
      searchIndex: false,
    },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "hBYJfZnXweDH",
    },
    endDate: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "TlEijWZlASY6",
    },
    equityCurve: {
      type: "json",
      storageKey: "wz3eRDJrELwo",
      filterIndex: false,
      searchIndex: false,
    },
    errorMessage: {
      type: "string",
      storageKey: "yx__vqeT5Z-a",
      filterIndex: false,
      searchIndex: false,
    },
    initialCapital: {
      type: "number",
      decimals: 2,
      validations: { required: true },
      storageKey: "3lm4OSXrk-Wy",
      searchIndex: false,
    },
    losingTrades: {
      type: "number",
      decimals: 0,
      storageKey: "r6xwDB9ftRzJ",
    },
    maxDrawdown: {
      type: "number",
      decimals: 2,
      storageKey: "SjCE0DSVR1ty",
    },
    maxDrawdownPercent: {
      type: "number",
      decimals: 2,
      storageKey: "qSKR9n0c8dD3",
      searchIndex: false,
    },
    metrics: {
      type: "json",
      storageKey: "slbtdxenxa_9",
      filterIndex: false,
      searchIndex: false,
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "RyigrIv9JnaQ",
    },
    parameters: { type: "json", storageKey: "h6e1z4lLWGXO" },
    profitFactor: {
      type: "number",
      decimals: 4,
      storageKey: "XHZHMR6fvwn8",
      searchIndex: false,
    },
    progress: {
      type: "number",
      default: 0,
      decimals: 2,
      validations: {
        required: true,
        numberRange: { min: 0, max: 100 },
      },
      storageKey: "nJZ0jIJcpfWO",
    },
    sharpeRatio: {
      type: "number",
      decimals: 4,
      storageKey: "mi3458NIIvcT",
    },
    sortinoRatio: {
      type: "number",
      decimals: 4,
      storageKey: "sRIdXayxBUCm",
      searchIndex: false,
    },
    startDate: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "pRoR50FjBxZp",
    },
    startedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "X8OIwzbWS3O-",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      validations: { required: true },
      storageKey: "EaPvzYNIcQi-",
    },
    strategy: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "strategy" },
      storageKey: "gb-0vcuLic14",
    },
    symbols: { type: "json", storageKey: "9J0AEW_MllIs" },
    totalReturn: {
      type: "number",
      decimals: 2,
      storageKey: "Hi8M-W9qBBVB",
    },
    totalReturnPercent: {
      type: "number",
      decimals: 2,
      storageKey: "KPaMn8lkCj_r",
    },
    totalTrades: {
      type: "number",
      decimals: 0,
      storageKey: "XE_wC1PLlwW3",
    },
    trades: {
      type: "json",
      storageKey: "9tAycT4rZbun",
      filterIndex: false,
      searchIndex: false,
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "gqyKgmvSLvo4",
    },
    winRate: {
      type: "number",
      decimals: 2,
      storageKey: "ffTV1pu_vdsz",
    },
    winningTrades: {
      type: "number",
      decimals: 0,
      storageKey: "psRJdeocrLbw",
      searchIndex: false,
    },
  },
};
