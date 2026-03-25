import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "aiPrediction" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "hTFrMQGHzivO",
  comment:
    "Stores AI-generated market predictions, including the predicted value, symbol, and confidence level.",
  fields: {
    accuracy: {
      type: "number",
      decimals: 2,
      validations: { numberRange: { min: 0, max: 100 } },
      storageKey: "pjk4M3B9Onsv",
      searchIndex: false,
    },
    actualValue: {
      type: "number",
      decimals: 8,
      storageKey: "fMvhTiSDb12W",
    },
    confidence: {
      type: "number",
      decimals: 2,
      validations: {
        required: true,
        numberRange: { min: 0, max: 100 },
      },
      storageKey: "W476VegdBYJ9",
      searchIndex: false,
    },
    currentValue: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "vPOasRxDmw5L",
    },
    evaluatedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "ofWygfxy_mmp",
      searchIndex: false,
    },
    features: {
      type: "json",
      storageKey: "jU5wbjoWKiMD",
      filterIndex: false,
      searchIndex: false,
    },
    isCorrect: { type: "boolean", storageKey: "1pOdihZeNlNJ" },
    metadata: {
      type: "json",
      storageKey: "xRc8EjIybuv-",
      filterIndex: false,
      searchIndex: false,
    },
    modelVersion: {
      type: "string",
      validations: { required: true },
      storageKey: "6LML7Cw5ES_C",
    },
    predictedValue: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "Ni35ayofmkAC",
    },
    predictionType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "price",
        "direction",
        "volatility",
        "trend",
        "support",
        "resistance",
      ],
      validations: { required: true },
      storageKey: "MTrGCOK35itF",
      searchIndex: false,
    },
    symbol: {
      type: "string",
      validations: { required: true },
      storageKey: "YtxxHWfVqVJJ",
    },
    targetDate: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "diJ6GFoc6eZC",
    },
    tradingBot: {
      type: "belongsTo",
      parent: { model: "tradingBot" },
      storageKey: "oSUGoVQ_w6kp",
    },
  },
};
