import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "internalOrderBook" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "hUpd9xmjSleh",
  comment:
    "Represents an internal order for trading without external exchanges, linked to a specific user.",
  fields: {
    expiresAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "qSQYOxCyNRdm",
    },
    orderType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["limit", "market"],
      validations: { required: true },
      storageKey: "mnnwkW2au30_",
    },
    price: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "jrKlanRCgOJX",
    },
    quantity: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "lA3gE9GGS9Gl",
    },
    remainingQuantity: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "vXdeUL2IoOcj",
    },
    side: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["buy", "sell"],
      validations: { required: true },
      storageKey: "F6tUcyARGlGj",
    },
    status: {
      type: "enum",
      default: "open",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["open", "partially-filled", "filled", "cancelled"],
      validations: { required: true },
      storageKey: "S2-vOZmPD4x0",
    },
    symbol: {
      type: "string",
      validations: { required: true },
      storageKey: "Is7hQ6NytS-Z",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "u8jMZU02Ljaf",
    },
  },
};
