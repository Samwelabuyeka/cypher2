import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "miningSession" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "gHk5zuJPhqvV",
  comment:
    "Tracks individual cryptocurrency mining sessions with detailed performance and profitability metrics. Records session duration, hash rates, shares, earnings, power consumption, and net profit to help users monitor rig performance and optimize mining operations.",
  fields: {
    algorithm: {
      type: "string",
      validations: { required: true },
      storageKey: "UcYpCEnT0Gva",
    },
    averageHashrate: {
      type: "number",
      decimals: 2,
      storageKey: "k9ov27eeaXxL",
      searchIndex: false,
    },
    coin: {
      type: "string",
      validations: { required: true },
      storageKey: "9r32PSpMVV_T",
    },
    coinsEarned: { type: "number", storageKey: "hCKBo_Vo47Es" },
    duration: {
      type: "number",
      decimals: 0,
      storageKey: "K3_6SCwuirgK",
      searchIndex: false,
    },
    efficiency: {
      type: "number",
      decimals: 8,
      storageKey: "67ai8yoSkh_O",
    },
    endedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "dnaUDiSqPWex",
    },
    errors: {
      type: "json",
      storageKey: "83cjeukMg3xZ",
      filterIndex: false,
      searchIndex: false,
    },
    miningRig: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "miningRig" },
      storageKey: "_km0fCLvvMTM",
    },
    poolFee: {
      type: "number",
      decimals: 2,
      storageKey: "pGkGM180zgvl",
      searchIndex: false,
    },
    powerCost: {
      type: "number",
      decimals: 2,
      storageKey: "sv1UL5oWPHw9",
      searchIndex: false,
    },
    powerUsed: {
      type: "number",
      decimals: 2,
      storageKey: "VHOHmW8Lgqo6",
      searchIndex: false,
    },
    profit: {
      type: "number",
      decimals: 2,
      storageKey: "AL4mfr-K3Mxi",
      searchIndex: false,
    },
    profitPerHour: {
      type: "number",
      decimals: 2,
      storageKey: "XLOr-aE3hXZc",
      searchIndex: false,
    },
    revenue: {
      type: "number",
      decimals: 2,
      storageKey: "bJHv03eOBAFj",
    },
    sharesAccepted: {
      type: "number",
      default: 0,
      decimals: 0,
      storageKey: "rO0PFAH5yafk",
    },
    sharesRejected: {
      type: "number",
      decimals: 0,
      storageKey: "DbND5WAsAPAZ",
    },
    sharesSubmitted: {
      type: "number",
      default: 0,
      decimals: 0,
      storageKey: "3rT6fc9wrAWR",
    },
    startedAt: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "W3TGoSwGJOh3",
      searchIndex: false,
    },
    temperature: {
      type: "json",
      storageKey: "FJ7NH0wdnUiC",
      filterIndex: false,
      searchIndex: false,
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "cIsoXAtp3pyv",
    },
  },
};
