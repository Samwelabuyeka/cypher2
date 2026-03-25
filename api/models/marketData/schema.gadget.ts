import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "marketData" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "CnwZyprMaHiG",
  fields: {
    askPrice: { type: "number", storageKey: "pCqrih0qzuQJ" },
    bidPrice: { type: "number", storageKey: "V8BI415Fg-ds" },
    close: {
      type: "number",
      validations: { required: true },
      storageKey: "z5TS0uE67E0F",
    },
    exchange: {
      type: "belongsTo",
      parent: { model: "exchange" },
      storageKey: "I-n2bYWMUdQr",
    },
    high: {
      type: "number",
      validations: { required: true },
      storageKey: "-C-y_XkeV_mO",
    },
    interval: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["1m", "5m", "15m", "1h", "4h", "1d", "1w"],
      validations: { required: true },
      storageKey: "YkyTLeOjLJd2",
    },
    low: {
      type: "number",
      validations: { required: true },
      storageKey: "b091d3vL-Qhn",
    },
    marketCap: { type: "number", storageKey: "JASbCBr985LE" },
    metadata: { type: "json", storageKey: "JYhIvAhMRg3u" },
    open: {
      type: "number",
      validations: { required: true },
      storageKey: "cMFmjK7z0JeG",
    },
    spread: { type: "number", storageKey: "4OAwyhatP0Ht" },
    symbol: {
      type: "string",
      validations: { required: true },
      storageKey: "W1fjaadLSW3s",
    },
    timestamp: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "3GgirUHUYEsm",
    },
    volume: {
      type: "number",
      validations: { required: true },
      storageKey: "Irip3tdyAGRy",
    },
    volumeUsd: { type: "number", storageKey: "48NbeyeRw0ls" },
  },
};
