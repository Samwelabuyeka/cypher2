import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "tradingBot" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "5gN57KEpn4hv",
  comment:
    "Autonomous AI-powered trading bot that executes strategies. Tracks bot status, performance metrics (trades executed, win rate, profit), and operational health. Users own bots and configure them with strategies and risk parameters. Primary display shows bot name and status for quick identification and state monitoring.",
  fields: {
    aiModel: {
      type: "string",
      validations: { required: true },
      storageKey: "lHqEmnvGTnsd",
    },
    config: {
      type: "json",
      default: "null",
      storageKey: "8CxwHbBUgYu-",
      filterIndex: false,
      searchIndex: false,
    },
    description: { type: "string", storageKey: "cJWYIe8hO1pO" },
    isActive: {
      type: "boolean",
      default: false,
      validations: { required: true },
      storageKey: "w_QJkvDJXYXe",
      searchIndex: false,
    },
    lastError: {
      type: "string",
      storageKey: "l2eW6PKVAmJf",
      filterIndex: false,
    },
    lastErrorAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "vpj_TCsBlrak",
      searchIndex: false,
    },
    lastTradeAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "feGErk3KoDUj",
    },
    learningEnabled: {
      type: "boolean",
      default: true,
      validations: { required: true },
      storageKey: "aMpM8UL7r7NO",
      searchIndex: false,
    },
    maxDailyLoss: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "crUEyBN-67Ka",
      searchIndex: false,
    },
    maxPositionSize: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "jAcN5xOC53W7",
      searchIndex: false,
    },
    metadata: {
      type: "json",
      storageKey: "npiuxKR-0k5k",
      filterIndex: false,
      searchIndex: false,
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "uJWsn1-4kdsO",
    },
    riskLevel: {
      type: "enum",
      default: "moderate",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["conservative", "moderate", "aggressive", "extreme"],
      validations: { required: true },
      storageKey: "PxZmDFPtRukf",
    },
    startedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "72nwdGCvA0Mx",
      searchIndex: false,
    },
    status: {
      type: "enum",
      default: "stopped",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["stopped", "running", "paused", "error"],
      validations: { required: true },
      storageKey: "kQznwKJcAbJR",
    },
    stoppedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "jGzlVB3DsIAu",
      searchIndex: false,
    },
    strategy: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "strategy" },
      storageKey: "ZWAJUI5wrpAk",
    },
    totalProfit: {
      type: "number",
      default: 0,
      decimals: 8,
      validations: { required: true },
      storageKey: "TOcj2UNI-BLa",
      searchIndex: false,
    },
    totalTrades: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { required: true },
      storageKey: "NwPpTvSw2K_h",
      searchIndex: false,
    },
    tradingPairs: {
      type: "json",
      default: "[]",
      validations: { required: true },
      storageKey: "m4svxLo9RVjJ",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "Fv091mJMpZX5",
    },
    winningTrades: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { required: true },
      storageKey: "tNaY0VnPDOq7",
      searchIndex: false,
    },
  },
};
