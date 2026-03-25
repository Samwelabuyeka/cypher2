import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "recurringDeposit" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "DCz2XW9jfHeX",
  comment:
    "This model represents a schedule for automated recurring deposits, allowing users to invest a fixed amount of money at regular intervals.",
  fields: {
    amount: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "RBO-JYrwoAlc",
    },
    currency: {
      type: "string",
      validations: { required: true },
      storageKey: "MBdKNtXXS51p",
    },
    endDate: {
      type: "dateTime",
      includeTime: true,
      validations: { run: ["validateEndDate"] },
      storageKey: "1QhTleQUShLh",
      searchIndex: false,
    },
    failureCount: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "Lp6mEVDan_dN",
      searchIndex: false,
    },
    frequency: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["daily", "weekly", "biweekly", "monthly"],
      validations: { required: true },
      storageKey: "sk6bstVxoG_-",
    },
    interval: {
      type: "number",
      default: 1,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 1, max: null },
      },
      storageKey: "vC64vYphs1az",
      searchIndex: false,
    },
    isActive: {
      type: "boolean",
      default: true,
      validations: { required: true },
      storageKey: "UouPHYTIu9m1",
      searchIndex: false,
    },
    lastError: {
      type: "string",
      storageKey: "u8wbbQpHfqy3",
      filterIndex: false,
    },
    lastProcessedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "Yup9h24seBVV",
      searchIndex: false,
    },
    nextDepositDate: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "UJRAIMH0w-eK",
      searchIndex: false,
    },
    paymentMethod: {
      type: "belongsTo",
      parent: { model: "paymentMethod" },
      storageKey: "scssu1QKnGYb",
    },
    startDate: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true, run: ["validateStartDate"] },
      storageKey: "rzWfAmkgnenG",
    },
    status: {
      type: "enum",
      default: "active",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["active", "paused", "completed", "cancelled"],
      validations: { required: true },
      storageKey: "sya8o-AUv24b",
    },
    successCount: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "lGREKjcC8LC9",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "xD3EEF4vJIIj",
    },
    wallet: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "wallet" },
      storageKey: "14Qk2vftC_t0",
    },
  },
};
